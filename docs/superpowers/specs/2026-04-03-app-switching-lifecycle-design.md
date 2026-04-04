# App Switching Lifecycle Design

## Problem

When users switch between apps (chess → math, etc.) or close apps, the transition is abrupt:

- No summary/discussion of the closed app's state
- Old app sidebar just disappears without farewell
- LLM doesn't always call end tools before starting new apps
- No fallback when LLM fails to follow the close-then-open sequence
- Calendar has no end tool at all

## Approach

**LLM-driven with platform harness.** The LLM is responsible for calling end tools before start tools. The platform validates this happened correctly and provides a graceful fallback when it doesn't.

## Design

### 1. Ideal Flow (LLM calls end + start correctly)

When user says "let's practice math" while chess is active:

1. Pass 1: LLM calls `chess_end_game` → tool result with game summary
2. Pass 1: LLM calls `math_start_session` → tool result with new session
3. Frontend receives `end_game` result → closes chess sidebar, adds "Chess app closed." note
4. Frontend receives `start_session` result → opens math sidebar
5. Pass 2: LLM generates one message covering both ("Great chess game! ...Now let's do math!")

The system prompt already instructs the LLM to end the old app first. The `[Switching from X to Y]` context injection at openrouter.ts line 45 drives this.

### 2. Fallback — LLM fails to close old app

When LLM calls `math_start_session` without calling `chess_end_game`:

**Backend:**

- `routeToolCall` allows the start tool (no rejection)
- Returns result with a warning flag: `{ _warning: 'previous_app_still_active', _previousAppId: 'chess' }`

**Frontend — split panel mode:**

- Detects new app iframe arriving while activePanel shows a different app
- Switches to split layout in the sidebar:
  - Top half: new app (math) — active, interactive
  - Bottom half: old app (chess) — still visible, has its own X close button
  - Warning text between them: "You have two apps open. Close one using the X button."
- When user clicks X on old app → normal close flow (see section 3)
- Panel returns to single mode showing only the remaining app

**Frontend detection logic:** No backend flag needed. The frontend checks: "activePanel exists for app A, and a new tool_result arrived for app B without an end/finish tool firing in between."

### 3. Manual Close (X button) triggers LLM summary

When user clicks X to close an app:

1. **Immediate:** Panel closes, "Chess app closed." note appears in chat
2. **Async:** Background request sent to backend with a system-injected message:
  - `[User closed {appId}. Summarize the session briefly and say goodbye. Be cheerful, 1-2 sentences.]`
  - Include sanitized game state (FEN/score/progress — NOT tokens, NOT user IDs)
3. **LLM streams** a farewell message as a new assistant bubble: "Nice game! You had a strong opening with your knight. Come back anytime!"
4. **Server:** Session marked `completed`

The close is instant. The summary arrives async — user isn't blocked.

### 4. Game Over / Auto-close

When an app sends `gameOver: true` via state change:

1. `handleGameOver` fires → confetti if won → 3-second delay
2. After delay: same flow as X button close (panel closes, LLM summary requested)
3. Session marked `completed`

### 5. Edge Cases

**Calendar has no end tool:**

- Add `calendar_end_session` tool to the calendar app manifest and tools
- Lightweight — marks session completed, doesn't hit Google API

**User closes app while LLM is mid-stream:**

- Panel closes immediately
- Farewell summary request queued after current stream ends

**Same app restart ("start a new chess game" while chess active):**

- LLM should call `chess_end_game` then `chess_start_game`
- If LLM just calls `chess_start_game`, `getOrCreateSession` returns existing session (same app) — no split needed
- System prompt already says: "If the EXACT SAME app is active → Do NOT call start tools"

**Double rapid switch (chess → "flashcards" immediately after "math"):**

- Normal flow: LLM ends chess, starts math. Then LLM ends math, starts flashcards.
- Fallback: split mode can show at most 2 apps. If a third arrives, the oldest non-active panel is force-closed.

## Files to Change


| File                                      | Change                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `ChatBridgeChat.tsx`                      | Split panel mode, X-button LLM summary trigger, end-tool detection in stream |
| `openrouter.ts`                           | Endpoint for close-summary requests, sanitize state before LLM context       |
| `tool-router.ts`                          | Warning flag when start tool called with active different-app session        |
| `apps/google-calendar/server/manifest.ts` | Add `calendar_end_session` tool                                              |
| `apps/google-calendar/server/tools.ts`    | Implement `calendar_end_session` handler                                     |


## Out of Scope (for now)

- Full data sanitization layer for LLM context (separate task)
- Persisting split-panel state across page refreshes

