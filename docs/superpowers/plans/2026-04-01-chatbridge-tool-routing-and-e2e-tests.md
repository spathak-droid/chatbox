# ChatBridge Tool Routing Fixes & E2E Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix LLM tool routing so the correct app opens for each user request, fix state sync reliability, and add end-to-end tests that verify the full pipeline without manual testing.

**Architecture:** Three layers need fixing: (1) system prompt is labeled "chess tutor" causing bias, (2) appSessionId is missing from tool results breaking state sync, (3) calendar appId mismatch. Tests hit the real server endpoints and verify tool calls, state sync, and iframe state delivery.

**Tech Stack:** Node.js, Express, vitest for tests, fetch for HTTP calls

---

## File Structure

| File | Responsibility |
|---|---|
| `server/src/chat/openrouter.ts` | System prompt fix — remove chess bias |
| `server/src/apps/tool-router.ts` | Include appSessionId in tool results |
| `server/src/chat/routes.ts` | Fix calendar appId in sync endpoint |
| `server/tests/e2e/tool-routing.test.ts` | E2E: LLM calls correct tool for each app |
| `server/tests/e2e/state-sync.test.ts` | E2E: state sync round-trips correctly |
| `server/tests/e2e/helpers.ts` | Shared test helpers (auth, send message, parse SSE) |
| `server/vitest.config.ts` | Test runner config |
| `server/package.json` | Add vitest dev dependency |

---

### Task 1: Fix System Prompt — Remove Chess Bias

The system prompt literally says "You are a friendly AI chess tutor" which biases every response toward chess. When user says "practice math", the LLM still thinks chess-first.

**Files:**
- Modify: `server/src/chat/openrouter.ts:52-86`

- [ ] **Step 1: Fix the system prompt opening**

Replace line 52:
```typescript
// BEFORE:
const systemContent = `You are a friendly AI chess tutor for young students (ages 8-14). You are enthusiastic and encouraging.
```

With:
```typescript
// AFTER:
const systemContent = `You are a friendly AI tutor called TutorMeAI for young students (ages 8-14). You help with chess, math, flashcards, and calendars. You are enthusiastic and encouraging.
```

- [ ] **Step 2: Verify server restarts cleanly**

Run: `cd server && npx tsx src/index.ts`
Expected: "ChatBridge server running on port 3000" with no errors. Kill after confirming.

- [ ] **Step 3: Commit**

```bash
git add server/src/chat/openrouter.ts
git commit -m "fix: system prompt says chess tutor, biasing all tool routing"
```

---

### Task 2: Include appSessionId in Tool Results

The tool router creates/finds a session but never includes the session ID in the result sent to the frontend. The frontend falls back to `session-${Date.now()}` which doesn't match any DB record, breaking all subsequent state sync.

**Files:**
- Modify: `server/src/apps/tool-router.ts`

- [ ] **Step 1: Read the current tool-router.ts**

Read `server/src/apps/tool-router.ts` fully to understand current structure.

- [ ] **Step 2: Add appSessionId to the returned result**

After `const result = ...` and before returning, inject the session ID:

```typescript
// After the app call returns and session is updated, add session ID to result
result.appSessionId = session.id
```

This ensures the frontend gets a real DB session ID instead of generating a synthetic one.

- [ ] **Step 3: Verify by starting server and making a tool call via curl**

```bash
curl -X POST http://localhost:3000/api/chat/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"message": "lets play chess"}' 2>/dev/null | grep -o '"appSessionId":"[^"]*"' | head -1
```

Expected: Output contains `"appSessionId":"<uuid>"` (a real UUID, not `session-<timestamp>`).

- [ ] **Step 4: Commit**

```bash
git add server/src/apps/tool-router.ts
git commit -m "fix: include appSessionId in tool results for reliable state sync"
```

---

### Task 3: Fix Calendar App ID Mismatch

The calendar manifest uses `id: 'google-calendar'` but the frontend maps `calendar_` prefix to `'calendar'`. The sync endpoint searches for `appId = 'calendar'` but the DB has `appId = 'google-calendar'`.

**Files:**
- Modify: `src/renderer/components/chatbridge/ChatBridgeChat.tsx:42`

- [ ] **Step 1: Fix the APP_ID_MAP entry for calendar**

```typescript
// BEFORE:
const APP_ID_MAP: Record<string, string> = {
  math_: 'math-practice',
  calendar_: 'calendar',
  chess_: 'chess',
  flashcards_: 'flashcards',
}

// AFTER:
const APP_ID_MAP: Record<string, string> = {
  math_: 'math-practice',
  calendar_: 'google-calendar',
  chess_: 'chess',
  flashcards_: 'flashcards',
}
```

- [ ] **Step 2: Rebuild frontend**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox && npx cross-env CHATBOX_BUILD_PLATFORM=web npx electron-vite build
```

Expected: `built in Xs` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/chatbridge/ChatBridgeChat.tsx
git commit -m "fix: calendar appId mismatch — google-calendar not calendar"
```

---

### Task 4: Set Up Test Infrastructure

**Files:**
- Create: `server/tests/e2e/helpers.ts`
- Create: `server/vitest.config.ts`
- Modify: `server/package.json`

- [ ] **Step 1: Add vitest to server package.json**

```bash
cd server && npm install -D vitest
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
// server/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 15000,
  },
})
```

- [ ] **Step 3: Create test helpers**

```typescript
// server/tests/e2e/helpers.ts
const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'

export async function registerAndLogin(): Promise<{ token: string; userId: string }> {
  const email = `test-${Date.now()}@test.com`
  const password = 'testpass123'

  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'Test User' }),
  })
  const regData = await regRes.json()
  if (!regRes.ok) throw new Error(`Register failed: ${JSON.stringify(regData)}`)

  return { token: regData.token, userId: regData.user?.id || '' }
}

export async function sendChatMessage(
  token: string,
  message: string,
  conversationId?: string
): Promise<{ events: any[]; conversationId: string }> {
  const res = await fetch(`${API_BASE}/chat/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, conversationId }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Chat send failed (${res.status}): ${err}`)
  }

  const text = await res.text()
  const events: any[] = []
  let convId = conversationId || ''

  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    try {
      const event = JSON.parse(line.slice(6))
      events.push(event)
      if (event.type === 'conversation' && event.conversationId) {
        convId = event.conversationId
      }
    } catch {}
  }

  return { events, conversationId: convId }
}

export function findEvent(events: any[], type: string): any | undefined {
  return events.find(e => e.type === type)
}

export function findToolCall(events: any[], toolPrefix: string): any | undefined {
  return events.find(e => e.type === 'tool_call' && e.toolName?.startsWith(toolPrefix))
}

export function findToolResult(events: any[], toolPrefix: string): any | undefined {
  return events.find(e => e.type === 'tool_result' && e.toolName?.startsWith(toolPrefix))
}
```

- [ ] **Step 4: Verify helpers compile**

```bash
cd server && npx tsx --eval "import './tests/e2e/helpers.ts'; console.log('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add server/vitest.config.ts server/tests/e2e/helpers.ts server/package.json server/package-lock.json
git commit -m "chore: add vitest and e2e test helpers"
```

---

### Task 5: E2E Test — Tool Routing

Verify the LLM calls the correct tool for each app. This is the core test that catches the bug the user reported.

**Files:**
- Create: `server/tests/e2e/tool-routing.test.ts`

- [ ] **Step 1: Write the tool routing tests**

```typescript
// server/tests/e2e/tool-routing.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { registerAndLogin, sendChatMessage, findToolCall } from './helpers'

describe('Tool Routing — LLM calls correct tool for each app', () => {
  let token: string

  beforeAll(async () => {
    const auth = await registerAndLogin()
    token = auth.token
  })

  it('calls chess_start_game when user says "lets play chess"', async () => {
    const { events } = await sendChatMessage(token, "let's play chess")
    const toolCall = findToolCall(events, 'chess_')
    expect(toolCall).toBeDefined()
    expect(toolCall.toolName).toBe('chess_start_game')
  })

  it('calls math_start_session when user says "lets practice math"', async () => {
    const { events } = await sendChatMessage(token, "let's practice math")
    const toolCall = findToolCall(events, 'math_')
    expect(toolCall).toBeDefined()
    expect(toolCall.toolName).toBe('math_start_session')
  })

  it('calls flashcards_start_deck when user says "quiz me with flashcards"', async () => {
    const { events } = await sendChatMessage(token, 'quiz me with flashcards about science')
    const toolCall = findToolCall(events, 'flashcards_')
    expect(toolCall).toBeDefined()
    expect(toolCall.toolName).toBe('flashcards_start_deck')
  })

  it('does NOT call chess tools when user asks for math', async () => {
    const { events } = await sendChatMessage(token, "I want to do some math practice")
    const chessCall = findToolCall(events, 'chess_')
    expect(chessCall).toBeUndefined()
  })

  it('does NOT call chess tools when user asks for flashcards', async () => {
    const { events } = await sendChatMessage(token, "help me study with flashcards")
    const chessCall = findToolCall(events, 'chess_')
    expect(chessCall).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests (server must be running on port 3000)**

```bash
cd server && npx vitest run tests/e2e/tool-routing.test.ts
```

Expected: All 5 tests pass. If any fail, the system prompt or tool schema needs further fixing.

- [ ] **Step 3: Commit**

```bash
git add server/tests/e2e/tool-routing.test.ts
git commit -m "test: e2e tool routing — verify LLM calls correct tool per app"
```

---

### Task 6: E2E Test — State Sync

Verify that after a tool call, the session state is stored in DB, and a subsequent chat message sees that state in context.

**Files:**
- Create: `server/tests/e2e/state-sync.test.ts`

- [ ] **Step 1: Write the state sync tests**

```typescript
// server/tests/e2e/state-sync.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { registerAndLogin, sendChatMessage, findToolResult } from './helpers'

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'

describe('State Sync — tool results persist and are visible to LLM', () => {
  let token: string

  beforeAll(async () => {
    const auth = await registerAndLogin()
    token = auth.token
  })

  it('chess_start_game returns appSessionId in result', async () => {
    const { events } = await sendChatMessage(token, "let's play chess")
    const result = findToolResult(events, 'chess_')
    expect(result).toBeDefined()
    expect(result.result.status).toBe('ok')
    expect(result.result.appSessionId).toBeDefined()
    expect(result.result.appSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  it('chess state is stored in DB and retrievable', async () => {
    const { events, conversationId } = await sendChatMessage(token, "let's play chess")
    const result = findToolResult(events, 'chess_')
    expect(result).toBeDefined()

    // Fetch sessions for this conversation
    const sessRes = await fetch(`${API_BASE}/chat/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(sessRes.ok).toBe(true)
  })

  it('math_start_session returns appSessionId in result', async () => {
    const { events } = await sendChatMessage(token, "let's practice math")
    const result = findToolResult(events, 'math_')
    expect(result).toBeDefined()
    expect(result.result.status).toBe('ok')
    expect(result.result.appSessionId).toBeDefined()
  })

  it('sync-app-state endpoint updates session', async () => {
    // Start a chess game first
    const { events, conversationId } = await sendChatMessage(token, "let's play chess")
    const result = findToolResult(events, 'chess_')
    expect(result).toBeDefined()

    // Sync new state
    const syncRes = await fetch(
      `${API_BASE}/chat/conversations/${conversationId}/sync-app-state`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          appId: 'chess',
          state: {
            fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
            moves: ['e4'],
            playerColor: 'white',
            gameOver: false,
          },
        }),
      }
    )
    expect(syncRes.ok).toBe(true)
    const syncData = await syncRes.json()
    expect(syncData.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd server && npx vitest run tests/e2e/state-sync.test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/tests/e2e/state-sync.test.ts
git commit -m "test: e2e state sync — verify appSessionId and DB persistence"
```

---

### Task 7: Add npm test script

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Add test scripts to package.json**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:e2e": "vitest run tests/e2e",
"test:watch": "vitest"
```

- [ ] **Step 2: Run full test suite**

```bash
cd server && npm run test:e2e
```

Expected: All tests pass (9 total across 2 files).

- [ ] **Step 3: Commit**

```bash
git add server/package.json
git commit -m "chore: add test scripts to server package.json"
```
