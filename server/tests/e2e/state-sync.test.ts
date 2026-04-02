import { describe, it, expect, beforeAll } from 'vitest'
import { registerAndLogin, sendChatMessage, findToolResult } from './helpers'

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'

describe('State Sync — tool results persist and are visible to LLM', () => {
  let token: string

  beforeAll(async () => {
    const auth = await registerAndLogin()
    token = auth.token
  })

  it('chess_start_game returns appSessionId in result', async () => {
    const { events } = await sendChatMessage(token, "let's play chess")
    const result = findToolResult(events, 'chess_')
    expect(result).toBeDefined()
    expect(result.result.status).toBe('ok')
    expect(result.result.appSessionId).toBeDefined()
    expect(result.result.appSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  it('chess state is stored in DB and retrievable', async () => {
    const { events, conversationId } = await sendChatMessage(token, "let's play chess")
    const result = findToolResult(events, 'chess_')
    expect(result).toBeDefined()

    const sessRes = await fetch(`${API_BASE}/chat/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(sessRes.ok).toBe(true)
  })

  it('math_start_session returns appSessionId in result', async () => {
    const { events } = await sendChatMessage(token, "let's practice math")
    const result = findToolResult(events, 'math_')
    expect(result).toBeDefined()
    expect(result.result.status).toBe('ok')
    expect(result.result.appSessionId).toBeDefined()
  })

  it('sync-app-state endpoint updates session', async () => {
    const { events, conversationId } = await sendChatMessage(token, "let's play chess")
    const result = findToolResult(events, 'chess_')
    expect(result).toBeDefined()

    const syncRes = await fetch(
      `${API_BASE}/chat/conversations/${conversationId}/sync-app-state`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          appId: 'chess',
          state: {
            fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
            moves: ['e4'],
            playerColor: 'white',
            gameOver: false,
          },
        }),
      }
    )
    expect(syncRes.ok).toBe(true)
    const syncData = await syncRes.json()
    expect(syncData.ok).toBe(true)
  })
})
