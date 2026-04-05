import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getOrCreateSession, updateSession, getSessionsForConversation } from '../../src/apps/session.js'
import { query } from '../../src/db/client.js'

let userId: string
let conversationId: string

beforeAll(async () => {
  // Create test user
  const userResult = await query(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, 'test-hash', 'SessionTest', 'student') RETURNING id`,
    [`session-test-${Date.now()}@test.com`]
  )
  userId = userResult.rows[0].id

  // Create test conversation
  const convResult = await query(
    'INSERT INTO conversations (user_id) VALUES ($1) RETURNING id',
    [userId]
  )
  conversationId = convResult.rows[0].id

  // Ensure chess app exists
  await query(
    `INSERT INTO apps (id, name, description, category, base_url, manifest)
     VALUES ('chess', 'Chess', 'Chess game', 'games', 'http://localhost:3003', '{}')
     ON CONFLICT (id) DO NOTHING`
  )

  // Ensure math-practice app exists
  await query(
    `INSERT INTO apps (id, name, description, category, base_url, manifest)
     VALUES ('math-practice', 'Math Practice', 'Math practice app', 'education', 'http://localhost:3004', '{}')
     ON CONFLICT (id) DO NOTHING`
  )

  // Ensure whiteboard app exists
  await query(
    `INSERT INTO apps (id, name, description, category, base_url, manifest)
     VALUES ('whiteboard', 'Whiteboard', 'Whiteboard app', 'tools', 'http://localhost:3005', '{}')
     ON CONFLICT (id) DO NOTHING`
  )
})

afterAll(async () => {
  await query('DELETE FROM app_sessions WHERE conversation_id = $1', [conversationId])
  await query('DELETE FROM conversations WHERE id = $1', [conversationId])
  await query('DELETE FROM users WHERE id = $1', [userId])
})

describe('getOrCreateSession', () => {
  it('creates a new active session', async () => {
    const session = await getOrCreateSession('chess', conversationId, userId)

    expect(session.id).toBeDefined()
    expect(session.appId).toBe('chess')
    expect(session.conversationId).toBe(conversationId)
    expect(session.userId).toBe(userId)
    expect(session.status).toBe('active')
  })

  it('returns existing active session on second call with same args', async () => {
    const first = await getOrCreateSession('chess', conversationId, userId)
    const second = await getOrCreateSession('chess', conversationId, userId)

    expect(second.id).toBe(first.id)
  })

  it('auto-closes other app sessions when starting a new app', async () => {
    // chess session should already exist and be active from prior tests
    // Now create a math-practice session — chess should be auto-closed
    await getOrCreateSession('math-practice', conversationId, userId)

    const result = await query(
      `SELECT status FROM app_sessions WHERE app_id = 'chess' AND conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    )

    expect(result.rows.length).toBeGreaterThan(0)
    // All chess sessions in this conversation should be completed
    for (const row of result.rows) {
      expect(row.status).toBe('completed')
    }
  })

  it('reactivates a completed session for the same app', async () => {
    // Create a session, complete it, then call getOrCreateSession again
    const s1 = await getOrCreateSession('whiteboard', conversationId, userId)
    await updateSession(s1.id, { elements: [{ id: '1' }] }, 'completed', 'Closed by user')

    const s2 = await getOrCreateSession('whiteboard', conversationId, userId)
    expect(s2.id).toBe(s1.id)
    expect(s2.status).toBe('active')
    expect((s2.state as any).elements).toEqual([{ id: '1' }])
  })
})

describe('updateSession', () => {
  it('patches state and updates status and summary', async () => {
    const session = await getOrCreateSession('math-practice', conversationId, userId)

    await updateSession(session.id, { score: 5 }, 'completed', 'Math done')

    const result = await query(
      'SELECT state, status, summary FROM app_sessions WHERE id = $1',
      [session.id]
    )

    expect(result.rows.length).toBe(1)
    expect(result.rows[0].state.score).toBe(5)
    expect(result.rows[0].status).toBe('completed')
    expect(result.rows[0].summary).toBe('Math done')
  })
})

describe('getSessionsForConversation', () => {
  it('returns all sessions for the conversation', async () => {
    const sessions = await getSessionsForConversation(conversationId)

    expect(sessions.length).toBeGreaterThanOrEqual(2)

    const appIds = sessions.map((s) => s.appId)
    expect(appIds).toContain('chess')
    expect(appIds).toContain('math-practice')
  })
})
