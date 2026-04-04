import { describe, it, expect, beforeAll } from 'vitest'

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'

async function registerAndLogin(role: 'student' | 'teacher' = 'student'): Promise<{ token: string; userId: string }> {
  const email = `chat-routes-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`
  const password = 'testpass123'

  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'Test User', role }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Register failed: ${JSON.stringify(data)}`)

  return { token: data.token, userId: data.user?.id || '' }
}

async function createConversation(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/chat/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message: 'hello' }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Chat send failed (${res.status}): ${err}`)
  }

  const text = await res.text()
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    try {
      const event = JSON.parse(line.slice(6))
      if (event.type === 'conversation' && event.conversationId) {
        return event.conversationId
      }
    } catch {}
  }

  throw new Error('No conversation event found in SSE response')
}

describe('Chat routes — ownership and authorization', () => {
  let userAToken: string
  let userAId: string
  let userAConvId: string

  let userBToken: string
  let userBId: string

  let studentToken: string
  let teacherToken: string
  let teacherConvId: string

  beforeAll(async () => {
    // Set up userA (student) with a conversation
    const userA = await registerAndLogin('student')
    userAToken = userA.token
    userAId = userA.userId
    userAConvId = await createConversation(userAToken)

    // Set up userB (student) — separate user with no conversations
    const userB = await registerAndLogin('student')
    userBToken = userB.token
    userBId = userB.userId

    // Set up student and teacher for moderation-log tests
    const student = await registerAndLogin('student')
    studentToken = student.token

    const teacher = await registerAndLogin('teacher')
    teacherToken = teacher.token
    teacherConvId = await createConversation(teacherToken)
  }, 60000)

  it('GET /conversations/:id/messages — owner can read (200)', async () => {
    const res = await fetch(`${API_BASE}/chat/conversations/${userAConvId}/messages`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('messages')
    expect(Array.isArray(body.messages)).toBe(true)
  })

  it('GET /conversations/:id/messages — non-owner gets 404', async () => {
    const res = await fetch(`${API_BASE}/chat/conversations/${userAConvId}/messages`, {
      headers: { Authorization: `Bearer ${userBToken}` },
    })
    expect(res.status).toBe(404)
  })

  it('DELETE /conversations/:id — non-owner gets 404', async () => {
    const res = await fetch(`${API_BASE}/chat/conversations/${userAConvId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userBToken}` },
    })
    expect(res.status).toBe(404)
  })

  it('GET /conversations/:id/moderation-log — student gets 403', async () => {
    const res = await fetch(`${API_BASE}/chat/conversations/${teacherConvId}/moderation-log`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    expect(res.status).toBe(403)
  })

  it('GET /conversations/:id/moderation-log — teacher gets 200', async () => {
    const res = await fetch(`${API_BASE}/chat/conversations/${teacherConvId}/moderation-log`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('events')
    expect(Array.isArray(body.events)).toBe(true)
  })

  it('GET /conversations — returns only own conversations (userB should NOT see userA\'s)', async () => {
    const res = await fetch(`${API_BASE}/chat/conversations`, {
      headers: { Authorization: `Bearer ${userBToken}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('conversations')
    expect(Array.isArray(body.conversations)).toBe(true)
    const ids = body.conversations.map((c: any) => c.id)
    expect(ids).not.toContain(userAConvId)
  })

  it('Requires auth — returns 401 without token', async () => {
    const res = await fetch(`${API_BASE}/chat/conversations`)
    expect(res.status).toBe(401)
  })
})
