import { query } from '../db/client.js'
import type { AppSession } from '../shared-types/app-session.js'

function rowToSession(row: any): AppSession {
  return {
    id: row.id,
    appId: row.app_id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    state: row.state,
    status: row.status,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getOrCreateSession(
  appId: string, conversationId: string, userId: string
): Promise<AppSession> {
  // 1. Return existing active session if one exists
  const existing = await query(
    `SELECT * FROM app_sessions WHERE app_id = $1 AND conversation_id = $2 AND user_id = $3 AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [appId, conversationId, userId]
  )

  if (existing.rows.length > 0) return rowToSession(existing.rows[0])

  // 2. Reactivate the most recent completed session for this app (preserves state like drawings)
  const completed = await query(
    `SELECT * FROM app_sessions WHERE app_id = $1 AND conversation_id = $2 AND user_id = $3 AND status = 'completed'
     ORDER BY updated_at DESC LIMIT 1`,
    [appId, conversationId, userId]
  )

  if (completed.rows.length > 0) {
    await query(
      `UPDATE app_sessions SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [completed.rows[0].id]
    )
    return rowToSession({ ...completed.rows[0], status: 'active' })
  }

  // 3. Auto-close any active sessions for OTHER apps in this conversation
  await query(
    `UPDATE app_sessions SET status = 'completed', summary = COALESCE(summary, 'Ended (switched to another app)'), updated_at = NOW()
     WHERE conversation_id = $1 AND user_id = $2 AND status = 'active' AND app_id != $3`,
    [conversationId, userId, appId]
  )

  // 4. Create fresh session
  const result = await query(
    `INSERT INTO app_sessions (app_id, conversation_id, user_id, state, status)
     VALUES ($1, $2, $3, '{}', 'active') RETURNING *`,
    [appId, conversationId, userId]
  )

  return rowToSession(result.rows[0])
}

export async function updateSession(
  sessionId: string, statePatch: Record<string, unknown>, status?: string, summary?: string, replace?: boolean
) {
  const stateExpr = replace ? '$1::jsonb' : 'state || $1::jsonb'
  await query(
    `UPDATE app_sessions SET
      state = ${stateExpr},
      status = COALESCE($2, status),
      summary = COALESCE($3, summary),
      updated_at = NOW()
     WHERE id = $4`,
    [JSON.stringify(statePatch), status || null, summary || null, sessionId]
  )
}

export async function getSessionsForConversation(conversationId: string): Promise<AppSession[]> {
  const result = await query(
    `SELECT * FROM app_sessions WHERE conversation_id = $1 ORDER BY created_at`,
    [conversationId]
  )
  return result.rows.map(rowToSession)
}
