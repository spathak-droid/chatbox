import { AppResultEnvelopeSchema, type AppResultEnvelope } from '../shared-types/app-session.js'
import { query } from '../db/client.js'
import { findAppByToolName } from './registry.js'
import { getOrCreateSession, updateSession } from './session.js'

const TOOL_TIMEOUT_MS = 15000

export async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  context: { userId: string; conversationId: string }
): Promise<AppResultEnvelope> {
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
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS)

    const response = await fetch(`${app.baseUrl}/api/tools/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        args,
        sessionId: session.id,
        sessionState: session.state,
        userId: context.userId,
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
