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
  res: Response
) {
  const toolSchemas = await getAllToolSchemas()

  // Inject app context from active sessions
  const sessions = await getSessionsForConversation(conversationId)
  const activeSessions = sessions.filter((s) => s.status === 'active' || s.summary)
  if (activeSessions.length > 0) {
    const appContext = activeSessions
      .map((s) => {
        if (s.status === 'active') return `[Active app: ${s.appId}, state: ${JSON.stringify(s.state)}]`
        if (s.summary) return `[Completed app: ${s.appId} — ${s.summary}]`
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

  // Add system prompt if not present
  const systemPrompt = messages.find((m) => m.role === 'system')
  if (!systemPrompt) {
    messages.unshift({
      role: 'system',
      content: `You are a helpful educational AI assistant on the TutorMeAI platform. You can help students learn by using available apps. When a student wants to play a game, practice math, study with flashcards, or plan their schedule, use the appropriate tool. After an app interaction completes, discuss the results naturally. Do not invoke apps for unrelated queries — only use tools when the student's request clearly maps to an available app.`,
    })
  }

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
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
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

    // Process tool calls
    currentMessages.push({
      role: 'assistant',
      content: assistantContent || '',
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: tc.function,
      })),
    })

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(toolCall.function.arguments) } catch { args = {} }

      res.write(`data: ${JSON.stringify({ type: 'tool_call', toolCallId: toolCall.id, toolName, args })}\n\n`)

      const result = await routeToolCall(toolName, args, { userId, conversationId })

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
