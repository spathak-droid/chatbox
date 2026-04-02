const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'

export async function registerAndLogin(): Promise<{ token: string; userId: string }> {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`
  const password = 'testpass123'

  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'Test User' }),
  })
  const regData = await regRes.json()
  if (!regRes.ok) throw new Error(`Register failed: ${JSON.stringify(regData)}`)

  return { token: regData.token, userId: regData.user?.id || '' }
}

export async function sendChatMessage(
  token: string,
  message: string,
  conversationId?: string
): Promise<{ events: any[]; conversationId: string }> {
  const res = await fetch(`${API_BASE}/chat/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, conversationId }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Chat send failed (${res.status}): ${err}`)
  }

  const text = await res.text()
  const events: any[] = []
  let convId = conversationId || ''

  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    try {
      const event = JSON.parse(line.slice(6))
      events.push(event)
      if (event.type === 'conversation' && event.conversationId) {
        convId = event.conversationId
      }
    } catch {}
  }

  return { events, conversationId: convId }
}

export function findEvent(events: any[], type: string): any | undefined {
  return events.find(e => e.type === type)
}

export function findToolCall(events: any[], toolPrefix: string): any | undefined {
  return events.find(e => e.type === 'tool_call' && e.toolName?.startsWith(toolPrefix))
}

export function findToolResult(events: any[], toolPrefix: string): any | undefined {
  return events.find(e => e.type === 'tool_result' && e.toolName?.startsWith(toolPrefix))
}
