import { config } from '../config.js'
import { sanitizeStateForLLM } from '../security/sanitize.js'
import { getAllToolSchemas, findAppByToolName, getCachedApps } from '../apps/registry.js'
import { routeToolCall, DESTRUCTIVE_TOOLS } from '../apps/tool-router.js'
import { getSessionsForConversation } from '../apps/session.js'
import { query } from '../db/client.js'
import type { Response } from 'express'
import { langfuse } from '../lib/langfuse.js'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

export async function streamChatWithTools(
  messages: ChatMessage[],
  conversationId: string,
  userId: string,
  res: Response,
  authToken?: string,
  clientTimezone?: string,
) {
  const toolSchemas = await getAllToolSchemas()

  // Inject app context from active sessions
  const sessions = await getSessionsForConversation(conversationId)
  const relevantSessions = sessions.filter((s) => s.status === 'active' || s.status === 'completed' || s.summary)
  if (relevantSessions.length > 0) {
    // Detect user intent for context cleaning
    const lastMsg = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || ''
    const intentApp = /chess|play a game|play$|let'?s play/.test(lastMsg) ? 'chess'
      : /math|practice|problems|addition|algebra|subtract|multipl|divid/.test(lastMsg) ? 'math-practice'
      : /flash|study|quiz|review|learn about/.test(lastMsg) ? 'flashcards'
      : /calendar|schedule|event|study block|study plan|delete.*event|add.*event|plan.*week/.test(lastMsg) ? 'google-calendar'
      : null

    const activeSession = relevantSessions.find(s => s.status === 'active')
    const isSwitching = activeSession && intentApp && activeSession.appId !== intentApp

    const appContext = relevantSessions
      .map((s) => {
        if (s.status === 'active') {
          if (isSwitching && s.appId === activeSession.appId) {
            return `[Switching from ${activeSession.appId} to ${intentApp}. You MUST call the end tool for ${activeSession.appId} first, then the start tool for ${intentApp}. Briefly discuss what happened in ${activeSession.appId} before moving on.]`
          }
          const state = s.state as Record<string, unknown> | null
          if (state?.gameOver) {
            return `[Completed app: ${s.appId} — game is finished. If user wants to play again, call the start tool immediately.]`
          }
          return `[Active app: ${s.appId}, state: ${sanitizeStateForLLM(s.appId, s.state as Record<string, unknown>)}]`
        }
        if (s.status === 'completed' || s.summary) {
          return `[Completed app: ${s.appId} — ${s.summary || 'finished'}. If user wants to play again, call the start tool immediately.]`
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')

    if (messages[0]?.role === 'system') {
      messages[0].content += `\n\nCurrent app context:\n${appContext}`
    } else {
      messages.unshift({ role: 'system', content: `Current app context:\n${appContext}` })
    }
  }

  // Always set/replace system prompt to ensure latest instructions
  const sysIdx = messages.findIndex((m) => m.role === 'system')
  // Use client timezone if available, otherwise fall back to server timezone
  const tz = clientTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  const now = new Date()
  const currentDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz })
  const currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz })
  // Compute the UTC offset for the client's timezone
  const tzFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
  const tzParts = tzFormatter.formatToParts(now)
  const tzOffsetStr = tzParts.find(p => p.type === 'timeZoneName')?.value || 'UTC'
  // Convert "GMT-5" style to "-05:00" style
  const tzMatch = tzOffsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/)
  const tzString = tzMatch
    ? `${tzMatch[1]}${tzMatch[2].padStart(2, '0')}:${(tzMatch[3] || '00').padStart(2, '0')}`
    : '+00:00'
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD format

  const systemContent = `You are TutorMeAI, a friendly tutor for students ages 8-14. You have 4 apps: Chess, Math Practice, Flashcards, and Calendar.

Today is ${currentDate}, current time is ${currentTime} (timezone: ${tz}, UTC${tzString}).
When creating calendar events, ALWAYS use dates relative to TODAY (${todayStr}) and ALWAYS include the timezone offset (${tzString}) in all dateTime values. Example format: "${todayStr}T15:00:00${tzString}".

## STEP-BY-STEP — follow this EXACTLY for every message:

Step 1: What app does the user want?
- "chess" / "play" / "game" → CHESS
- "math" / "practice" / "problems" → MATH
- "flashcards" / "study" / "quiz" / "learn" → FLASHCARDS
- "calendar" / "schedule" → CALENDAR
- none of the above → NO APP (just chat)

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

Step 3: Pick tool parameters using defaults. NEVER ask the user.
- math_start_session: topic="addition", difficulty="easy"
- flashcards_start_deck: generate 5-8 cards on any topic from context
- chess_start_game: playerColor="white"
- calendar_end_session: no parameters needed

## ABSOLUTE RULES — VIOLATIONS ARE BUGS:
- ONLY call chess_ tools when user wants CHESS. ONLY call math_ tools when user wants MATH. ONLY call flashcards_ tools when user wants FLASHCARDS.
- If user says "flashcards" → you MUST NOT call chess_start_game. Ever.
- If user says "chess" → you MUST NOT call flashcards_start_deck. Ever.
- If user says "math" → you MUST NOT call chess_start_game. Ever.
- After calling a start tool, say 1 sentence max.
- If the requested app is ALREADY active, do NOTHING. Just chat.
- ONLY do what the user asks. NEVER take extra actions. If user says "delete X" → delete X and stop. Do NOT create new events, suggest alternatives, or add anything the user didn't request. Less is more.

## COACHING (when app context shows active state):

Chess: Read the FEN. Describe positions in kid-friendly language ("your horse", "their castle"). Never use algebraic notation. Keep advice to 2 sentences. Don't repeat what you already said.

Math: Read currentIndex, correct, incorrect. Know which problem they're on. If they ask for help, explain the current problem simply. Celebrate wins, encourage after mistakes. 1-2 sentences.

## KEEP IT SHORT. Students lose attention with long messages.`

  if (sysIdx >= 0) {
    messages[sysIdx].content = systemContent + '\n\n' + messages[sysIdx].content
  } else {
    messages.unshift({ role: 'system', content: systemContent })
  }

  // ============ TOOL CALL HISTORY SUMMARIZATION ============
  // Replace old tool_call/tool_result pairs with plain text summaries
  // so the LLM doesn't pattern-match on previous tool names
  const RECENT_TURNS_TO_KEEP_RAW = 2  // keep last 2 turns with full tool messages
  messages = summarizeOldToolCalls(messages, RECENT_TURNS_TO_KEEP_RAW)

  // ============ DYNAMIC TOOL SCOPING ============
  // Only send tools relevant to the user's current message
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || ''
  // Find the currently active app (if any) so follow-up messages scope to it
  const activeAppId = relevantSessions.find(s => s.status === 'active')?.appId || null
  const scopedTools = scopeToolsToIntent(toolSchemas, lastUserMessage, activeAppId)
  console.log(`[SCOPE] activeApp=${activeAppId}, msg="${lastUserMessage.slice(0, 50)}", tools=[${scopedTools.map((t: any) => t.function?.name).join(', ')}]`)

  // Set SSE headers if not already set by the caller
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
  }

  const trace = langfuse.trace({
    name: 'chat',
    metadata: { conversationId, userId },
  })

  const MAX_TOOL_ROUNDS = 5
  let currentMessages = [...messages]

  // Track tool calls and results for DB persistence
  const executedToolCalls: Array<{ id: string; name: string; args: string; result: string }> = []
  let fullResponseText = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // ============ PASS 1: Non-streaming call to get tool proposals ============
    const pass1Response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://chatbridge.app',
      },
      body: JSON.stringify({
        model: config.openrouterModel,
        messages: currentMessages,
        tools: scopedTools.length > 0 ? scopedTools : undefined,
        stream: false,
      }),
    })

    if (!pass1Response.ok) {
      const errText = await pass1Response.text()
      res.write(`data: ${JSON.stringify({ type: 'error', error: `OpenRouter error: ${pass1Response.status} ${errText}` })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    const pass1Data = await pass1Response.json()
    trace.generation({
      name: 'pass1-tool-proposal',
      model: config.openrouterModel,
      input: currentMessages,
      output: pass1Data,
      usage: {
        totalTokens: (pass1Data as any).usage?.total_tokens,
      },
    })
    const pass1Choice = pass1Data.choices?.[0]
    const pass1Message = pass1Choice?.message
    const pass1Content = pass1Message?.content || ''
    const pass1ToolCalls: Array<{ id: string; function: { name: string; arguments: string } }> =
      pass1Message?.tool_calls?.map((tc: any) => ({
        id: tc.id || '',
        function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' },
      })) || []

    // ============ NO TOOL CALLS ============
    if (pass1ToolCalls.length === 0) {
      if (round === 0) {
        // First round, no tools — pure chat. Send Pass 1 text directly.
        if (pass1Content) {
          res.write(`data: ${JSON.stringify({ type: 'text', content: pass1Content })}\n\n`)
          fullResponseText = pass1Content
        }
        await persistAssistantMessage(conversationId, fullResponseText, executedToolCalls)
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      // Tools were executed in prior rounds — break to Pass 2 for streaming response
      break
    }

    // Only allow tool calls for tools that were actually in the scoped list.
    // LLMs can hallucinate tool names from conversation history even when
    // those tools aren't in the current tools array.
    const scopedToolNames = new Set(scopedTools.map(t => t.function?.name).filter(Boolean))
    const validatedToolCalls = pass1ToolCalls.filter(tc => {
      if (scopedToolNames.has(tc.function.name)) return true
      console.log(`[GUARDRAIL] Blocked hallucinated tool: ${tc.function.name} (not in scoped tools)`)
      return false
    })

    // If no tool calls after validation, send Pass 1 text and end
    if (validatedToolCalls.length === 0) {
      if (pass1Content) {
        res.write(`data: ${JSON.stringify({ type: 'text', content: pass1Content })}\n\n`)
        fullResponseText = pass1Content
      }
      await persistAssistantMessage(conversationId, fullResponseText, executedToolCalls)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    // ============ DESTRUCTIVE TOOL CHECK ============
    const hasDestructiveTools = validatedToolCalls.some(tc => DESTRUCTIVE_TOOLS.has(tc.function.name))

    if (hasDestructiveTools) {
      // Queue ALL tool calls for confirmation via routeToolCall (which handles pending state)
      // Send pending_confirmation event, NO text, end response
      currentMessages.push({
        role: 'assistant',
        content: '',
        tool_calls: validatedToolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: tc.function,
        })),
      })

      for (const toolCall of validatedToolCalls) {
        const toolName = toolCall.function.name
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(toolCall.function.arguments) } catch { args = {} }

        const result = await routeToolCall(toolName, args, { userId, conversationId, authToken })

        // Only send pending_confirmation events for destructive tools
        if (DESTRUCTIVE_TOOLS.has(toolName)) {
          res.write(`data: ${JSON.stringify({ type: 'pending_confirmation', toolCallId: toolCall.id, toolName, args, result })}\n\n`)
        } else {
          // Non-destructive tools in the same batch still get executed normally
          res.write(`data: ${JSON.stringify({ type: 'tool_call', toolCallId: toolCall.id, toolName, args })}\n\n`)
          res.write(`data: ${JSON.stringify({ type: 'tool_result', toolCallId: toolCall.id, toolName, result })}\n\n`)
        }

        currentMessages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        })
      }

      // End response — no Pass 2 text generation for destructive tools
      await persistAssistantMessage(conversationId, fullResponseText, executedToolCalls)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    // ============ SAFE TOOLS — Execute then continue loop ============
    currentMessages.push({
      role: 'assistant',
      content: '',
      tool_calls: validatedToolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: tc.function,
      })),
    })

    for (const toolCall of validatedToolCalls) {
      const toolName = toolCall.function.name
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(toolCall.function.arguments) } catch { args = {} }

      res.write(`data: ${JSON.stringify({ type: 'tool_call', toolCallId: toolCall.id, toolName, args })}\n\n`)

      const result = await routeToolCall(toolName, args, { userId, conversationId, authToken })

      res.write(`data: ${JSON.stringify({ type: 'tool_result', toolCallId: toolCall.id, toolName, result })}\n\n`)

      executedToolCalls.push({ id: toolCall.id, name: toolName, args: toolCall.function.arguments, result: JSON.stringify(result) })

      currentMessages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      })
    }
    // Loop continues — next iteration's Pass 1 may propose more tools or generate text
  }

  // ============ PASS 2: Streaming text generation based on tool results ============
  // After MAX_TOOL_ROUNDS or when loop exits, generate final user-facing text
  const pass2Response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openrouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://chatbridge.app',
    },
    body: JSON.stringify({
      model: config.openrouterModel,
      messages: currentMessages,
      stream: true,
      // No tools — just generate text based on tool results
    }),
  })

  if (!pass2Response.ok) {
    const errText = await pass2Response.text()
    res.write(`data: ${JSON.stringify({ type: 'error', error: `OpenRouter error (pass 2): ${pass2Response.status} ${errText}` })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  const pass2Reader = pass2Response.body?.getReader()
  if (!pass2Reader) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'No response body (pass 2)' })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await pass2Reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      try {
        const chunk = JSON.parse(line.slice(6))
        const delta = chunk.choices?.[0]?.delta

        if (delta?.content) {
          res.write(`data: ${JSON.stringify({ type: 'text', content: delta.content })}\n\n`)
          fullResponseText += delta.content
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  trace.generation({
    name: 'pass2-text-response',
    model: config.openrouterModel,
    input: currentMessages,
  })

  await persistAssistantMessage(conversationId, fullResponseText, executedToolCalls)
  res.write('data: [DONE]\n\n')
  res.end()
}

// ============ MESSAGE PERSISTENCE ============
// Anthropic API requires: assistant (with tool_use) → tool (results) → assistant (text)
async function persistAssistantMessage(
  conversationId: string,
  text: string,
  toolCalls: Array<{ id: string; name: string; args: string; result: string }>
) {
  try {
    if (toolCalls.length > 0) {
      // 1. Assistant message with tool_calls (no text — tool_use and text go separately)
      const toolCallsMeta = JSON.stringify(toolCalls.map(tc => ({ id: tc.id, name: tc.name, args: tc.args })))
      await query(
        `INSERT INTO messages (conversation_id, role, content, tool_result)
         VALUES ($1, 'assistant', '', $2)`,
        [conversationId, toolCallsMeta]
      )
      // 2. Tool results (one per tool)
      for (const tc of toolCalls) {
        await query(
          `INSERT INTO messages (conversation_id, role, content, tool_name, tool_call_id)
           VALUES ($1, 'tool', $2, $3, $4)`,
          [conversationId, tc.result, tc.name, tc.id]
        )
      }
      // 3. Assistant text response (separate message after tool results)
      if (text) {
        await query(
          'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
          [conversationId, 'assistant', text]
        )
      }
    } else if (text) {
      await query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [conversationId, 'assistant', text]
      )
    }
  } catch (err) {
    console.error('[PERSIST] Failed to save assistant message:', err)
  }
}

// ============ TOOL HISTORY SUMMARIZATION ============
// Collapse old tool_call + tool_result message pairs into plain text summaries
// so the LLM can't pattern-match on previous tool names
function summarizeOldToolCalls(messages: ChatMessage[], recentTurnsRaw: number): ChatMessage[] {
  // Find the boundary: keep the last N user messages and everything after them raw
  let userMsgCount = 0
  let rawBoundary = messages.length
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userMsgCount++
      if (userMsgCount >= recentTurnsRaw) {
        rawBoundary = i
        break
      }
    }
  }

  const result: ChatMessage[] = []

  let i = 0
  while (i < messages.length) {
    const msg = messages[i]

    // Keep recent messages raw
    if (i >= rawBoundary) {
      result.push(msg)
      i++
      continue
    }

    // System and user messages pass through
    if (msg.role === 'system' || msg.role === 'user') {
      result.push(msg)
      i++
      continue
    }

    // Assistant message with tool_calls → summarize it + subsequent tool results
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const toolNames = msg.tool_calls.map(tc => tc.function.name)
      let summaryParts: string[] = []
      if (msg.content) summaryParts.push(msg.content)

      // Consume following tool result messages
      let j = i + 1
      while (j < messages.length && messages[j].role === 'tool') {
        try {
          const toolResult = JSON.parse(messages[j].content)
          if (toolResult.summary) {
            summaryParts.push(toolResult.summary)
          } else if (toolResult.status === 'ok') {
            summaryParts.push(`[${toolNames[j - i - 1] || 'tool'} completed successfully]`)
          } else if (toolResult.error) {
            summaryParts.push(`[${toolNames[j - i - 1] || 'tool'} failed: ${toolResult.error}]`)
          }
        } catch {
          summaryParts.push('[tool action completed]')
        }
        j++
      }

      // Replace with a single assistant summary message
      result.push({
        role: 'assistant',
        content: summaryParts.join(' '),
      })
      i = j
      continue
    }

    // Plain assistant message — pass through
    result.push(msg)
    i++
  }

  return result
}

// ============ DYNAMIC TOOL SCOPING ============
// Only expose tools relevant to user's current intent
// The LLM can't call a tool it can't see
// Map app IDs to tool prefixes
const APP_TOOL_PREFIX: Record<string, string> = {
  'chess': 'chess_',
  'math-practice': 'math_',
  'flashcards': 'flashcards_',
  'google-calendar': 'calendar_',
  'whiteboard': 'whiteboard_',
}

export function scopeToolsToIntent(allTools: any[], userMessage: string, activeAppId?: string | null): any[] {
  // Detect intent from user message — order matters, more specific first
  const wantsCalendar = /calend[ae]r|schedule|event|study block|study plan|delete.*event|add.*event|plan.*week|planner/.test(userMessage)
  const wantsChess = /chess|play a game|let'?s play(?!\s*\w)/.test(userMessage)
  const wantsMath = /math|practice|problems|addition|algebra|subtract|multipl|divid/.test(userMessage)
  const wantsFlashcards = /flash(?:card)?|quiz|review|learn about|study(?!.*(?:block|plan|schedule|calendar))/.test(userMessage)
  const wantsWhiteboard = /whiteboard|draw|sketch/.test(userMessage)

  const hasIntent = wantsChess || wantsMath || wantsFlashcards || wantsCalendar || wantsWhiteboard

  // If no clear intent but an app is active, scope to that app's tools
  // This handles follow-up messages like "what is the answer?" during math
  if (!hasIntent) {
    if (activeAppId && APP_TOOL_PREFIX[activeAppId]) {
      const prefix = APP_TOOL_PREFIX[activeAppId]
      return allTools.filter(tool => {
        const name = tool.function?.name || ''
        return name.startsWith(prefix)
      })
    }
    // No active app and no intent — send all tools (LLM decides)
    return allTools
  }

  // Only include tools for the matched app(s)
  // When switching apps, also include the old app's end/finish tool so LLM can close it
  const activePrefix = activeAppId ? APP_TOOL_PREFIX[activeAppId] : null
  const isSwitchingApps = hasIntent && activePrefix && !(
    (wantsChess && activeAppId === 'chess') ||
    (wantsMath && activeAppId === 'math-practice') ||
    (wantsFlashcards && activeAppId === 'flashcards') ||
    (wantsCalendar && activeAppId === 'google-calendar') ||
    (wantsWhiteboard && activeAppId === 'whiteboard')
  )

  return allTools.filter(tool => {
    const name = tool.function?.name || ''
    if (wantsChess && name.startsWith('chess_')) return true
    if (wantsMath && name.startsWith('math_')) return true
    if (wantsFlashcards && name.startsWith('flashcards_')) return true
    if (wantsCalendar && name.startsWith('calendar_')) return true
    if (wantsWhiteboard && name.startsWith('whiteboard_')) return true
    // Include old app's end/finish/stop tools when switching
    if (isSwitchingApps && activePrefix && name.startsWith(activePrefix) &&
        /end_game|finish|stop|end_session|close/.test(name)) return true
    return false
  })
}
