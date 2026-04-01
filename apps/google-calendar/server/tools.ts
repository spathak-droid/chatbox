import type { AppResultEnvelope } from '../../../shared/types/app-session.js'
import { listEvents, createEvent, type CalendarEvent } from './google-api.js'

const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:3000'

interface SessionState {
  accessToken?: string
  connected?: boolean
  events?: CalendarEvent[]
  studyBlocks?: CalendarEvent[]
  [key: string]: unknown
}

interface StudyBlock {
  subject: string
  startTime: string
  endTime: string
  description?: string
}

export async function handleTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: SessionState,
  userId?: string,
  platformToken?: string,
): Promise<AppResultEnvelope> {
  switch (toolName) {
    case 'calendar_check_connection':
      return handleCheckConnection(sessionState, userId, platformToken)
    case 'calendar_start_connect':
      return handleStartConnect(userId, platformToken)
    case 'calendar_list_events':
      return handleListEvents(args, sessionState)
    case 'calendar_create_study_block':
      return handleCreateStudyBlock(args, sessionState)
    case 'calendar_create_study_plan':
      return handleCreateStudyPlan(args, sessionState)
    default:
      return { status: 'error', error: `Unknown tool: ${toolName}` }
  }
}

async function handleCheckConnection(
  sessionState: SessionState,
  userId?: string,
  platformToken?: string,
): Promise<AppResultEnvelope> {
  if (sessionState.accessToken) {
    return {
      status: 'ok',
      data: { connected: true },
      summary: 'Google Calendar is connected.',
    }
  }

  if (userId && platformToken) {
    try {
      const res = await fetch(`${PLATFORM_URL}/api/apps/oauth/google/status`, {
        headers: { Authorization: `Bearer ${platformToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        return {
          status: 'ok',
          data: { connected: data.connected },
          summary: data.connected
            ? 'Google Calendar is connected.'
            : 'Google Calendar is not connected. Use calendar_start_connect to authorize.',
        }
      }
    } catch {
      // Fall through
    }
  }

  return {
    status: 'ok',
    data: { connected: false },
    summary: 'Google Calendar is not connected. Use calendar_start_connect to authorize.',
  }
}

async function handleStartConnect(
  userId?: string,
  platformToken?: string,
): Promise<AppResultEnvelope> {
  if (userId && platformToken) {
    try {
      const res = await fetch(`${PLATFORM_URL}/api/apps/oauth/google/start`, {
        headers: { Authorization: `Bearer ${platformToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        return {
          status: 'ok',
          data: { authUrl: data.authUrl },
          summary: `Please open this URL to connect your Google Calendar: ${data.authUrl}`,
        }
      }
    } catch {
      // Fall through
    }
  }

  return {
    status: 'error',
    error: 'Unable to start Google authorization flow. Platform connection required.',
  }
}

function requireAccessToken(sessionState: SessionState): string | AppResultEnvelope {
  if (!sessionState.accessToken) {
    return {
      status: 'error',
      error: 'Google Calendar is not connected. Please use calendar_start_connect to authorize first.',
    }
  }
  return sessionState.accessToken
}

async function handleListEvents(
  args: Record<string, unknown>,
  sessionState: SessionState,
): Promise<AppResultEnvelope> {
  const tokenOrError = requireAccessToken(sessionState)
  if (typeof tokenOrError !== 'string') return tokenOrError

  try {
    const events = await listEvents(tokenOrError, {
      maxResults: args.maxResults as number | undefined,
      timeMin: args.timeMin as string | undefined,
      timeMax: args.timeMax as string | undefined,
    })

    const eventSummaries = events.map((e) => {
      const start = e.start.dateTime || e.start.date || 'unknown'
      return `- ${e.summary} (${start})`
    })

    return {
      status: 'ok',
      data: { events },
      summary: events.length > 0
        ? `Found ${events.length} upcoming events:\n${eventSummaries.join('\n')}`
        : 'No upcoming events found in the specified time range.',
    }
  } catch (err) {
    return {
      status: 'error',
      error: `Failed to list events: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function handleCreateStudyBlock(
  args: Record<string, unknown>,
  sessionState: SessionState,
): Promise<AppResultEnvelope> {
  const tokenOrError = requireAccessToken(sessionState)
  if (typeof tokenOrError !== 'string') return tokenOrError

  const subject = args.subject as string
  const startTime = args.startTime as string
  const endTime = args.endTime as string
  const description = args.description as string | undefined

  if (!subject || !startTime || !endTime) {
    return { status: 'error', error: 'Missing required parameters: subject, startTime, endTime' }
  }

  try {
    const event = await createEvent(tokenOrError, {
      summary: `📚 Study: ${subject}`,
      description: description || `Study block for ${subject}`,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
      colorId: '9', // Blueberry color
    })

    const existingBlocks = (sessionState.studyBlocks || []) as CalendarEvent[]

    return {
      status: 'ok',
      data: { studyBlocks: [...existingBlocks, event] },
      summary: `Created study block "${subject}" from ${startTime} to ${endTime}.`,
    }
  } catch (err) {
    return {
      status: 'error',
      error: `Failed to create study block: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function handleCreateStudyPlan(
  args: Record<string, unknown>,
  sessionState: SessionState,
): Promise<AppResultEnvelope> {
  const tokenOrError = requireAccessToken(sessionState)
  if (typeof tokenOrError !== 'string') return tokenOrError

  const blocks = args.blocks as StudyBlock[] | undefined
  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
    return { status: 'error', error: 'Missing or empty blocks array.' }
  }

  try {
    const createdEvents: CalendarEvent[] = []
    const errors: string[] = []

    for (const block of blocks) {
      if (!block.subject || !block.startTime || !block.endTime) {
        errors.push(`Skipped block: missing subject, startTime, or endTime`)
        continue
      }
      try {
        const event = await createEvent(tokenOrError, {
          summary: `📚 Study: ${block.subject}`,
          description: block.description || `Study block for ${block.subject}`,
          start: { dateTime: block.startTime },
          end: { dateTime: block.endTime },
          colorId: '9',
        })
        createdEvents.push(event)
      } catch (err) {
        errors.push(`Failed to create "${block.subject}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const existingBlocks = (sessionState.studyBlocks || []) as CalendarEvent[]

    let summary = `Created ${createdEvents.length} of ${blocks.length} study blocks.`
    if (createdEvents.length > 0) {
      summary += '\n' + createdEvents.map((e) => `- ${e.summary}`).join('\n')
    }
    if (errors.length > 0) {
      summary += `\nErrors: ${errors.join('; ')}`
    }

    return {
      status: 'ok',
      data: { studyBlocks: [...existingBlocks, ...createdEvents] },
      summary,
    }
  } catch (err) {
    return {
      status: 'error',
      error: `Failed to create study plan: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
