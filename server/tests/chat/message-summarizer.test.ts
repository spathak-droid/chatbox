import { describe, it, expect } from 'vitest'
import { summarizeOldToolCalls, ChatMessage } from '../../src/chat/message-summarizer.js'

describe('summarizeOldToolCalls', () => {
  it('returns empty array for empty input', () => {
    expect(summarizeOldToolCalls([], 2)).toEqual([])
  })

  it('passes through messages with no tool calls unchanged', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: 'What do you think it might be?' },
    ]
    const result = summarizeOldToolCalls(messages, 2)
    expect(result).toEqual(messages)
  })

  it('preserves recent turns with full tool messages', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Start chess' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'chess_start_game', arguments: '{}' } }],
      },
      {
        role: 'tool',
        content: JSON.stringify({ status: 'ok', summary: 'Chess game started.' }),
        tool_call_id: 'call_1',
      },
      { role: 'user', content: 'Make a move' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'chess_move', arguments: '{"move":"e4"}' } }],
      },
      {
        role: 'tool',
        content: JSON.stringify({ status: 'ok', summary: 'Pawn moved to e4.' }),
        tool_call_id: 'call_2',
      },
    ]
    // With recentTurnsRaw=2, both user turns are recent — everything should be kept raw
    const result = summarizeOldToolCalls(messages, 2)
    expect(result).toEqual(messages)
  })

  it('collapses old assistant+tool pairs into summary text with tool summary field', () => {
    const messages: ChatMessage[] = [
      // Old turn (beyond recentTurnsRaw=1)
      { role: 'user', content: 'Start chess' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'chess_start_game', arguments: '{}' } }],
      },
      {
        role: 'tool',
        content: JSON.stringify({ status: 'ok', summary: 'Chess game started successfully.' }),
        tool_call_id: 'call_1',
      },
      // Recent turn (kept raw)
      { role: 'user', content: 'How am I doing?' },
      { role: 'assistant', content: 'You are doing great!' },
    ]
    const result = summarizeOldToolCalls(messages, 1)

    // There should be exactly 2 assistant messages: the collapsed old one + the raw recent one
    const assistantMsgs = result.filter(m => m.role === 'assistant')
    expect(assistantMsgs.length).toBe(2)
    // The first (collapsed) assistant message should contain the tool's summary
    expect(assistantMsgs[0].content).toContain('Chess game started successfully.')
    // The collapsed message should NOT have tool_calls (it's a plain text summary)
    expect(assistantMsgs[0].tool_calls).toBeUndefined()
    // No tool messages in the result
    const toolMsgs = result.filter(m => m.role === 'tool')
    expect(toolMsgs.length).toBe(0)
    // The recent turn assistant message is kept raw
    const lastAssistant = result[result.length - 1]
    expect(lastAssistant.content).toBe('You are doing great!')
  })

  it('shows "failed" in summary for tool result with error status', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Delete event' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'calendar_delete_event', arguments: '{"id":"123"}' } }],
      },
      {
        role: 'tool',
        content: JSON.stringify({ status: 'error', error: 'Event not found' }),
        tool_call_id: 'call_1',
      },
      // Recent turn
      { role: 'user', content: 'OK, forget it' },
      { role: 'assistant', content: 'No problem!' },
    ]
    const result = summarizeOldToolCalls(messages, 1)

    const collapsedAssistant = result.find(m => m.role === 'assistant' && m.content.includes('failed'))
    expect(collapsedAssistant).toBeDefined()
    expect(collapsedAssistant!.content).toContain('failed')
  })

  it('shows "completed successfully" for status:ok with no summary field', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Start math' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'math_start_session', arguments: '{}' } }],
      },
      {
        role: 'tool',
        content: JSON.stringify({ status: 'ok' }),
        tool_call_id: 'call_1',
      },
      // Recent turn
      { role: 'user', content: 'Next problem' },
      { role: 'assistant', content: 'Here is your next problem!' },
    ]
    const result = summarizeOldToolCalls(messages, 1)

    const collapsedAssistant = result.find(m => m.role === 'assistant' && m.content.includes('completed successfully'))
    expect(collapsedAssistant).toBeDefined()
  })

  it('always passes system messages through', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: 'Start chess' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'chess_start_game', arguments: '{}' } }],
      },
      {
        role: 'tool',
        content: JSON.stringify({ status: 'ok', summary: 'Chess game started.' }),
        tool_call_id: 'call_1',
      },
      { role: 'user', content: 'How do I play?' },
      { role: 'assistant', content: 'Move your pieces!' },
    ]
    const result = summarizeOldToolCalls(messages, 1)

    // System message must be first and unchanged
    expect(result[0].role).toBe('system')
    expect(result[0].content).toBe('You are a tutor.')
  })
})
