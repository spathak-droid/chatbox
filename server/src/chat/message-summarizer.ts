import { sanitizeToolSummary } from '../security/sanitize.js'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

// ============ TOOL HISTORY SUMMARIZATION ============
// Collapse old tool_call + tool_result message pairs into plain text summaries
// so the LLM can't pattern-match on previous tool names
export function summarizeOldToolCalls(messages: ChatMessage[], recentTurnsRaw: number): ChatMessage[] {
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
            summaryParts.push(sanitizeToolSummary(toolResult.summary))
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
