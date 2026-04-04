import { query } from '../db/client.js'

// ============ MESSAGE PERSISTENCE ============
// Anthropic API requires: assistant (with tool_use) → tool (results) → assistant (text)
export async function persistAssistantMessage(
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
