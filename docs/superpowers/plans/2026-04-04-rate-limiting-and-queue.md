# Rate Limiting & LLM Request Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user rate limiting (15 msgs/min) and a BullMQ request queue with concurrency control (10 parallel LLM calls) to the ChatBridge server.

**Architecture:** Rate limiting is a simple Express middleware with an in-memory Map. The BullMQ queue wraps the existing `streamChatWithTools()` call — a local in-process worker picks up jobs and runs them with a concurrency limit. A `Map<jobId, Response>` bridges the queue (which can't serialize Express Response objects) to the SSE streaming. If no Redis URL is configured, everything falls back to direct execution (no behavior change for local dev).

**Tech Stack:** Express middleware, BullMQ, ioredis

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/config.ts` | Modify | Add `redisUrl`, `rateLimitPerMin`, `queueConcurrency`, `queueJobTimeout` |
| `server/src/middleware/rate-limiter.ts` | Create | Per-user rate limiting middleware |
| `server/src/queue/llm-queue.ts` | Create | BullMQ queue + worker setup, Redis connection, Response Map |
| `server/src/chat/routes.ts` | Modify | Use queue for `/send` instead of direct `streamChatWithTools()` call |
| `server/src/index.ts` | Modify | Apply rate limiter, initialize queue on startup |

---

### Task 1: Install dependencies and update config

**Files:**
- Modify: `server/package.json`
- Modify: `server/src/config.ts`

- [ ] **Step 1: Install bullmq and ioredis**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && source ~/.nvm/nvm.sh && nvm use 22 && pnpm add bullmq ioredis
```

- [ ] **Step 2: Add new config values**

In `server/src/config.ts`, add after the `appUrls` block (before the closing `}`):

```typescript
  redisUrl: process.env.REDIS_URL || '',
  rateLimitPerMin: parseInt(process.env.RATE_LIMIT_PER_MIN || '15', 10),
  queueConcurrency: parseInt(process.env.QUEUE_CONCURRENCY || '10', 10),
  queueJobTimeout: parseInt(process.env.QUEUE_JOB_TIMEOUT || '120000', 10),
```

- [ ] **Step 3: Verify config loads**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && npx tsx -e "import { config } from './src/config.js'; console.log('rateLimitPerMin:', config.rateLimitPerMin, 'queueConcurrency:', config.queueConcurrency, 'redisUrl:', config.redisUrl || '(none)')"
```

Expected: `rateLimitPerMin: 15 queueConcurrency: 10 redisUrl: (none)`

- [ ] **Step 4: Commit**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && git add package.json pnpm-lock.yaml src/config.ts
git commit -m "chore: add bullmq, ioredis dependencies and queue config"
```

---

### Task 2: Create rate limiter middleware

**Files:**
- Create: `server/src/middleware/rate-limiter.ts`

- [ ] **Step 1: Create the rate limiter**

Create `server/src/middleware/rate-limiter.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express'
import { config } from '../config.js'

interface RateWindow {
  count: number
  windowStart: number
}

const userWindows = new Map<string, RateWindow>()

// Purge expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, window] of userWindows) {
    if (now - window.windowStart > 60_000) {
      userWindows.delete(key)
    }
  }
}, 5 * 60 * 1000)

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id
  if (!userId) return next()

  const now = Date.now()
  const limit = config.rateLimitPerMin

  let window = userWindows.get(userId)
  if (!window || now - window.windowStart > 60_000) {
    window = { count: 0, windowStart: now }
    userWindows.set(userId, window)
  }

  window.count++

  if (window.count > limit) {
    const retryAfter = Math.ceil((window.windowStart + 60_000 - now) / 1000)
    res.setHeader('Retry-After', String(retryAfter))
    return res.status(429).json({
      error: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      retryAfter,
    })
  }

  next()
}
```

- [ ] **Step 2: Verify the module loads**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && npx tsx -e "import { rateLimiter } from './src/middleware/rate-limiter.js'; console.log('rateLimiter type:', typeof rateLimiter)"
```

Expected: `rateLimiter type: function`

- [ ] **Step 3: Commit**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && git add src/middleware/rate-limiter.ts
git commit -m "feat: add per-user in-memory rate limiter middleware"
```

---

### Task 3: Apply rate limiter to chat send route

**Files:**
- Modify: `server/src/chat/routes.ts`

- [ ] **Step 1: Import and apply rate limiter**

In `server/src/chat/routes.ts`, add the import at the top (after the other imports):

```typescript
import { rateLimiter } from '../middleware/rate-limiter.js'
```

Change the `/send` route declaration from:

```typescript
chatRoutes.post('/send', async (req, res, next) => {
```

To:

```typescript
chatRoutes.post('/send', rateLimiter, async (req, res, next) => {
```

- [ ] **Step 2: Verify the server starts without errors**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && npx tsx -e "import './src/chat/routes.js'; console.log('routes loaded OK')"
```

Expected: `routes loaded OK` (may show DB connection warnings — that's fine)

- [ ] **Step 3: Commit**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && git add src/chat/routes.ts
git commit -m "feat: apply rate limiter to POST /send"
```

---

### Task 4: Create BullMQ queue with graceful fallback

**Files:**
- Create: `server/src/queue/llm-queue.ts`

- [ ] **Step 1: Create the queue module**

Create `server/src/queue/llm-queue.ts`:

```typescript
import { Queue, Worker } from 'bullmq'
import type { Response } from 'express'
import { config } from '../config.js'
import { streamChatWithTools } from '../chat/openrouter.js'

interface LlmJobData {
  jobId: string
  conversationId: string
  userId: string
  messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: any[] }>
  authToken: string
  timezone?: string
}

// Local map: jobId -> Express Response (can't serialize through Redis)
const responseMap = new Map<string, Response>()

let queue: Queue | null = null
let worker: Worker | null = null
let initialized = false

export function isQueueEnabled(): boolean {
  return initialized && queue !== null
}

export async function initQueue(): Promise<void> {
  if (!config.redisUrl) {
    console.log('[Queue] No REDIS_URL set — running without queue (direct execution)')
    return
  }

  try {
    const connection = { url: config.redisUrl }

    queue = new Queue('llm-requests', { connection })

    worker = new Worker(
      'llm-requests',
      async (job) => {
        const data = job.data as LlmJobData
        const res = responseMap.get(data.jobId)

        if (!res || res.writableEnded) {
          responseMap.delete(data.jobId)
          console.warn(`[Queue] Response gone for job ${data.jobId}, skipping`)
          return
        }

        try {
          await streamChatWithTools(
            data.messages,
            data.conversationId,
            data.userId,
            res,
            data.authToken,
            data.timezone,
          )
        } finally {
          responseMap.delete(data.jobId)
        }
      },
      {
        connection,
        concurrency: config.queueConcurrency,
      },
    )

    worker.on('failed', (job, err) => {
      console.error(`[Queue] Job ${job?.id} failed:`, err.message)
      if (job) {
        const data = job.data as LlmJobData
        const res = responseMap.get(data.jobId)
        if (res && !res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'error', error: 'Request timed out or failed' })}\n\n`)
          res.write('data: [DONE]\n\n')
          res.end()
        }
        responseMap.delete(data.jobId)
      }
    })

    // Verify connection
    await queue.waitUntilReady()
    initialized = true
    console.log(`[Queue] Connected to Redis, concurrency: ${config.queueConcurrency}`)
  } catch (err) {
    console.warn('[Queue] Failed to connect to Redis:', (err as Error).message)
    console.warn('[Queue] Falling back to direct execution')
    queue = null
    worker = null
  }
}

export async function enqueueChat(
  jobId: string,
  res: Response,
  data: Omit<LlmJobData, 'jobId'>,
): Promise<void> {
  if (!queue) {
    // Fallback: direct execution
    await streamChatWithTools(
      data.messages,
      data.conversationId,
      data.userId,
      res,
      data.authToken,
      data.timezone,
    )
    return
  }

  // Store response for worker to retrieve
  responseMap.set(jobId, res)

  // Clean up if client disconnects before job runs
  res.on('close', () => {
    responseMap.delete(jobId)
  })

  try {
    await queue.add('chat', { ...data, jobId }, {
      removeOnComplete: true,
      removeOnFail: 100,
      timeout: config.queueJobTimeout,
    })
  } catch (err) {
    // Queue add failed — fall back to direct execution
    responseMap.delete(jobId)
    console.warn('[Queue] Failed to enqueue, falling back to direct:', (err as Error).message)
    await streamChatWithTools(
      data.messages,
      data.conversationId,
      data.userId,
      res,
      data.authToken,
      data.timezone,
    )
  }
}

export async function shutdownQueue(): Promise<void> {
  if (worker) await worker.close()
  if (queue) await queue.close()
}
```

- [ ] **Step 2: Verify the module loads**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && npx tsx -e "import { isQueueEnabled, enqueueChat } from './src/queue/llm-queue.js'; console.log('queue module loaded, enabled:', isQueueEnabled())"
```

Expected: `queue module loaded, enabled: false` (no Redis URL set)

- [ ] **Step 3: Commit**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && git add src/queue/llm-queue.ts
git commit -m "feat: add BullMQ queue with Redis fallback for LLM calls"
```

---

### Task 5: Wire queue into chat routes

**Files:**
- Modify: `server/src/chat/routes.ts`

- [ ] **Step 1: Replace direct streamChatWithTools call with enqueueChat**

In `server/src/chat/routes.ts`, add the import at the top:

```typescript
import { enqueueChat } from '../queue/llm-queue.js'
```

Remove the existing `streamChatWithTools` import:

```typescript
// REMOVE this line:
import { streamChatWithTools } from './openrouter.js'
```

In the `/send` handler, replace the direct call (lines 74-75):

```typescript
    const authToken = (req.headers.authorization || '').replace('Bearer ', '')
    await streamChatWithTools(messages, conversationId, userId, res, authToken, body.timezone)
```

With:

```typescript
    const authToken = (req.headers.authorization || '').replace('Bearer ', '')
    const jobId = `chat-${conversationId}-${Date.now()}`
    await enqueueChat(jobId, res, {
      messages,
      conversationId,
      userId,
      authToken,
      timezone: body.timezone,
    })
```

- [ ] **Step 2: Verify the module loads with new imports**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && npx tsx -e "import './src/chat/routes.js'; console.log('routes loaded OK')"
```

Expected: `routes loaded OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && git add src/chat/routes.ts
git commit -m "feat: route chat send through BullMQ queue"
```

---

### Task 6: Initialize queue on server startup

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Import and initialize queue in start function**

In `server/src/index.ts`, add the import at the top:

```typescript
import { initQueue } from './queue/llm-queue.js'
```

In the `start()` function, add the queue initialization after `await initDb()` and before the app registration loop:

```typescript
async function start() {
  await initDb()
  await initQueue()

  const appEndpoints = [
```

- [ ] **Step 2: Verify server starts cleanly without Redis**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && timeout 5 npx tsx src/index.ts 2>&1 || true
```

Expected output should include:
- `Database connected`
- `[Queue] No REDIS_URL set — running without queue (direct execution)`
- `ChatBridge server running on port 3000`

- [ ] **Step 3: Commit**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && git add src/index.ts
git commit -m "feat: initialize LLM queue on server startup"
```

---

### Task 7: Test end-to-end locally (no Redis)

**Files:** None (verification only)

- [ ] **Step 1: Restart the server**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox
kill -9 $(lsof -ti:3000) 2>/dev/null
sleep 1
(cd server && npx tsx src/index.ts &)
sleep 5
curl -m 3 -s http://localhost:3000/api/health
```

Expected: `{"status":"ok","timestamp":...}`

Verify the logs show:
- `[Queue] No REDIS_URL set — running without queue (direct execution)`

- [ ] **Step 2: Test rate limiting with rapid requests**

This requires authentication. Test by sending a chat message through the UI at http://localhost:1212. Send 16+ messages rapidly — after 15 the chat bubble should show "Rate limit exceeded. Try again in X seconds."

- [ ] **Step 3: Verify normal chat still works**

Send a normal message, wait for response. Verify SSE streaming works as before — the fallback (no Redis) should behave identically to the old code path.

- [ ] **Step 4: Commit (final)**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox/server && git add -A
git commit -m "feat: rate limiting (15/min) and BullMQ queue with Redis fallback"
```
