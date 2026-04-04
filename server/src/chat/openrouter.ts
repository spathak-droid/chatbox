import { config } from '../config.js'
import { log } from '../lib/logger.js'
import { scopeToolsToIntent } from './tool-scoping.js'
import { sanitizeToolSummary } from '../security/sanitize.js'
import { summarizeOldToolCalls, ChatMessage } from './message-summarizer.js'
import { getAllToolSchemas, findAppByToolName, getCachedApps } from '../apps/registry.js'
import { routeToolCall, DESTRUCTIVE_TOOLS } from '../apps/tool-router.js'
import { getSessionsForConversation } from '../apps/session.js'
import type { Response } from 'express'
import { StreamModerator, logModerationEvent } from '../security/moderation.js'
import { langfuse } from '../lib/langfuse.js'
import { persistAssistantMessage } from './message-persistence.js'
import { buildSystemPrompt } from './system-prompt.js'
import { buildAppContext } from './app-context.js'

export async function streamChatWithTools(
  messages: ChatMessage[],
  conversationId: string,
  userId: string,
  res: Response,
  authToken?: string,
  clientTimezone?: string,
) {
  const toolSchemas = await getAllToolSchemas()

  // Fetch active sessions for app context and tool scoping
  const sessions = await getSessionsForConversation(conversationId)

  // Build app context from sessions and last user message
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || ''
  const { activeAppId, contextLine } = buildAppContext(sessions, lastUserMessage)

  // Build and inject system prompt (includes app context when present)
  const systemContent = buildSystemPrompt(contextLine, clientTimezone)
  const sysIdx = messages.findIndex((m) => m.role === 'system')
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
  const scopedTools = scopeToolsToIntent(toolSchemas, lastUserMessage, activeAppId)
  log.info('Tool scoping', { activeApp: activeAppId, msg: lastUserMessage.slice(0, 50), tools: scopedTools.map((t: any) => t.function?.name) })

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
      log.warn('Blocked hallucinated tool', { tool: tc.function.name })
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
          content: `<tool_result app="${toolName}">${sanitizeToolSummary(JSON.stringify(result))}</tool_result>`,
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
        content: `<tool_result app="${toolName}">${sanitizeToolSummary(JSON.stringify(result))}</tool_result>`,
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
  const moderator = new StreamModerator()

  while (true) {
    const { done, value } = await pass2Reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    let moderationBroke = false
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      try {
        const chunk = JSON.parse(line.slice(6))
        const delta = chunk.choices?.[0]?.delta

        if (delta?.content) {
          const check = moderator.addChunk(delta.content)
          if (check.safe) {
            res.write(`data: ${JSON.stringify({ type: 'text', content: delta.content })}\n\n`)
            fullResponseText += delta.content
          } else {
            log.warn('Flagged content', { conversationId, category: check.category })
            logModerationEvent(conversationId, userId, check.category || 'unknown', moderator.getBuffer(), 'blocked')
            // Replace with safe message
            const safeMsg = "\n\nI need to stay focused on helping you learn! Let me know what you'd like to work on."
            res.write(`data: ${JSON.stringify({ type: 'text', content: safeMsg })}\n\n`)
            fullResponseText += safeMsg
            moderationBroke = true
            break // Stop streaming
          }
        }
      } catch {
        // Skip malformed chunks
      }
    }
    if (moderationBroke) break
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


