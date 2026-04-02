# Tool Execution Architecture — Decouple LLM from Tool Side Effects

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three remaining architectural problems that prompt engineering can't solve: (1) LLM says "Done!" before confirmation, (2) stale app context bleeds across intents, (3) tool call history pollutes future responses.

**Architecture:** Two-pass LLM approach. Pass 1: LLM proposes tool calls (no text streamed to user). Code validates, intercepts destructive ops. Pass 2: After tools execute (or get queued for confirmation), LLM generates user-facing text with actual results. This eliminates optimistic "Done!" messages and gives code full control over what executes.

**Tech Stack:** Node.js, Express, OpenRouter API, vitest

---

## Problem Analysis

### Problem 1: Optimistic Text
**Current:** LLM generates "Done! I've deleted your study plan" + calls `calendar_delete_event` simultaneously. Our code intercepts the tool into pending confirmation, but the text already streamed to the user.

**Fix:** Two-pass approach. First pass: get tool calls only (suppress text). Second pass: after tools resolve, ask LLM to summarize what happened.

### Problem 2: Stale App Context
**Current:** `[Active app: google-calendar, state: {...}]` stays in context even when user says "Let's play chess". The LLM sees calendar is active and tries to clean it up before switching.

**Fix:** When dynamic tool scoping detects a different intent than the active app, remove the active app context from the system prompt. Let the tool router handle session cleanup programmatically.

### Problem 3: Confirmation UX
**Current:** Confirmation card appears but LLM already said "deleted!" above it. User is confused.

**Fix:** When destructive tools are detected in Pass 1, skip Pass 2 entirely. Show ONLY the confirmation card. After user confirms/cancels, then generate the response text.

---

## File Structure

| File | Change |
|---|---|
| `server/src/chat/openrouter.ts` | Two-pass LLM, context cleaning, confirmation flow |
| `server/src/chat/routes.ts` | Confirm endpoint returns LLM-generated summary |
| `server/src/apps/tool-router.ts` | No changes (confirmation interception already works) |
| `src/renderer/components/chatbridge/ChatBridgeChat.tsx` | Suppress assistant text when confirmation pending |
| `server/tests/e2e/tool-execution.test.ts` | New tests for two-pass flow |

---

### Task 1: Two-Pass LLM — Separate Tool Selection from Response

**Files:**
- Modify: `server/src/chat/openrouter.ts`

**Current flow:**
```
User message → LLM(tools + stream text) → text + tool_calls streamed together
```

**New flow:**
```
User message → LLM(tools, no stream) → get tool_calls only
  → if destructive tools: return pending_confirmation, NO text
  → if safe tools: execute tools
  → LLM(no tools, stream text) → generate response based on actual results
```

- [ ] **Step 1: Add a non-streaming first pass to get tool calls**

In `streamChatWithTools`, before the main loop, do a non-streaming call to get tool proposals:

```typescript
// Pass 1: Get tool calls (non-streaming, no text output to user)
const proposalResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({
    model: config.openrouterModel,
    messages: currentMessages,
    tools: scopedTools.length > 0 ? scopedTools : undefined,
    stream: false,  // non-streaming
  }),
})
const proposal = await proposalResponse.json()
const proposedToolCalls = proposal.choices?.[0]?.message?.tool_calls || []
```

- [ ] **Step 2: Handle destructive tools — return confirmation, no text**

```typescript
const hasDestructive = proposedToolCalls.some(tc => DESTRUCTIVE_TOOLS.has(tc.function.name))

if (hasDestructive) {
  // Queue all tool calls for confirmation
  for (const tc of proposedToolCalls) {
    // ... queue via routeToolCall (which intercepts destructive ones)
  }
  // Send ONLY the pending_confirmation event, no text
  res.write(`data: ${JSON.stringify({ type: 'pending_confirmation', actions: pendingActions })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
  return
}
```

- [ ] **Step 3: Execute safe tools, then generate response text**

```typescript
// Execute safe tools
const toolResults = []
for (const tc of proposedToolCalls) {
  const result = await routeToolCall(tc.function.name, JSON.parse(tc.function.arguments), context)
  toolResults.push({ toolCallId: tc.id, toolName: tc.function.name, result })
  // Stream tool_call and tool_result events to frontend
  res.write(`data: ${JSON.stringify({ type: 'tool_call', ...tc })}\n\n`)
  res.write(`data: ${JSON.stringify({ type: 'tool_result', ...result })}\n\n`)
}

// Pass 2: Generate user-facing text based on actual results
// Add tool results to messages, then call LLM again WITHOUT tools
currentMessages.push({ role: 'assistant', content: '', tool_calls: proposedToolCalls })
for (const tr of toolResults) {
  currentMessages.push({ role: 'tool', content: JSON.stringify(tr.result), tool_call_id: tr.toolCallId })
}

// Stream the response text (no tools available = LLM just generates text)
const textResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  body: JSON.stringify({ model: config.openrouterModel, messages: currentMessages, stream: true }),
})
// ... stream text to user
```

- [ ] **Step 4: Run tests**
- [ ] **Step 5: Commit**

---

### Task 2: Clean App Context When Switching

**Files:**
- Modify: `server/src/chat/openrouter.ts` (app context injection section)

- [ ] **Step 1: Detect intent mismatch with active app**

After dynamic tool scoping, check if the user's intent differs from the active app:

```typescript
const activeApp = relevantSessions.find(s => s.status === 'active')
const intentApp = wantsChess ? 'chess' : wantsMath ? 'math-practice' : wantsFlashcards ? 'flashcards' : wantsCalendar ? 'google-calendar' : null

if (activeApp && intentApp && activeApp.appId !== intentApp) {
  // User wants a different app — don't inject the old app's context
  // Just note that a switch is happening
  appContext = `[Switching from ${activeApp.appId} to ${intentApp}. End the old app and start the new one.]`
}
```

- [ ] **Step 2: Run tests**
- [ ] **Step 3: Commit**

---

### Task 3: Frontend — Suppress Text When Confirmation Pending

**Files:**
- Modify: `src/renderer/components/chatbridge/ChatBridgeChat.tsx`

- [ ] **Step 1: Detect `pending_confirmation` SSE event**

In the SSE event handler, when `pending_confirmation` event arrives, don't show any assistant text — only show the confirmation card:

```typescript
case 'pending_confirmation': {
  setPendingActions(event.actions)
  // Remove the assistant message that was being built (it has optimistic text)
  setMessages(prev => prev.filter(m => m.id !== assistantMsgId))
  scrollToBottom()
  break
}
```

- [ ] **Step 2: After confirm, show the actual result as a new message**

The confirm endpoint should return the LLM-generated summary. Display it as a new assistant message.

- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

---

### Task 4: Confirm Endpoint Returns LLM Summary

**Files:**
- Modify: `server/src/chat/routes.ts`

- [ ] **Step 1: After executing confirmed actions, generate summary via LLM**

```typescript
chatRoutes.post('/conversations/:id/confirm-actions', requireAuth, async (req, res, next) => {
  const results = await executePendingActions(req.params.id, { userId, authToken })

  // Generate a brief summary via LLM
  const summaryMessages = [
    { role: 'system', content: 'Summarize what happened in 1 sentence for a student.' },
    { role: 'user', content: `These calendar actions were completed: ${JSON.stringify(results.map(r => r.summary))}` },
  ]
  // ... call LLM non-streaming for summary

  res.json({ ok: true, results, summary })
})
```

- [ ] **Step 2: Frontend displays the summary as assistant message**
- [ ] **Step 3: Commit**

---

### Task 5: E2E Tests for New Flow

**Files:**
- Create: `server/tests/e2e/tool-execution.test.ts`

- [ ] **Step 1: Test that destructive tool doesn't generate optimistic text**

```typescript
it('calendar_delete_event returns pending_confirmation without text', async () => {
  // Start calendar, create event, then ask to delete
  // Verify: no "Done!" text, only pending_confirmation event
})
```

- [ ] **Step 2: Test that switching apps doesn't leak old context**

```typescript
it('switching from calendar to chess does not call calendar tools', async () => {
  // Open calendar, then say "let's play chess"
  // Verify: only chess_start_game called, no calendar_delete_event
})
```

- [ ] **Step 3: Test confirm flow end-to-end**

```typescript
it('confirm-actions executes pending deletions', async () => {
  // Trigger delete (gets pending), then call confirm endpoint
  // Verify: event actually deleted from Google Calendar
})
```

- [ ] **Step 4: Commit**

---

### Task 6: Update Memory and Cleanup

- [ ] **Step 1: Update project memory with new architecture**
- [ ] **Step 2: Remove debug console.logs**
- [ ] **Step 3: Run full test suite**
- [ ] **Step 4: Commit and push**
