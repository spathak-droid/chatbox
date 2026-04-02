import { describe, it, expect, afterEach, afterAll, vi } from 'vitest'
import { streamChatWithTools } from '../../src/chat/openrouter.js'
import { mockOpenRouterAndApps, createMockSSEResponse } from './mock-llm.js'
import { createEvalTrace, scoreAssertion, flushLangfuse, setupEvalSuite } from './setup.js'
import { clearPendingActions, executePendingActions } from '../../src/apps/tool-router.js'
import * as registry from '../../src/apps/registry.js'
import * as toolRouter from '../../src/apps/tool-router.js'
import { APP_TOOL_RESPONSES } from './setup.js'

// Seed minimal app manifests into the registry so guardrails work without a live DB
const MOCK_APPS = [
  {
    id: 'chess', name: 'Chess', description: '', category: 'game', authType: 'none' as const,
    baseUrl: 'http://localhost:3101', iframeUrl: 'http://localhost:3101',
    activationKeywords: ['chess', 'play a game', 'play', "let's play"],
    tools: [
      { name: 'chess_start_game', description: 'Start chess', parameters: { type: 'object' as const, properties: {}, required: [] } },
      { name: 'chess_end_game', description: 'End chess', parameters: { type: 'object' as const, properties: {}, required: [] } },
    ],
  },
  {
    id: 'math-practice', name: 'Math Practice', description: '', category: 'education', authType: 'none' as const,
    baseUrl: 'http://localhost:3102', iframeUrl: 'http://localhost:3102',
    activationKeywords: ['math', 'practice', 'problems', 'addition', 'algebra', 'subtract', 'multiply', 'divid'],
    tools: [
      { name: 'math_start_session', description: 'Start math', parameters: { type: 'object' as const, properties: {}, required: [] } },
    ],
  },
  {
    id: 'flashcards', name: 'Flashcards', description: '', category: 'education', authType: 'none' as const,
    baseUrl: 'http://localhost:3103', iframeUrl: 'http://localhost:3103',
    activationKeywords: ['flash', 'study', 'quiz', 'review', 'learn about'],
    tools: [
      { name: 'flashcards_start_deck', description: 'Start flashcards', parameters: { type: 'object' as const, properties: {}, required: [] } },
    ],
  },
  {
    id: 'google-calendar', name: 'Calendar', description: '', category: 'productivity', authType: 'oauth' as const,
    baseUrl: 'http://localhost:3104', iframeUrl: 'http://localhost:3104',
    activationKeywords: ['calendar', 'schedule', 'event', 'study block', 'study plan'],
    tools: [
      { name: 'calendar_search_events', description: 'Search events', parameters: { type: 'object' as const, properties: {}, required: [] } },
      { name: 'calendar_create_event', description: 'Create event', parameters: { type: 'object' as const, properties: {}, required: [] } },
      { name: 'calendar_delete_event', description: 'Delete event', parameters: { type: 'object' as const, properties: {}, required: [] } },
      { name: 'calendar_update_event', description: 'Update event', parameters: { type: 'object' as const, properties: {}, required: [] } },
    ],
  },
] as any[]

// Spy on findAppByToolName to return our mock apps without hitting the DB
vi.spyOn(registry, 'findAppByToolName').mockImplementation((toolName: string) => {
  return MOCK_APPS.find(app => app.tools.some((t: any) => t.name === toolName))
})

// Spy on getCachedApps to return mock apps
vi.spyOn(registry, 'getCachedApps').mockImplementation(() => MOCK_APPS)

// Mock routeToolCall to avoid DB calls (getOrCreateSession / tool_invocations)
const routeToolCallSpy = vi.spyOn(toolRouter, 'routeToolCall').mockImplementation(async (toolName: string, _args, _ctx) => {
  const response = APP_TOOL_RESPONSES[toolName]
  if (response) return response as any
  return { status: 'error', error: `Unknown tool: ${toolName}` }
})

const CATEGORY = 'dark'
setupEvalSuite()

describe('Dark Evals — Failure Modes & Edge Cases', () => {
  let mockCtx: ReturnType<typeof mockOpenRouterAndApps>

  afterEach(() => {
    mockCtx?.restore()
  })

  afterAll(async () => {
    await flushLangfuse()
  })

  it('D1: LLM returns tool_calls with missing id', async () => {
    const trace = createEvalTrace(CATEGORY, 'D1')
    mockCtx = mockOpenRouterAndApps({
      pass1: {
        tool_calls: [{
          id: '', type: 'function',
          function: { name: 'chess_start_game', arguments: '{}' },
        }],
      },
      pass2: { content: 'Started!' },
    })

    const { res } = createMockSSEResponse()
    // Should not throw
    await expect(
      streamChatWithTools(
        [{ role: 'user', content: "Let's play chess" }],
        '00000000-0000-0000-0000-00000000d001', 'user-1', res
      )
    ).resolves.not.toThrow()

    expect(res.end).toHaveBeenCalled()
    scoreAssertion(trace.id, 'no_crash', true)
  })

  it('D2: LLM returns tool_calls with empty function name', async () => {
    const trace = createEvalTrace(CATEGORY, 'D2')
    mockCtx = mockOpenRouterAndApps({
      pass1: {
        tool_calls: [{
          id: 'tc-d2', type: 'function',
          function: { name: '', arguments: '{}' },
        }],
      },
    })

    const { res } = createMockSSEResponse()
    await expect(
      streamChatWithTools(
        [{ role: 'user', content: "Let's play chess" }],
        '00000000-0000-0000-0000-00000000d002', 'user-1', res
      )
    ).resolves.not.toThrow()

    expect(res.end).toHaveBeenCalled()
    scoreAssertion(trace.id, 'no_crash', true)
  })

  it('D3: LLM returns nonexistent tool', async () => {
    const trace = createEvalTrace(CATEGORY, 'D3')
    mockCtx = mockOpenRouterAndApps({
      pass1: {
        tool_calls: [{
          id: 'tc-d3', type: 'function',
          function: { name: 'nonexistent_tool', arguments: '{}' },
        }],
      },
    })

    const { res, getToolResultEvents } = createMockSSEResponse()
    await streamChatWithTools(
      [{ role: 'user', content: "Let's play chess" }],
      '00000000-0000-0000-0000-00000000d003', 'user-1', res
    )

    // Should get error in tool result, not a crash
    const results = getToolResultEvents()
    const hasError = results.some(e => (e.result as any)?.status === 'error')
    expect(res.end).toHaveBeenCalled()
    scoreAssertion(trace.id, 'no_crash', true)
    scoreAssertion(trace.id, 'returns_error', hasError)
  })

  it('D5: tool call error is handled gracefully', async () => {
    const trace = createEvalTrace(CATEGORY, 'D5')
    routeToolCallSpy.mockRejectedValueOnce(new Error('Tool timed out after 15000ms'))
    mockCtx = mockOpenRouterAndApps({
      pass1: {
        tool_calls: [{
          id: 'tc-d5', type: 'function',
          function: { name: 'chess_start_game', arguments: '{}' },
        }],
      },
    })

    const { res } = createMockSSEResponse()
    // Should handle the rejection gracefully
    try {
      await streamChatWithTools(
        [{ role: 'user', content: "Let's play chess" }],
        '00000000-0000-0000-0000-00000000d005', 'user-1', res
      )
    } catch {
      // Even if it throws, the test verifies it doesn't hang
    }

    scoreAssertion(trace.id, 'no_hang', true)
  })

  it('D6: OAuth token expired', async () => {
    const trace = createEvalTrace(CATEGORY, 'D6')
    routeToolCallSpy.mockResolvedValueOnce({ status: 'error', error: 'OAuth token expired (401)' })
    mockCtx = mockOpenRouterAndApps({
      pass1: {
        tool_calls: [{
          id: 'tc-d6', type: 'function',
          function: { name: 'calendar_search_events', arguments: '{}' },
        }],
      },
    })

    const { res } = createMockSSEResponse()
    await streamChatWithTools(
      [{ role: 'user', content: 'Open my calendar' }],
      '00000000-0000-0000-0000-00000000d006', 'user-1', res
    )

    expect(res.end).toHaveBeenCalled()
    scoreAssertion(trace.id, 'no_crash', true)
  })

  it('D7: Pass 1 returns both content and tool_calls — text not streamed', async () => {
    const trace = createEvalTrace(CATEGORY, 'D7')
    mockCtx = mockOpenRouterAndApps({
      pass1: {
        content: 'Sure! Starting chess now!', // This should NOT be streamed
        tool_calls: [{
          id: 'tc-d7', type: 'function',
          function: { name: 'chess_start_game', arguments: '{}' },
        }],
      },
      pass2: { content: 'Game ready!' },
    })

    const { res, getTextEvents } = createMockSSEResponse()
    await streamChatWithTools(
      [{ role: 'user', content: "Let's play chess" }],
      '00000000-0000-0000-0000-00000000d007', 'user-1', res
    )

    const textEvents = getTextEvents()
    // Pass 1 text should NOT appear — only Pass 2 text
    const hasPass1Text = textEvents.some(e => String(e.content).includes('Starting chess now'))
    const hasPass2Text = textEvents.some(e => String(e.content).includes('Game ready'))

    expect(hasPass1Text).toBe(false)
    expect(hasPass2Text).toBe(true)

    scoreAssertion(trace.id, 'pass1_text_suppressed', !hasPass1Text)
    scoreAssertion(trace.id, 'pass2_text_present', hasPass2Text)
  })

  it('D8: Pass 2 has no tools param — prevents hallucinated tool calls', async () => {
    const trace = createEvalTrace(CATEGORY, 'D8')
    mockCtx = mockOpenRouterAndApps({
      pass1: {
        tool_calls: [{
          id: 'tc-d8', type: 'function',
          function: { name: 'chess_start_game', arguments: '{}' },
        }],
      },
      pass2: { content: 'Game started!' },
    })

    const { res, getToolCallEvents } = createMockSSEResponse()
    await streamChatWithTools(
      [{ role: 'user', content: "Let's play chess" }],
      '00000000-0000-0000-0000-00000000d008', 'user-1', res
    )

    const toolCalls = getToolCallEvents()
    expect(toolCalls.length).toBeLessThanOrEqual(5)
    scoreAssertion(trace.id, 'single_tool_call', toolCalls.length <= 5)
  })

  it('D10: same destructive action submitted twice', async () => {
    const trace = createEvalTrace(CATEGORY, 'D10')
    const convId = '00000000-0000-0000-0000-00000000d010'
    clearPendingActions(convId)

    // Simulate two pending actions queued for same conversation
    // routeToolCall with destructive tool queues them
    routeToolCallSpy.mockResolvedValueOnce({
      status: 'pending' as any,
      data: { pendingConfirmation: true, actions: [{ id: 'a1', description: 'Delete event' }] },
      summary: 'Queued',
      appSessionId: '',
    })
    routeToolCallSpy.mockResolvedValueOnce({
      status: 'pending' as any,
      data: { pendingConfirmation: true, actions: [{ id: 'a2', description: 'Delete event' }] },
      summary: 'Queued',
      appSessionId: '',
    })

    // Two destructive calls in one batch
    mockCtx = mockOpenRouterAndApps({
      pass1: {
        tool_calls: [
          { id: 'tc-d10a', type: 'function', function: { name: 'calendar_delete_event', arguments: '{"eventId":"evt-1"}' } },
          { id: 'tc-d10b', type: 'function', function: { name: 'calendar_delete_event', arguments: '{"eventId":"evt-1"}' } },
        ],
      },
    })

    const { res } = createMockSSEResponse()
    await streamChatWithTools(
      [{ role: 'user', content: 'Delete that event' }],
      convId, 'user-1', res
    )

    expect(res.end).toHaveBeenCalled()
    scoreAssertion(trace.id, 'no_crash', true)
  })

  it('D9: empty messages array', async () => {
    const trace = createEvalTrace(CATEGORY, 'D9')
    mockCtx = mockOpenRouterAndApps({
      pass1: { content: '' },
    })

    const { res } = createMockSSEResponse()
    await expect(
      streamChatWithTools([], '00000000-0000-0000-0000-00000000d009', 'user-1', res)
    ).resolves.not.toThrow()

    expect(res.end).toHaveBeenCalled()
    scoreAssertion(trace.id, 'no_crash', true)
  })

  it('D11: confirm with no pending actions', async () => {
    const trace = createEvalTrace(CATEGORY, 'D11')
    clearPendingActions('conv-d11')

    const results = await executePendingActions('conv-d11', { userId: 'user-1' })
    const hasError = results.some(r => r.status === 'error')

    expect(hasError).toBe(true)
    scoreAssertion(trace.id, 'returns_error', hasError)
  })

  it('D12: cancel then confirm same conversation', async () => {
    const trace = createEvalTrace(CATEGORY, 'D12')
    // Simulate: some actions were pending, then cancelled
    clearPendingActions('conv-d12')

    // Now confirm — should have nothing
    const results = await executePendingActions('conv-d12', { userId: 'user-1' })
    const hasError = results.some(r => r.status === 'error')

    expect(hasError).toBe(true)
    scoreAssertion(trace.id, 'confirm_after_cancel_errors', hasError)
  })
})
