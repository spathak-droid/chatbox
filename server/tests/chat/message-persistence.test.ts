import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { persistAssistantMessage } from '../../src/chat/message-persistence.js'
import { query } from '../../src/db/client.js'

let userId: string
let conversationId: string

beforeAll(async () => {
  const userResult = await query(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, 'test-hash', 'Test', 'student') RETURNING id`,
    [`persist-test-${Date.now()}@test.com`]
  )
  userId = userResult.rows[0].id
  const convResult = await query(
    'INSERT INTO conversations (user_id) VALUES ($1) RETURNING id',
    [userId]
  )
  conversationId = convResult.rows[0].id
})

afterAll(async () => {
  await query('DELETE FROM messages WHERE conversation_id = $1', [conversationId])
  await query('DELETE FROM conversations WHERE id = $1', [conversationId])
  await query('DELETE FROM users WHERE id = $1', [userId])
})

describe('persistAssistantMessage', () => {
  it('persists plain text assistant message', async () => {
    await persistAssistantMessage(conversationId, 'Hello, student!', [])

    const result = await query(
      `SELECT role, content FROM messages WHERE conversation_id = $1 AND role = 'assistant' ORDER BY created_at DESC LIMIT 1`,
      [conversationId]
    )

    expect(result.rows.length).toBe(1)
    expect(result.rows[0].role).toBe('assistant')
    expect(result.rows[0].content).toBe('Hello, student!')
  })

  it('persists with tool_calls metadata — creates 3 rows: assistant (with tool_result JSONB), tool (with tool_call_id), assistant (text)', async () => {
    const countBefore = await query(
      'SELECT COUNT(*) FROM messages WHERE conversation_id = $1',
      [conversationId]
    )
    const before = parseInt(countBefore.rows[0].count, 10)

    const toolCalls = [
      { id: 'call_abc123', name: 'chess_start_game', args: '{}', result: '{"status":"ok"}' },
    ]

    await persistAssistantMessage(conversationId, 'Game started!', toolCalls)

    const countAfter = await query(
      'SELECT COUNT(*) FROM messages WHERE conversation_id = $1',
      [conversationId]
    )
    const after = parseInt(countAfter.rows[0].count, 10)

    // Should have added 3 rows: assistant (tool_calls meta), tool (result), assistant (text)
    expect(after - before).toBe(3)

    // Check the tool row has tool_call_id
    const toolRow = await query(
      `SELECT role, content, tool_call_id FROM messages WHERE conversation_id = $1 AND role = 'tool' ORDER BY created_at DESC LIMIT 1`,
      [conversationId]
    )
    expect(toolRow.rows[0].tool_call_id).toBe('call_abc123')
    expect(toolRow.rows[0].content).toBe('{"status":"ok"}')

    // Check the assistant text row
    const assistantTextRow = await query(
      `SELECT role, content FROM messages WHERE conversation_id = $1 AND role = 'assistant' ORDER BY created_at DESC LIMIT 1`,
      [conversationId]
    )
    expect(assistantTextRow.rows[0].content).toBe('Game started!')
  })

  it('does NOT persist when text is empty AND no tool calls', async () => {
    const countBefore = await query(
      'SELECT COUNT(*) FROM messages WHERE conversation_id = $1',
      [conversationId]
    )
    const before = parseInt(countBefore.rows[0].count, 10)

    await persistAssistantMessage(conversationId, '', [])

    const countAfter = await query(
      'SELECT COUNT(*) FROM messages WHERE conversation_id = $1',
      [conversationId]
    )
    const after = parseInt(countAfter.rows[0].count, 10)

    expect(after).toBe(before)
  })

  it('does not throw on FK violation (fake conversationId)', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'

    // Should not throw — function catches and logs the error
    await expect(
      persistAssistantMessage(fakeId, 'This should fail silently', [])
    ).resolves.toBeUndefined()
  })
})
