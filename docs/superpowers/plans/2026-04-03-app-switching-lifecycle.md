# App Switching Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make app transitions feel alive — proper close/summary before opening new apps, split-panel fallback when LLM skips the close, and async LLM farewell on manual close.

**Architecture:** LLM-driven switching (end tool + start tool). Backend validates and warns. Frontend handles split-panel fallback and async farewell requests. New `calendar_end_session` tool added.

**Tech Stack:** React (Mantine UI), Express backend, OpenRouter LLM streaming, SSE

---

### Task 1: Add `calendar_end_session` tool

Calendar is the only app without an end tool. Add one so the LLM can close it like other apps.

**Files:**
- Modify: `apps/google-calendar/server/manifest.ts` (add tool to tools array)
- Modify: `apps/google-calendar/server/tools.ts` (add handler)

- [ ] **Step 1: Add tool to manifest**

In `apps/google-calendar/server/manifest.ts`, add to the `tools` array after the last entry (before the closing `]`):

```ts
    {
      name: 'calendar_end_session',
      description: 'End the current calendar/study planner session. Call this when the user wants to switch to a different app or is done with the calendar.',
      parameters: [],
    },
```

- [ ] **Step 2: Add handler in tools.ts**

In `apps/google-calendar/server/tools.ts`, add case in the `handleTool` switch statement:

```ts
    case 'calendar_end_session':
      return {
        status: 'ok',
        data: { finished: true },
        summary: 'Calendar session ended.',
      }
```

- [ ] **Step 3: Verify server starts**

Run: `cd /Users/san/Desktop/Gauntlet/chatbox && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -i calendar`
Expected: Only pre-existing errors (activationKeywords), no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/google-calendar/server/manifest.ts apps/google-calendar/server/tools.ts
git commit -m "feat: add calendar_end_session tool for proper app switching"
```

---

### Task 2: Update system prompt to require end tool before start tool

The current prompt says "The platform auto-closes the old app" which is a lie. Fix it to tell the LLM to always call end tools and always discuss the closed app.

**Files:**
- Modify: `server/src/chat/openrouter.ts:86-126` (system prompt)

- [ ] **Step 1: Update Step 2 in the system prompt**

In `server/src/chat/openrouter.ts`, replace this section of the system content string:

```
Step 2: Is that EXACT app already active? (check "[Active app: X]" in app context below)
- YES, the EXACT SAME app is listed as "[Active app: X]" → Do NOT call start tools. Just chat about it.
- NO, a DIFFERENT app is active → Call the start tool for the NEW app. The platform auto-closes the old app.
- NO app is active (all completed or none) → Call the start tool for the requested app.
- A "Completed app" is NOT active. If user asks for an app that was previously completed, start it fresh.
```

With:

```
Step 2: Is that EXACT app already active? (check "[Active app: X]" in app context below)
- YES, the EXACT SAME app is listed as "[Active app: X]" → Do NOT call start tools. Just chat about it.
- NO, a DIFFERENT app is active → You MUST call the end tool FIRST (chess_end_game, math_finish_session, flashcards_finish_deck, or calendar_end_session), THEN call the start tool for the new app. Both in the same response.
- NO app is active (all completed or none) → Call the start tool for the requested app.
- A "Completed app" is NOT active. If user asks for an app that was previously completed, start it fresh.

Step 2b: After ending an app, ALWAYS briefly discuss what happened in it (1-2 sentences). Examples:
- Chess: "Nice game! You had a strong position." or "That was a tough one — want to try again later?"
- Math: "You got 7 out of 10 right — great work on those multiplication problems!"
- Flashcards: "You reviewed 12 cards and got most of them right!"
- Calendar: "Your study schedule is all set!"
Then transition to the new app.
```

- [ ] **Step 2: Also add calendar_end_session to Step 3 defaults**

After the existing defaults, add:

```
- calendar_end_session: no parameters needed
```

- [ ] **Step 3: Update the switching context injection**

In `server/src/chat/openrouter.ts`, find the line (around line 45):
```ts
return `[Switching from ${activeSession.appId} to ${intentApp}. End the old app and start the new one.]`
```

Replace with:
```ts
return `[Switching from ${activeSession.appId} to ${intentApp}. You MUST call the end tool for ${activeSession.appId} first, then the start tool for ${intentApp}. Briefly discuss what happened in ${activeSession.appId} before moving on.]`
```

- [ ] **Step 4: Commit**

```bash
git add server/src/chat/openrouter.ts
git commit -m "feat: update system prompt to require end tool and farewell on app switch"
```

---

### Task 3: Frontend — detect end tools in stream and show close note

When the streaming response includes an end/finish tool, immediately show a "closed" note in chat and close the sidebar — before the start tool arrives.

**Files:**
- Modify: `src/renderer/components/chatbridge/ChatBridgeChat.tsx:321-365` (tool_result handler in stream)

- [ ] **Step 1: Add end-tool detection in the tool_result stream handler**

In `ChatBridgeChat.tsx`, in the `case 'tool_result'` block, after `const isEndTool = /end_game|finish|stop/.test(toolName)` (around line 324), add handling for end tools:

```ts
              case 'tool_result': {
                const toolName = event.toolName
                const isEndTool = /end_game|finish|stop|end_session/.test(toolName)

                // When an end tool fires, close the sidebar and add a close note
                if (isEndTool) {
                  const appId = getAppIdFromToolName(toolName)
                  const appLabel = appId
                    ? appId.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                    : 'App'
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `close-${Date.now()}`,
                      role: 'assistant',
                      content: `\u{1F4CB} ${appLabel} closed.`,
                    },
                  ])
                  // Mark session as dismissed so it doesn't reopen
                  if (activePanel?.appId === appId) {
                    dismissedSessionsRef.current.add(activePanel.appSessionId)
                    setActivePanel(null)
                  }
                }

                const iframeUrl = isEndTool ? null : getAppIframeUrl(toolName)
                const appId = getAppIdFromToolName(toolName)
                // ... rest of existing code unchanged
```

Note: The `activePanel` variable needs to be accessible inside `sendMessage`. Since `sendMessage` is a `useCallback`, add `activePanel` to its dependency array.

- [ ] **Step 2: Update end-tool regex in activePanel useEffect**

In the `useEffect` that updates activePanel (around line 456), update the regex to include `end_session`:

```ts
      if (msg.toolCalls?.some(tc => tc.name.includes('end_game') || tc.name.includes('finish') || tc.name.includes('end_session'))) {
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/san/Desktop/Gauntlet/chatbox && npx tsc --noEmit --project tsconfig.json 2>&1 | grep ChatBridgeChat`
Expected: Only pre-existing import.meta errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/chatbridge/ChatBridgeChat.tsx
git commit -m "feat: show close note and clear sidebar when end tool fires in stream"
```

---

### Task 4: Frontend — split panel fallback when LLM skips end tool

When a new app iframe arrives while a different app is already in `activePanel`, show both in a split layout.

**Files:**
- Modify: `src/renderer/components/chatbridge/ChatBridgeChat.tsx` (state, activePanel effect, sidebar rendering)

- [ ] **Step 1: Add `secondaryPanel` state**

After the `activePanel` state declaration (around line 417), add:

```ts
  const [secondaryPanel, setSecondaryPanel] = useState<{
    appId: string
    iframeUrl: string
    sessionState: Record<string, unknown>
    appSessionId: string
  } | null>(null)
```

- [ ] **Step 2: Update the activePanel useEffect to detect split-panel scenario**

Replace the `setActivePanel` call inside the iframe-found branch of the useEffect (around line 448):

```ts
        setActivePanel((prev) => {
          // If a different app is already active, push it to secondary (split mode)
          if (prev && prev.appId !== latest.appId && !dismissedSessionsRef.current.has(prev.appSessionId)) {
            setSecondaryPanel(prev)
          }
          if (prev?.appSessionId === latest.appSessionId && prev?.sessionState === latest.sessionState) return prev
          return latest
        })
```

- [ ] **Step 3: Clear secondaryPanel when end tools fire or no iframes**

In the same useEffect, where `setActivePanel(null)` is called (line 457 and 463), also clear secondary:

```ts
      if (msg.toolCalls?.some(tc => tc.name.includes('end_game') || tc.name.includes('finish') || tc.name.includes('end_session'))) {
        setActivePanel(null)
        setSecondaryPanel(null)
        return
      }
    }
    setActivePanel(null)
    setSecondaryPanel(null)
```

- [ ] **Step 4: Update sidebar rendering for split mode**

Replace the entire `{/* Right panel — active app */}` section (around line 847-896) with:

```tsx
      {/* Right panel — active app(s) */}
      {(activePanel || secondaryPanel) && (
        <Box
          style={{
            width: 440,
            minWidth: 440,
            height: '100vh',
            borderLeft: '1px solid var(--mantine-color-dark-5)',
            background: 'var(--mantine-color-dark-8)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Primary panel (new app) */}
          {activePanel && (
            <>
              <Group p="sm" justify="space-between" style={{ flex: '0 0 auto', borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
                <Text size="sm" fw={600} c="white" tt="capitalize">
                  {activePanel.appId.replace(/-/g, ' ')}
                </Text>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => closeApp(activePanel)}>
                  <IconX size={14} />
                </ActionIcon>
              </Group>
              <Box style={{ flex: 1, padding: 8, minHeight: 0 }}>
                <AppIframe
                  appId={activePanel.appId}
                  iframeUrl={activePanel.iframeUrl}
                  sessionState={activePanel.sessionState}
                  appSessionId={activePanel.appSessionId}
                  onToolRequest={handleToolRequest}
                  onGameOver={handleGameOver}
                  onStateChange={handleStateChange}
                  platformToken={token}
                  fillHeight
                />
              </Box>
            </>
          )}

          {/* Split mode warning + secondary panel (old app that wasn't closed) */}
          {secondaryPanel && (
            <>
              <Box px="sm" py={6} style={{ background: 'var(--mantine-color-yellow-9)', flex: '0 0 auto' }}>
                <Text size="xs" c="white" ta="center">
                  Two apps open — close one using the X button
                </Text>
              </Box>
              <Group p="sm" justify="space-between" style={{ flex: '0 0 auto', borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
                <Text size="sm" fw={600} c="white" tt="capitalize">
                  {secondaryPanel.appId.replace(/-/g, ' ')}
                </Text>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => closeApp(secondaryPanel)}>
                  <IconX size={14} />
                </ActionIcon>
              </Group>
              <Box style={{ flex: 1, padding: 8, minHeight: 0 }}>
                <AppIframe
                  appId={secondaryPanel.appId}
                  iframeUrl={secondaryPanel.iframeUrl}
                  sessionState={secondaryPanel.sessionState}
                  appSessionId={secondaryPanel.appSessionId}
                  onToolRequest={handleToolRequest}
                  onGameOver={handleGameOver}
                  onStateChange={handleStateChange}
                  platformToken={token}
                  fillHeight
                />
              </Box>
            </>
          )}
        </Box>
      )}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/chatbridge/ChatBridgeChat.tsx
git commit -m "feat: split panel fallback when LLM opens new app without closing old one"
```

---

### Task 5: Extract `closeApp` helper and wire X button + LLM farewell

Extract the X-button close logic into a reusable `closeApp` function. Make it: (1) close the panel immediately, (2) add a close note, (3) fire an async LLM farewell request.

**Files:**
- Modify: `src/renderer/components/chatbridge/ChatBridgeChat.tsx` (new closeApp callback, update X buttons)
- Modify: `server/src/chat/routes.ts` (new `/close-app` endpoint)
- Modify: `server/src/chat/openrouter.ts` (or reuse `streamChatWithTools` with a synthetic message)

- [ ] **Step 1: Add the `/close-app` backend endpoint**

In `server/src/chat/routes.ts`, after the `cancel-actions` route, add:

```ts
// Close an app and request LLM farewell summary
chatRoutes.post('/conversations/:id/close-app', requireAuth, async (req, res, next) => {
  try {
    const { appId, appState } = z.object({
      appId: z.string(),
      appState: z.record(z.unknown()).optional(),
    }).parse(req.body)

    const conversationId = req.params.id
    const userId = req.user!.id

    // Mark the session as completed
    const sessions = await getSessionsForConversation(conversationId)
    const session = sessions.find(s => s.appId === appId && s.status === 'active')
    if (session) {
      await query(
        `UPDATE app_sessions SET status = 'completed', summary = 'Closed by user', updated_at = NOW() WHERE id = $1`,
        [session.id]
      )
    }

    // Build a sanitized state summary for the LLM (no tokens, no user IDs)
    const sanitizedState = sanitizeStateForLLM(appId, appState || {})

    // Generate farewell via LLM
    let farewell = ''
    try {
      const farewellResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://chatbridge.app',
        },
        body: JSON.stringify({
          model: config.openrouterModel,
          messages: [
            { role: 'system', content: 'You are TutorMeAI, a friendly tutor for students ages 8-14. The user just closed an app. Give a brief, cheerful 1-2 sentence farewell summarizing what happened. No emojis unless it fits naturally.' },
            { role: 'user', content: `The user closed ${appId}. Session state: ${sanitizedState}` },
          ],
          stream: false,
        }),
      })
      if (farewellResponse.ok) {
        const data = await farewellResponse.json()
        farewell = data.choices?.[0]?.message?.content || ''
      }
    } catch {
      // Fallback — no farewell if LLM fails
    }

    // Persist farewell as assistant message
    if (farewell) {
      await query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [conversationId, 'assistant', farewell]
      )
    }

    res.json({ ok: true, farewell })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 2: Add `sanitizeStateForLLM` helper**

In `server/src/chat/routes.ts`, add this helper function before the routes:

```ts
function sanitizeStateForLLM(appId: string, state: Record<string, unknown>): string {
  // Strip sensitive fields — never send tokens, IDs, or internal flags to LLM
  const SENSITIVE_KEYS = ['accessToken', 'access_token', 'refreshToken', 'refresh_token', 'platformToken', 'userId', 'user_id', '_refreshTrigger']

  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(state)) {
    if (!SENSITIVE_KEYS.includes(key)) {
      clean[key] = value
    }
  }

  // App-specific summaries for better LLM context
  switch (appId) {
    case 'chess': {
      const parts: string[] = []
      if (clean.fen) parts.push(`Position: ${clean.fen}`)
      if (clean.moves) parts.push(`Moves played: ${Array.isArray(clean.moves) ? clean.moves.length : clean.moves}`)
      if (clean.gameOver) parts.push(`Game over: ${clean.result || 'unknown'}`)
      if (clean.playerColor) parts.push(`Playing as: ${clean.playerColor}`)
      return parts.length > 0 ? parts.join('. ') : 'Chess game in progress.'
    }
    case 'math-practice': {
      const parts: string[] = []
      if (clean.correct !== undefined) parts.push(`Correct: ${clean.correct}`)
      if (clean.incorrect !== undefined) parts.push(`Incorrect: ${clean.incorrect}`)
      if (clean.topic) parts.push(`Topic: ${clean.topic}`)
      if (clean.currentIndex !== undefined) parts.push(`Problems attempted: ${clean.currentIndex}`)
      return parts.length > 0 ? parts.join('. ') : 'Math session in progress.'
    }
    case 'flashcards': {
      const parts: string[] = []
      if (clean.cardsTotal) parts.push(`Total cards: ${clean.cardsTotal}`)
      if (clean.cardsReviewed !== undefined) parts.push(`Reviewed: ${clean.cardsReviewed}`)
      if (clean.topic) parts.push(`Topic: ${clean.topic}`)
      return parts.length > 0 ? parts.join('. ') : 'Flashcard session in progress.'
    }
    case 'google-calendar': {
      const parts: string[] = []
      if (clean.events && Array.isArray(clean.events)) parts.push(`${clean.events.length} events visible`)
      if (clean.studyBlocks && Array.isArray(clean.studyBlocks)) parts.push(`${clean.studyBlocks.length} study blocks`)
      return parts.length > 0 ? parts.join('. ') : 'Calendar session.'
    }
    default:
      return JSON.stringify(clean).slice(0, 500)
  }
}
```

- [ ] **Step 3: Add `closeApp` callback in ChatBridgeChat.tsx**

In `ChatBridgeChat.tsx`, after the `handleGameOver` callback, add:

```ts
  const closeApp = useCallback(
    (panel: { appId: string; appSessionId: string; sessionState: Record<string, unknown> }) => {
      const appLabel = panel.appId.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

      // 1. Close panel immediately
      dismissedSessionsRef.current.add(panel.appSessionId)
      if (activePanel?.appSessionId === panel.appSessionId) {
        setActivePanel(secondaryPanel)
        setSecondaryPanel(null)
      } else if (secondaryPanel?.appSessionId === panel.appSessionId) {
        setSecondaryPanel(null)
      }

      // 2. Add instant close note
      setMessages((prev) => [
        ...prev,
        {
          id: `close-${Date.now()}`,
          role: 'assistant',
          content: `\u{1F4CB} ${appLabel} closed.`,
        },
      ])

      // 3. Fire async LLM farewell (non-blocking)
      if (conversationId) {
        fetch(`${API_BASE}/chat/conversations/${conversationId}/close-app`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ appId: panel.appId, appState: panel.sessionState }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.farewell) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `farewell-${Date.now()}`,
                  role: 'assistant',
                  content: data.farewell,
                },
              ])
            }
          })
          .catch(() => {}) // Farewell is best-effort
      }
    },
    [activePanel, secondaryPanel, conversationId, token]
  )
```

- [ ] **Step 4: Remove inline X-button handler, use `closeApp` instead**

The old inline `onClick` handler on the X button (around line 864-878) is now replaced by `closeApp(activePanel)` and `closeApp(secondaryPanel)` in the Task 4 rendering — already done in Task 4 Step 4. Verify it references `closeApp`.

- [ ] **Step 5: Wire `handleGameOver` to use `closeApp`**

Update `handleGameOver` to trigger the farewell flow after the 3-second delay:

```ts
  const handleGameOver = useCallback(
    (result: { won: boolean; result?: string }) => {
      if (result.won) {
        fireConfetti()
      }
      // Close the panel after a delay so the user sees the final state
      setTimeout(() => {
        if (activePanel) {
          closeApp(activePanel)
        }
      }, 3000)
    },
    [fireConfetti, activePanel, closeApp]
  )
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/san/Desktop/Gauntlet/chatbox && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "ChatBridgeChat|routes\.ts"`
Expected: Only pre-existing errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/chatbridge/ChatBridgeChat.tsx server/src/chat/routes.ts
git commit -m "feat: closeApp helper with instant close + async LLM farewell summary"
```

---

### Task 6: Add `getSessionsForConversation` import and update imports

The new `/close-app` route uses `getSessionsForConversation` and `config` — verify the imports are present.

**Files:**
- Modify: `server/src/chat/routes.ts:1-8` (verify imports)

- [ ] **Step 1: Verify imports in routes.ts**

The file already imports `getSessionsForConversation` from `../apps/session.js` and `config` from `../config.js` (lines 7-8). No changes needed.

- [ ] **Step 2: Verify `z` import for the new route body parsing**

The file already imports `z` from `zod` (line 2). No changes needed.

- [ ] **Step 3: Commit (skip if no changes)**

No commit needed — this was a verification step.

---

### Task 7: Integration test — manual walkthrough

**Files:** None (manual testing)

- [ ] **Step 1: Test ideal flow — chess → math switch**

1. Start the app: `cd /Users/san/Desktop/Gauntlet/chatbox && npm run dev`
2. Open the app, start a new chat
3. Say "Let's play chess"
4. Make a move or two
5. Say "Let's practice math"
6. Verify: Chat shows "Chess closed." note, LLM discusses the chess game briefly, then math opens in sidebar

- [ ] **Step 2: Test fallback — split panel**

1. If the LLM happens to skip the end tool and just calls `math_start_session`:
2. Verify: Both chess and math appear in split panel with yellow warning
3. Click X on chess — verify close note + async farewell appears

- [ ] **Step 3: Test X button close**

1. Open chess, play a bit
2. Click X on the sidebar
3. Verify: Panel closes immediately, "Chess closed." appears, then a few seconds later a farewell message appears

- [ ] **Step 4: Test game over flow**

1. Play chess to completion (or force a quick game)
2. Verify: Confetti (if won), 3-second delay, then panel closes with farewell

- [ ] **Step 5: Test calendar end**

1. Say "open my calendar"
2. Interact with it
3. Say "let's play chess"
4. Verify: LLM calls `calendar_end_session` then `chess_start_game`

- [ ] **Step 6: Commit any fixes**

```bash
git add -A && git commit -m "fix: integration test fixes for app switching lifecycle"
```
