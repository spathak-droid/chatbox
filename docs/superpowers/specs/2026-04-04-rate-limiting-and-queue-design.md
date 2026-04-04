# Rate Limiting & LLM Request Queue

## Overview

Add two layers of request protection to the ChatBridge server:
1. In-memory per-user rate limiting on `/api/chat/send` (15 msgs/min default)
2. BullMQ + Redis request queue with concurrency control for LLM calls (10 concurrent default)

## Rate Limiting

### Mechanism
- In-memory `Map<userId, { count: number, windowStart: number }>` in a new middleware
- Sliding window: when `Date.now() - windowStart > 60_000`, reset count to 0
- Applied only to `POST /api/chat/send` — reads (conversations, manifests, health) are unlimited
- Cleanup: every 5 minutes, purge entries older than 60 seconds to prevent memory leaks

### Response on limit exceeded
- HTTP `429 Too Many Requests`
- Body: `{ error: "Rate limit exceeded", retryAfter: <seconds until window resets> }`
- `Retry-After` header set to remaining seconds

### Frontend handling
- When `sendMessage` receives a 429 response, show inline error text: "Slow down — try again in X seconds"
- No automatic retry loop — student must send again manually

### Configuration
- `RATE_LIMIT_PER_MIN` env var, default `15`

## BullMQ Request Queue

### How it works today
`POST /send` → insert user message → call `streamChatWithTools(messages, conversationId, userId, res, ...)` → SSE streams directly on the Express `res` object. No queue, no concurrency control.

### How it works with the queue
`POST /send` → insert user message → set SSE headers → add job to BullMQ queue → worker picks it up when a slot is available (max 10 concurrent) → worker calls `streamChatWithTools()` with the original `res` object → SSE streams as before.

The SSE connection stays open from the moment the request arrives. The queue only controls *when* the LLM call starts, not how the response streams back. From the frontend's perspective, nothing changes — it sees "Thinking..." until the response streams in.

### Queue setup
- Queue name: `llm-requests`
- Redis connection via `REDIS_URL` env var
- Worker concurrency: `QUEUE_CONCURRENCY` env var, default `10`
- Job timeout: `QUEUE_JOB_TIMEOUT` env var, default `120000` (2 minutes)
- Job data: `{ conversationId, userId, messages, authToken, timezone }` — everything `streamChatWithTools` needs except `res`
- The `res` object is NOT passed through Redis. Instead, the worker is in-process and accesses `res` via a local Map keyed by job ID.

### Architecture
A local in-process pattern (not a distributed worker):
1. Request arrives → generate a unique job ID
2. Store `res` in a local `Map<jobId, Response>`
3. Add job to BullMQ queue with the job ID and chat params
4. BullMQ worker (same process) picks up the job, retrieves `res` from the Map
5. Worker calls `streamChatWithTools()` with that `res`
6. On complete/error, remove entry from the Map

This gives us concurrency control (BullMQ only runs N jobs at once) while keeping the SSE streaming pattern intact.

### Graceful fallback
- **No `REDIS_URL` set (local dev):** Queue is not initialized. `POST /send` calls `streamChatWithTools()` directly, exactly like today. Zero behavior change.
- **Redis goes down:** New requests fall back to direct execution with a `console.warn`. Jobs already running continue normally.
- **Job timeout:** After 120 seconds (configurable), the job fails. The SSE connection receives an error event: `{ type: 'error', error: 'Request timed out' }` and closes.

## Environment Variables

| Variable | Default | Required | Purpose |
|----------|---------|----------|---------|
| `REDIS_URL` | *(none)* | No (queue disabled without it) | Redis connection for BullMQ |
| `RATE_LIMIT_PER_MIN` | `15` | No | Max chat messages per user per minute |
| `QUEUE_CONCURRENCY` | `10` | No | Max parallel LLM calls |
| `QUEUE_JOB_TIMEOUT` | `120000` | No | Job timeout in milliseconds |

## Files

### New files
- `server/src/middleware/rate-limiter.ts` — rate limiting middleware + cleanup interval
- `server/src/queue/llm-queue.ts` — BullMQ queue + worker setup, Redis connection, res Map

### Modified files
- `server/src/config.ts` — add `redisUrl`, `rateLimitPerMin`, `queueConcurrency`, `queueJobTimeout`
- `server/src/chat/routes.ts` — wrap `streamChatWithTools()` call with queue dispatch (or direct call if no Redis)
- `server/src/index.ts` — apply rate limiter middleware, initialize queue on startup

### Dependencies
- `bullmq` — BullMQ queue library
- `ioredis` — Redis client (peer dependency of BullMQ)

## What this does NOT include
- Distributed workers (multi-server scaling) — single process only for now
- Response caching
- WebSocket replacement for SSE
- Per-user priority in the queue
- Admin dashboard for queue monitoring
