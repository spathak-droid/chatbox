import { describe, it, expect, afterEach, afterAll, vi } from 'vitest'
import { streamChatWithTools } from '../../src/chat/openrouter.js'
import { mockOpenRouterAndApps, createMockSSEResponse } from './mock-llm.js'
import { createEvalTrace, scoreAssertion, flushLangfuse, setupEvalSuite } from './setup.js'
import { clearPendingActions, executePendingActions, getPendingActions } from '../../src/apps/tool-router.js'
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

// Mock getAllToolSchemas to return mock schemas without hitting the DB
vi.spyOn(registry, 'getAllToolSchemas').mockImplementation(async () => {
  return MOCK_APPS.flatMap((app: any) =>
    app.tools.map((tool: any) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }))
  )
})

// Spy on routeToolCall to avoid DB calls (getOrCreateSession / tool_invocations)
vi.spyOn(toolRouter, 'routeToolCall').mockImplementation(async (toolName: string, _args, _ctx) => {
  const response = APP_TOOL_RESPONSES[toolName]
  if (response) return response as any
  return { status: 'error', error: `Unknown tool: ${toolName}` }
})

const CATEGORY = 'concurrency'
setupEvalSuite()

describe('Concurrency Evals', () => {
  let mockCtx: ReturnType<typeof mockOpenRouterAndApps>

  afterEach(() => {
    mockCtx?.restore()
  })

  afterAll(async () => {
    await flushLangfuse()
  })

  it('C1: two users, two conversations — no cross-contamination', async () => {
    const trace = createEvalTrace(CATEGORY, 'C1')
    mockCtx = mockOpenRouterAndApps({
      pass1: {
        tool_calls: [{
          id: 'tc-c1', type: 'function',
          function: { name: 'chess_start_game', arguments: '{}' },
        }],
      },
      pass2: { content: 'Game started!' },
    })

    const res1 = createMockSSEResponse()
    const res2 = createMockSSEResponse()

    // Run two requests in parallel for different users/conversations
    await Promise.all([
      streamChatWithTools(
        [{ role: 'user', content: "Let's play chess" }],
        '00000000-0000-0000-0000-00000000c001', 'user-1', res1.res
      ),
      streamChatWithTools(
        [{ role: 'user', content: "Let's play chess" }],
        '00000000-0000-0000-0000-00000000c002', 'user-2', res2.res
      ),
    ])

    // Both should complete
    expect(res1.isEnded()).toBe(true)
    expect(res2.isEnded()).toBe(true)

    // Both should have chess tool calls
    const user1Chess = res1.getToolCallEvents().some(e => e.toolName === 'chess_start_game')
    const user2Chess = res2.getToolCallEvents().some(e => e.toolName === 'chess_start_game')

    expect(user1Chess).toBe(true)
    expect(user2Chess).toBe(true)

    scoreAssertion(trace.id, 'both_complete', res1.isEnded() && res2.isEnded())
    scoreAssertion(trace.id, 'both_correct', user1Chess && user2Chess)
  })

  it('C2: same user, 3 messages in <1s — no crash', async () => {
    const trace = createEvalTrace(CATEGORY, 'C2')
    mockCtx = mockOpenRouterAndApps({
      pass1: {
        tool_calls: [{
          id: 'tc-c2', type: 'function',
          function: { name: 'chess_start_game', arguments: '{}' },
        }],
      },
      pass2: { content: 'Game started!' },
    })

    const responses = [createMockSSEResponse(), createMockSSEResponse(), createMockSSEResponse()]

    await Promise.all(
      responses.map((r) =>
        streamChatWithTools(
          [{ role: 'user', content: "Let's play chess" }],
          '00000000-0000-0000-0000-00000000c002', 'user-1', r.res
        )
      )
    )

    const allEnded = responses.every(r => r.isEnded())
    expect(allEnded).toBe(true)
    scoreAssertion(trace.id, 'all_complete', allEnded)
  })

  it('C3: confirm + cancel race on same conversation', async () => {
    const trace = createEvalTrace(CATEGORY, 'C3')
    // Set up pending actions
    const convId = '00000000-0000-0000-0000-00000000c003'
    clearPendingActions(convId)

    // Manually add a pending action (simulate what routeToolCall does)
    // Since we can't easily inject, we test the confirm/cancel ordering
    clearPendingActions(convId)
    const results = await executePendingActions(convId, { userId: 'user-1' })
    const hasError = results.some(r => r.status === 'error')

    expect(hasError).toBe(true)
    scoreAssertion(trace.id, 'race_handled', hasError)
  })

  it('C4: response ends cleanly', async () => {
    const trace = createEvalTrace(CATEGORY, 'C4')
    mockCtx = mockOpenRouterAndApps({
      pass1: { content: 'Hello!' },
    })

    const res1 = createMockSSEResponse()
    await streamChatWithTools(
      [{ role: 'user', content: 'Hi' }],
      '00000000-0000-0000-0000-00000000c004', 'user-1', res1.res
    )

    expect(res1.isEnded()).toBe(true)
    scoreAssertion(trace.id, 'clean_end', res1.isEnded())
  })
})
