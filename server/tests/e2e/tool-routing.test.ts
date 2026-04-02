import { describe, it, expect, beforeAll } from 'vitest'
import { registerAndLogin, sendChatMessage, findToolCall } from './helpers'

describe('Tool Routing — LLM calls correct tool for each app', () => {
  let token: string

  beforeAll(async () => {
    const auth = await registerAndLogin()
    token = auth.token
  })

  it('calls chess_start_game when user says "lets play chess"', async () => {
    const { events } = await sendChatMessage(token, "let's play chess")
    const toolCall = findToolCall(events, 'chess_')
    expect(toolCall).toBeDefined()
    expect(toolCall.toolName).toBe('chess_start_game')
  })

  it('calls math_start_session when user says "lets practice math"', async () => {
    const { events } = await sendChatMessage(token, "let's practice math")
    const toolCall = findToolCall(events, 'math_')
    expect(toolCall).toBeDefined()
    expect(toolCall.toolName).toBe('math_start_session')
  })

  it('calls flashcards_start_deck when user says "quiz me with flashcards"', async () => {
    const { events } = await sendChatMessage(token, 'quiz me with flashcards about science')
    const toolCall = findToolCall(events, 'flashcards_')
    expect(toolCall).toBeDefined()
    expect(toolCall.toolName).toBe('flashcards_start_deck')
  })

  it('does NOT call chess tools when user asks for math', async () => {
    const { events } = await sendChatMessage(token, "I want to do some math practice")
    const chessCall = findToolCall(events, 'chess_')
    expect(chessCall).toBeUndefined()
  })

  it('does NOT call chess tools when user asks for flashcards', async () => {
    const { events } = await sendChatMessage(token, "help me study with flashcards")
    const chessCall = findToolCall(events, 'chess_')
    expect(chessCall).toBeUndefined()
  })

  it('switches from chess to flashcards in same conversation', async () => {
    // Start chess
    const r1 = await sendChatMessage(token, "let's play chess")
    expect(findToolCall(r1.events, 'chess_start')).toBeDefined()
    const convId = r1.conversationId

    // Ask for flashcards (should end chess + start flashcards)
    const r2 = await sendChatMessage(token, "let's study flashcards about science", convId)

    // Should have called chess_end_game or flashcards_start_deck (or both)
    const flashcardsCall = findToolCall(r2.events, 'flashcards_')
    const chessStartCall = r2.events.filter((e: any) => e.type === 'tool_call' && e.toolName === 'chess_start_game')

    // Flashcards tool should be called
    expect(flashcardsCall).toBeDefined()
    // chess_start_game should NOT be called again
    expect(chessStartCall.length).toBe(0)
  })
})
