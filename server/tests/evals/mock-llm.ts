import { vi } from 'vitest'
import { APP_TOOL_RESPONSES } from './setup.js'

export interface MockLLMResponse {
  pass1: {
    content?: string
    tool_calls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
  }
  pass2?: {
    content: string
  }
}

interface MockAppResponses {
  [toolName: string]: Record<string, unknown>
}

let callCount = 0

export function mockOpenRouterAndApps(
  llmResponse: MockLLMResponse,
  appResponses: MockAppResponses = APP_TOOL_RESPONSES
) {
  callCount = 0

  const originalFetch = globalThis.fetch

  const mockedFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

    // Intercept OpenRouter calls
    if (url.includes('openrouter.ai')) {
      callCount++
      const body = init?.body ? JSON.parse(init.body as string) : {}
      const isPass1 = body.stream === false
      const isPass2 = body.stream === true && !body.tools

      if (isPass1) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: llmResponse.pass1.content || '',
              tool_calls: llmResponse.pass1.tool_calls || undefined,
            },
            finish_reason: llmResponse.pass1.tool_calls ? 'tool_calls' : 'stop',
          }],
          usage: { total_tokens: 100 },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (isPass2 && llmResponse.pass2) {
        const sseData = [
          `data: ${JSON.stringify({ choices: [{ delta: { content: llmResponse.pass2.content } }] })}\n\n`,
          'data: [DONE]\n\n',
        ].join('')

        return new Response(sseData, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }

      // Default: empty response
      return new Response(JSON.stringify({
        choices: [{ message: { content: '' }, finish_reason: 'stop' }],
        usage: { total_tokens: 10 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Intercept app server calls
    const toolMatch = url.match(/\/api\/tools\/(\w+)$/)
    if (toolMatch) {
      const toolName = toolMatch[1]
      const response = appResponses[toolName]
      if (response) {
        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ status: 'error', error: `Unknown tool: ${toolName}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Pass through all other requests
    return originalFetch(input, init)
  }) as unknown as typeof fetch

  vi.stubGlobal('fetch', mockedFetch)

  return {
    getMockedFetch: () => mockedFetch,
    getCallCount: () => callCount,
    restore: () => vi.unstubAllGlobals(),
  }
}

// Helper to create a mock Express response that captures SSE events
export function createMockSSEResponse() {
  const events: Array<{ type: string; [key: string]: unknown }> = []
  let ended = false
  const chunks: string[] = []

  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn((data: string) => {
      chunks.push(data)
      if (data.startsWith('data: ') && data !== 'data: [DONE]\n\n') {
        try {
          const event = JSON.parse(data.slice(6).trim())
          events.push(event)
        } catch {}
      }
    }),
    end: vi.fn(() => { ended = true }),
  }

  return {
    res: res as any,
    getEvents: () => events,
    isEnded: () => ended,
    getTextEvents: () => events.filter(e => e.type === 'text'),
    getToolCallEvents: () => events.filter(e => e.type === 'tool_call'),
    getToolResultEvents: () => events.filter(e => e.type === 'tool_result'),
    getPendingConfirmationEvents: () => events.filter(e => e.type === 'pending_confirmation'),
    getErrorEvents: () => events.filter(e => e.type === 'error'),
  }
}
