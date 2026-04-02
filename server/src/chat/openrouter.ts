import { config } from '../config.js'
import { getAllToolSchemas } from '../apps/registry.js'
import { routeToolCall, DESTRUCTIVE_TOOLS } from '../apps/tool-router.js'
import { getSessionsForConversation } from '../apps/session.js'
import type { Response } from 'express'

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
  authToken?: string
) {
  const toolSchemas = await getAllToolSchemas()

  // Inject app context from active sessions
  const sessions = await getSessionsForConversation(conversationId)
  const relevantSessions = sessions.filter((s) => s.status === 'active' || s.status === 'completed' || s.summary)
  if (relevantSessions.length > 0) {
    // Detect user intent for context cleaning
    const lastMsg = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || ''
    const intentApp = /chess|play a game|play$|let'?s play/.test(lastMsg) ? 'chess'
      : /math|practice|problems|addition|algebra|subtract|multiply|divid/.test(lastMsg) ? 'math-practice'
      : /flash|study|quiz|review|learn about/.test(lastMsg) ? 'flashcards'
      : /calendar|schedule|event|study block|study plan|delete.*event|add.*event|plan.*week/.test(lastMsg) ? 'google-calendar'
      : null

    const activeSession = relevantSessions.find(s => s.status === 'active')
    const isSwitching = activeSession && intentApp && activeSession.appId !== intentApp

    const appContext = relevantSessions
      .map((s) => {
        if (s.status === 'active') {
          if (isSwitching && s.appId === activeSession.appId) {
            return `[Switching from ${activeSession.appId} to ${intentApp}. End the old app and start the new one.]`
          }
          const state = s.state as Record<string, unknown> | null
          if (state?.gameOver) {
            return `[Completed app: ${s.appId} — game is finished. If user wants to play again, call the start tool immediately.]`
          }
          return `[Active app: ${s.appId}, state: ${JSON.stringify(s.state)}]`
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
  const systemContent = `You are TutorMeAI, a friendly tutor for students ages 8-14. You have 4 apps: Chess, Math Practice, Flashcards, and Calendar.

## STEP-BY-STEP — follow this EXACTLY for every message:

Step 1: What app does the user want?
- "chess" / "play" / "game" → CHESS
- "math" / "practice" / "problems" → MATH
- "flashcards" / "study" / "quiz" / "learn" → FLASHCARDS
- "calendar" / "schedule" → CALENDAR
- none of the above → NO APP (just chat)

Step 2: Is that app already active? (check app context below)
- YES, same app already active → Say "You're already on it! Keep going!" Do NOT call any tools.
- NO, a DIFFERENT app is active → Call end/finish tool for the OLD app, then call start tool for the NEW app. Example: chess active + user says "math" → call chess_end_game then math_start_session.
- NO app is active → Call the start tool for the requested app.

Step 3: Pick tool parameters using defaults. NEVER ask the user.
- math_start_session: topic="addition", difficulty="easy"
- flashcards_start_deck: generate 5-8 cards on any topic from context
- chess_start_game: playerColor="white"

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
  const scopedTools = scopeToolsToIntent(toolSchemas, lastUserMessage)

  // Set SSE headers if not already set by the caller
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
  }

  const MAX_TOOL_ROUNDS = 5
  let currentMessages = [...messages]

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
        }
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      // Tools were executed in prior rounds — break to Pass 2 for streaming response
      break
    }

    // ============ GUARDRAIL: Validate tool calls against user intent ============
    const lastUserMsg = currentMessages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || ''
    const validatedToolCalls = pass1ToolCalls.filter(tc => {
      const name = tc.function.name
      // Allow end/finish tools always (cleanup is fine)
      if (name.includes('end_game') || name.includes('finish')) return true
      // Block start tools that contradict user intent
      if (name === 'chess_start_game' && !lastUserMsg.match(/chess|play a game|play$/)) {
        console.log(`[GUARDRAIL] Blocked chess_start_game — user said: "${lastUserMsg.slice(0, 60)}"`)
        return false
      }
      if (name === 'math_start_session' && !lastUserMsg.match(/math|practice|problems|addition|algebra|subtract|multiply|divid/)) {
        console.log(`[GUARDRAIL] Blocked math_start_session — user said: "${lastUserMsg.slice(0, 60)}"`)
        return false
      }
      if (name === 'flashcards_start_deck' && !lastUserMsg.match(/flash|study|quiz|review|learn/)) {
        console.log(`[GUARDRAIL] Blocked flashcards_start_deck — user said: "${lastUserMsg.slice(0, 60)}"`)
        return false
      }
      return true
    })

    // If guardrail removed all start tools but user clearly wants an app, inject the right one
    const hasStartTool = validatedToolCalls.some(tc => tc.function.name.includes('start'))
    if (!hasStartTool && validatedToolCalls.length > 0) {
      let correctTool: string | null = null
      let correctArgs = '{}'
      if (lastUserMsg.match(/math|practice math|problems/)) {
        correctTool = 'math_start_session'
        correctArgs = '{"topic":"addition","difficulty":"easy"}'
      } else if (lastUserMsg.match(/flash|study|quiz|review|learn/)) {
        correctTool = 'flashcards_start_deck'
        // We can't generate cards here, so let the LLM retry
        correctTool = null
      } else if (lastUserMsg.match(/chess|play/)) {
        correctTool = 'chess_start_game'
        correctArgs = '{"playerColor":"white"}'
      }
      if (correctTool) {
        console.log(`[GUARDRAIL] Injecting correct tool: ${correctTool}`)
        validatedToolCalls.push({
          id: `guardrail-${Date.now()}`,
          function: { name: correctTool, arguments: correctArgs },
        })
      }
    }

    // If all tool calls were blocked by guardrails, send Pass 1 text and end
    if (validatedToolCalls.length === 0) {
      if (pass1Content) {
        res.write(`data: ${JSON.stringify({ type: 'text', content: pass1Content })}\n\n`)
      }
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
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  res.write('data: [DONE]\n\n')
  res.end()
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
function scopeToolsToIntent(allTools: any[], userMessage: string): any[] {
  // Detect intent from user message
  const wantsChess = /chess|play a game|play$|let'?s play/.test(userMessage)
  const wantsMath = /math|practice|problems|addition|algebra|subtract|multiply|divid/.test(userMessage)
  const wantsFlashcards = /flash|study|quiz|review|learn about/.test(userMessage)
  const wantsCalendar = /calendar|schedule|event|study block|study plan|delete.*event|add.*event|plan.*week/.test(userMessage)

  // If no clear intent, send all tools (LLM decides)
  const hasIntent = wantsChess || wantsMath || wantsFlashcards || wantsCalendar
  if (!hasIntent) return allTools

  // Filter to matching app tools + always include end/finish tools for cleanup
  return allTools.filter(tool => {
    const name = tool.function?.name || ''
    if (name.includes('end_game') || name.includes('finish')) return true
    if (wantsChess && name.startsWith('chess_')) return true
    if (wantsMath && name.startsWith('math_')) return true
    if (wantsFlashcards && name.startsWith('flashcards_')) return true
    if (wantsCalendar && name.startsWith('calendar_')) return true
    return false
  })
}
