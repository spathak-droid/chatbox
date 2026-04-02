import { config } from '../config.js'
import { getAllToolSchemas } from '../apps/registry.js'
import { routeToolCall } from '../apps/tool-router.js'
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
    const appContext = relevantSessions
      .map((s) => {
        if (s.status === 'active') {
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
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
        stream: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      res.write(`data: ${JSON.stringify({ type: 'error', error: `OpenRouter error: ${response.status} ${errText}` })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'No response body' })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    let assistantContent = ''
    let toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = []
    let hasToolCalls = false
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
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
            assistantContent += delta.content
            res.write(`data: ${JSON.stringify({ type: 'text', content: delta.content })}\n\n`)
          }

          if (delta?.tool_calls) {
            hasToolCalls = true
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = { id: tc.id || '', function: { name: '', arguments: '' } }
                }
                if (tc.id) toolCalls[tc.index].id = tc.id
                if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name
                if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments
              }
            }
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    if (!hasToolCalls || toolCalls.length === 0) {
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    // Validate tool calls against user intent — catch LLM routing mistakes
    const lastUserMsg = currentMessages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || ''
    const validatedToolCalls = toolCalls.filter(tc => {
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
      // User wanted to switch — figure out which start tool to add
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

    // Process tool calls
    currentMessages.push({
      role: 'assistant',
      content: assistantContent || '',
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
    // Loop continues — LLM sees tool results next round
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
