interface AppResultEnvelope {
  status: 'ok' | 'error' | 'pending'
  data?: Record<string, unknown>
  summary?: string
  error?: string
}

export function handleTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: Record<string, unknown> | null
): AppResultEnvelope {
  switch (toolName) {
    case 'whiteboard_open': {
      return {
        status: 'ok',
        data: {
          active: true,
          startedAt: new Date().toISOString(),
        },
        summary: 'Collaborative whiteboard opened! The student can draw, add shapes, write text, and collaborate in real-time on the infinite canvas.',
      }
    }

    case 'whiteboard_close': {
      return {
        status: 'ok',
        data: {
          active: false,
          gameOver: true,
        },
        summary: 'Whiteboard closed.',
      }
    }

    default:
      return { status: 'error', error: `Unknown tool: ${toolName}` }
  }
}
