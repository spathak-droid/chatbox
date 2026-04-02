import { AppResultEnvelopeSchema, type AppResultEnvelope } from '../shared-types/app-session.js'
import { query } from '../db/client.js'
import { findAppByToolName } from './registry.js'
import { getOrCreateSession, updateSession } from './session.js'
import { getOAuthConnection } from './oauth-manager.js'

const TOOL_TIMEOUT_MS = 15000

// Tools that modify external user data need confirmation
const DESTRUCTIVE_TOOLS = new Set([
  'calendar_delete_event',
  'calendar_update_event',
  'calendar_create_study_plan',
])

// Pending confirmations stored in memory (keyed by conversation)
const pendingActions = new Map<string, Array<{
  id: string
  toolName: string
  args: Record<string, unknown>
  description: string
}>>()

export function getPendingActions(conversationId: string) {
  return pendingActions.get(conversationId) || []
}

export function clearPendingActions(conversationId: string) {
  pendingActions.delete(conversationId)
}

export async function executePendingActions(
  conversationId: string,
  context: { userId: string; authToken?: string }
): Promise<AppResultEnvelope[]> {
  const actions = pendingActions.get(conversationId)
  if (!actions || actions.length === 0) {
    return [{ status: 'error', error: 'No pending actions to confirm.' }]
  }

  const results: AppResultEnvelope[] = []
  for (const action of actions) {
    const result = await routeToolCall(action.toolName, action.args, {
      ...context,
      conversationId,
      _skipConfirmation: true,
    })
    results.push(result)
  }

  pendingActions.delete(conversationId)
  return results
}

export async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  context: { userId: string; conversationId: string; authToken?: string; _skipConfirmation?: boolean }
): Promise<AppResultEnvelope> {
  // Intercept destructive tools — require confirmation
  if (DESTRUCTIVE_TOOLS.has(toolName) && !context._skipConfirmation) {
    const description = describeAction(toolName, args)
    const existing = pendingActions.get(context.conversationId) || []
    existing.push({
      id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      toolName,
      args,
      description,
    })
    pendingActions.set(context.conversationId, existing)

    return {
      status: 'pending' as any,
      data: { pendingConfirmation: true, actions: existing.map(a => ({ id: a.id, description: a.description })) },
      summary: `Action queued for confirmation: ${description}. Waiting for user to confirm.`,
      appSessionId: '',
    }
  }

  const app = findAppByToolName(toolName)
  if (!app) {
    return { status: 'error', error: `No app found for tool: ${toolName}` }
  }

  const session = await getOrCreateSession(app.id, context.conversationId, context.userId)

  const invResult = await query(
    `INSERT INTO tool_invocations (app_id, app_session_id, conversation_id, user_id, tool_name, input, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id`,
    [app.id, session.id, context.conversationId, context.userId, toolName, JSON.stringify(args)]
  )
  const invocationId = invResult.rows[0].id
  const startTime = Date.now()

  try {
    // Inject OAuth token for calendar tools
    let sessionState = session.state as Record<string, unknown>
    if (toolName.startsWith('calendar_')) {
      const oauthConn = await getOAuthConnection(context.userId, 'google')
      if (oauthConn) {
        sessionState = { ...sessionState, accessToken: oauthConn.access_token, connected: true }
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS)

    const response = await fetch(`${app.baseUrl}/api/tools/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        args,
        sessionId: session.id,
        sessionState,
        userId: context.userId,
        platformToken: context.authToken,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(`App returned ${response.status}: ${errBody}`)
    }

    const result = AppResultEnvelopeSchema.parse(await response.json())
    const durationMs = Date.now() - startTime

    await query(
      `UPDATE tool_invocations SET status = 'success', output = $1, duration_ms = $2 WHERE id = $3`,
      [JSON.stringify(result), durationMs, invocationId]
    )

    if (result.data) {
      const isEnd = toolName.includes('end_game') || toolName.includes('finish_session')
      const isCompleted = isEnd || (result.data as any)?.gameOver || (result.data as any)?.finished
        || (result.status === 'ok' && result.summary?.toLowerCase().includes('completed'))
      await updateSession(session.id, result.data, isCompleted ? 'completed' : 'active', result.summary)
    }

    result.appSessionId = session.id
    return result
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMsg = err instanceof Error ? err.message : String(err)
    const status = errorMsg.includes('abort') ? 'timeout' : 'error'

    await query(
      `UPDATE tool_invocations SET status = $1, error = $2, duration_ms = $3 WHERE id = $4`,
      [status, errorMsg, durationMs, invocationId]
    )

    return { status: 'error', error: status === 'timeout' ? `Tool ${toolName} timed out after ${TOOL_TIMEOUT_MS}ms` : errorMsg }
  }
}

function describeAction(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'calendar_delete_event':
      return `Delete event (ID: ${args.eventId || 'unknown'})`
    case 'calendar_update_event': {
      const parts = []
      if (args.summary) parts.push(`rename to "${args.summary}"`)
      if (args.startTime) parts.push(`move to ${args.startTime}`)
      return `Update event (ID: ${args.eventId || 'unknown'})${parts.length ? ': ' + parts.join(', ') : ''}`
    }
    case 'calendar_create_study_plan': {
      const blocks = args.blocks as any[] || []
      return `Create ${blocks.length} study blocks on your calendar`
    }
    default:
      return `${toolName} with ${JSON.stringify(args)}`
  }
}
