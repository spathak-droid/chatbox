# Important Audit Items — TDD Refactoring Design

## Problem

The April 4 2026 security audit flagged 5 IMPORTANT items beyond the critical fixes:

1. **#6** ChatBridgeChat.tsx is 1,196 lines — split into 3-4 components
2. **#7** openrouter.ts is 626 lines — extract tool scoping, message summarization, persistence
3. **#8** ThinkingCharacter.tsx is 532 lines — extract animation hooks
4. **#9** 70% of server code untested — auth, chat routes, OAuth, session management have zero tests
5. **#11** Console.log in production — replace with structured logging

Item #10 (moderation log role check) was already fixed with the critical issues.

## Approach

**Test-as-you-extract with backend-first ordering.** Each module extraction follows a strict cycle:

1. Write tests for the existing function's behavior
2. Extract to a new file with the same signature
3. Update imports in the original file
4. Run tests — must pass identically
5. No behavior changes during extraction

Backend work completes before frontend to harden the security-sensitive code first.

## Phase 1: Extract openrouter.ts (626 → ~200 lines)

### 1a. Extract `tool-scoping.ts`

**Source:** `scopeToolsToIntent()` at openrouter.ts lines 567-626.

**Target:** `server/src/chat/tool-scoping.ts`

**Exports:**
```ts
export function scopeToolsToIntent(
  message: string,
  allTools: ToolSchema[],
  activeAppId: string | null
): ToolSchema[]
```

**Tests:** Already exist at `tests/e2e/tool-scoping.test.ts` (9 cases). Move import to new path. No new tests needed.

### 1b. Extract `message-summarizer.ts`

**Source:** `summarizeOldToolCalls()` at openrouter.ts lines 489-565.

**Target:** `server/src/chat/message-summarizer.ts`

**Exports:**
```ts
export function summarizeOldToolCalls(
  messages: ChatMessage[],
  keepRecentUserMessages?: number
): ChatMessage[]
```

**New tests** at `tests/chat/message-summarizer.test.ts`:
- Empty messages array returns empty
- Messages with no tool calls pass through unchanged
- Old tool_call + tool result pairs collapse to text summaries
- Recent N user messages preserved with their tool context
- Mixed content (text + tools) handles correctly
- Tool result content appears in summary text

### 1c. Extract `message-persistence.ts`

**Source:** `persistAssistantMessage()` at openrouter.ts lines 447-487.

**Target:** `server/src/chat/message-persistence.ts`

**Exports:**
```ts
export async function persistAssistantMessage(
  conversationId: string,
  text: string,
  toolCalls: Array<{ id: string; name: string; args: string }>,
  toolResults: Array<{ toolCallId: string; toolName: string; content: string }>
): Promise<void>
```

**New tests** at `tests/chat/message-persistence.test.ts`:
- Persists assistant text message
- Persists assistant message with tool_calls in tool_result JSONB column
- Persists tool result messages with correct role/tool_call_id
- Handles empty text with tool calls (no empty message row)
- Handles text with no tool calls
- DB errors don't throw (logged, non-fatal — matches current behavior)

### 1d. Extract `app-context.ts`

**Source:** App session injection logic at openrouter.ts lines 28-68.

**Target:** `server/src/chat/app-context.ts`

**Exports:**
```ts
export async function buildAppContext(
  conversationId: string,
  userMessage: string
): Promise<{ activeAppId: string | null; contextLine: string | null }>
```

**New tests** at `tests/chat/app-context.test.ts`:
- No active sessions returns null context
- Active chess session returns sanitized FEN state
- Active calendar session strips tokens
- Multiple sessions returns most recent active
- Intent mismatch returns switching instruction
- Completed sessions excluded

### 1e. Extract `system-prompt.ts`

**Source:** System prompt assembly at openrouter.ts lines 70-163.

**Target:** `server/src/chat/system-prompt.ts`

**Exports:**
```ts
export function buildSystemPrompt(
  appContext: string | null,
  timezone?: string
): string
```

**New tests** at `tests/chat/system-prompt.test.ts`:
- Contains TutorMeAI identity
- Includes app context when provided
- Excludes app context when null
- Includes timezone when provided
- Contains Socratic method instruction
- Contains tool routing instructions

### 1f. Update openrouter.ts

After all extractions, openrouter.ts becomes ~200 lines:
- Imports from the 5 new modules
- `streamChatWithTools()` orchestration: build context → build prompt → scope tools → Pass 1 loop → Pass 2 stream
- No helper functions remain inline

## Phase 2: Backend test coverage (Item #9)

### 2a. Auth routes tests

**File:** `tests/auth/routes.test.ts`

Tests against a live server (same pattern as existing e2e tests):
- POST /auth/register — success, duplicate email (409), missing fields (400)
- POST /auth/login — success, wrong password (401), nonexistent user (401)
- GET /auth/me — valid token returns user, expired/invalid token returns 401

### 2b. Chat routes tests

**File:** `tests/chat/routes.test.ts`

- GET /conversations — returns only own conversations
- GET /conversations/:id/messages — returns 404 for other user's conversation (ownership check)
- DELETE /conversations/:id — returns 404 for other user's conversation
- POST /conversations/:id/sync-app-state — updates session state
- GET /conversations/:id/moderation-log — returns 403 for student role
- GET /conversations/:id/moderation-log — returns 200 for teacher role

### 2c. Session management tests

**File:** `tests/apps/session.test.ts`

- getOrCreateSession creates new session
- getOrCreateSession returns existing active session
- updateSession changes state and status
- getSessionsForConversation returns all sessions

### 2d. OAuth manager tests

**File:** `tests/apps/oauth.test.ts`

- saveOAuthConnection stores encrypted tokens
- getOAuthConnection returns decrypted tokens
- Upsert on duplicate user+provider

## Phase 3: Structured logging (Item #11)

### 3a. Create logger

**File:** `server/src/lib/logger.ts`

Thin wrapper around console with structured output:
```ts
export const log = {
  info(msg: string, data?: Record<string, unknown>): void
  warn(msg: string, data?: Record<string, unknown>): void
  error(msg: string, data?: Record<string, unknown>): void
}
```

- Production (`NODE_ENV=production`): JSON lines (`{"level":"info","msg":"...","data":{...},"ts":"..."}`)
- Development: Pretty format (`[INFO] msg { data }`)

### 3b. Replace console.log calls

Target locations from audit:
- openrouter.ts:177, 266
- routes.ts:241

Also replace any other `console.log`/`console.error` in server/src/ with `log.*` calls.

## Phase 4: Split ChatBridgeChat.tsx (1,196 → ~400 lines)

### 4a. Extract `MessageBubble.tsx`

**Source:** Lines 1115-1196 of ChatBridgeChat.tsx (already a separate function).

**Target:** `src/renderer/components/chatbridge/MessageBubble.tsx`

Self-contained component, no logic changes. Move and update import.

### 4b. Extract `useChatMessages.ts`

**Source:** sendMessage() (lines 232-480), message state, SSE parsing logic.

**Target:** `src/renderer/components/chatbridge/hooks/useChatMessages.ts`

**Exports:**
```ts
export function useChatMessages(options: {
  onAppStart: (appId: string, toolName: string) => void
  onPendingConfirmation: (actions: PendingAction[]) => void
}) => {
  messages, setMessages,
  input, setInput,
  loading, streaming, toolExecuting,
  conversationId,
  conversations,
  sendMessage,
  loadConversation, loadConversations,
  startNewChat, deleteConversation,
}
```

### 4c. Extract `useAppPanel.ts`

**Source:** Panel management state (lines 482-556), activePanel/secondaryPanel effects.

**Target:** `src/renderer/components/chatbridge/hooks/useAppPanel.ts`

**Exports:**
```ts
export function useAppPanel(messages: ChatMessage[]) => {
  activePanel, setActivePanel,
  secondaryPanel, setSecondaryPanel,
  dismissedSessionsRef,
  closeApp,
}
```

### 4d. Extract `ConfirmActionsCard.tsx`

**Source:** Pending confirmation card UI (lines ~930-962).

**Target:** `src/renderer/components/chatbridge/ConfirmActionsCard.tsx`

**Props:**
```ts
interface Props {
  actions: PendingAction[]
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}
```

### 4e. Extract `chatEventHandlers.ts`

**Source:** confirmActions, cancelActions, handleStateChange, handleGameEvent, handleGameOver, fireConfetti (lines 557-784).

**Target:** `src/renderer/components/chatbridge/chatEventHandlers.ts`

Pure functions and event handlers that take state setters as parameters.

### 4f. Reassemble ChatBridgeChat.tsx

After extraction, the main component is ~400 lines:
- Hook calls (useChatMessages, useAppPanel)
- Render layout (sidebar, chat area, right panel)
- Wiring hooks to child components

## Phase 5: Split ThinkingCharacter.tsx (532 → ~200 lines)

### 5a. Extract `useCharacterAnimation.ts`

**Source:** startMoodAnimation (lines 114-188), selected animation effect (lines 237-276), persistent idle effect (lines 278-309).

**Target:** `src/renderer/components/chatbridge/hooks/useCharacterAnimation.ts`

**Exports:**
```ts
export function useCharacterAnimation(
  refs: CharacterRefs,
  mode: CharacterMode,
  selected: boolean
): void
```

### 5b. Extract `useCharacterMovement.ts`

**Source:** walkTo (lines 73-98), roaming effect (lines 311-335), follow cursor effect (lines 382-483).

**Target:** `src/renderer/components/chatbridge/hooks/useCharacterMovement.ts`

**Exports:**
```ts
export function useCharacterMovement(
  refs: CharacterRefs & { containerRef: React.RefObject<HTMLDivElement> },
  mode: CharacterMode,
  followCursor: boolean
): void
```

### 5c. Extract `useCharacterDrag.ts`

**Source:** handleMouseDown (lines 190-232).

**Target:** `src/renderer/components/chatbridge/hooks/useCharacterDrag.ts`

**Exports:**
```ts
export function useCharacterDrag(
  outerRef: React.RefObject<HTMLDivElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  callbacks: { onDragStart: () => void }
): { onMouseDown: (e: React.MouseEvent) => void }
```

### 5d. Extract shared `CharacterRefs` type

**Target:** `src/renderer/components/chatbridge/types.ts`

```ts
export interface CharacterRefs {
  bodyRef: React.RefObject<SVGRectElement>
  leftEyeRef: React.RefObject<SVGEllipseElement>
  // ... all 12 SVG refs + animation timeline refs
}

export type CharacterMode = 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'celebrating' | 'confused'
```

### 5e. Reassemble ThinkingCharacter.tsx

After extraction, ~200 lines:
- Ref declarations
- Hook calls (useCharacterAnimation, useCharacterMovement, useCharacterDrag)
- SVG render

## Files Changed Summary

### New Files (23)
| File | Purpose |
|------|---------|
| `server/src/chat/tool-scoping.ts` | Intent detection + tool filtering |
| `server/src/chat/message-summarizer.ts` | Old tool call collapse |
| `server/src/chat/message-persistence.ts` | DB persistence of assistant messages |
| `server/src/chat/app-context.ts` | App session context builder |
| `server/src/chat/system-prompt.ts` | System prompt assembly |
| `server/src/lib/logger.ts` | Structured logging |
| `server/tests/chat/message-summarizer.test.ts` | Summarizer tests |
| `server/tests/chat/message-persistence.test.ts` | Persistence tests |
| `server/tests/chat/app-context.test.ts` | App context tests |
| `server/tests/chat/system-prompt.test.ts` | System prompt tests |
| `server/tests/auth/routes.test.ts` | Auth endpoint tests |
| `server/tests/chat/routes.test.ts` | Chat endpoint tests |
| `server/tests/apps/session.test.ts` | Session management tests |
| `server/tests/apps/oauth.test.ts` | OAuth manager tests |
| `src/renderer/components/chatbridge/MessageBubble.tsx` | Message bubble component |
| `src/renderer/components/chatbridge/ConfirmActionsCard.tsx` | Confirmation card |
| `src/renderer/components/chatbridge/hooks/useChatMessages.ts` | Chat message hook |
| `src/renderer/components/chatbridge/hooks/useAppPanel.ts` | App panel hook |
| `src/renderer/components/chatbridge/chatEventHandlers.ts` | Event handler functions |
| `src/renderer/components/chatbridge/hooks/useCharacterAnimation.ts` | Character animation hook |
| `src/renderer/components/chatbridge/hooks/useCharacterMovement.ts` | Character movement hook |
| `src/renderer/components/chatbridge/hooks/useCharacterDrag.ts` | Character drag hook |
| `src/renderer/components/chatbridge/types.ts` | Shared types |

### Modified Files (5)
| File | Change |
|------|--------|
| `server/src/chat/openrouter.ts` | 626 → ~200 lines, imports from extracted modules |
| `src/renderer/components/chatbridge/ChatBridgeChat.tsx` | 1,196 → ~400 lines, uses extracted hooks/components |
| `src/renderer/components/chatbridge/ThinkingCharacter.tsx` | 532 → ~200 lines, uses extracted hooks |
| `server/tests/e2e/tool-scoping.test.ts` | Update import path |
| Various server/src/*.ts | Replace console.log with log.* |

## Constraints

- Zero behavior changes — pure extraction refactoring
- Every extraction has tests before and after
- Existing tests must pass at every step
- No new dependencies added
- Frontend hooks tested via existing app (manual verification) — no new React test framework required
