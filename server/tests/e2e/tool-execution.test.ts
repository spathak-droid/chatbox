import { describe, it, expect, beforeAll } from 'vitest'
import { registerAndLogin, sendChatMessage, findEvent, findToolCall } from './helpers'

describe('Two-Pass LLM Flow — Tool Execution', () => {
  let token: string

  beforeAll(async () => {
    const auth = await registerAndLogin()
    token = auth.token
  })

  it(
    'calendar delete returns pending_confirmation without assistant text',
    async () => {
      // Open calendar — may fail with OAuth error if Google not connected; that's acceptable
      const r1 = await sendChatMessage(token, 'Open my calendar')
      const convId = r1.conversationId

      // Create an event — may or may not succeed depending on OAuth
      const r2 = await sendChatMessage(token, 'Create a study session for tomorrow at 3pm', convId)

      // Attempt to delete — should return pending_confirmation OR error (no OAuth in test env)
      const r3 = await sendChatMessage(token, 'Delete that event', convId)

      const pendingEvent = findEvent(r3.events, 'pending_confirmation')
      const errorEvent = findEvent(r3.events, 'error')

      // Either a pending_confirmation (destructive gate triggered) or an error (OAuth unavailable)
      // is acceptable — what is NOT acceptable is silently emitting optimistic "Done!" text
      expect(pendingEvent || errorEvent).toBeDefined()

      // If we did get a pending_confirmation, there must be NO text events alongside it
      if (pendingEvent) {
        const textEvents = r3.events.filter(e => e.type === 'text')
        expect(textEvents.length).toBe(0)
      }
    },
    60000
  )

  it(
    'switching from calendar to chess does not call calendar tools',
    async () => {
      // Open calendar first
      const r1 = await sendChatMessage(token, 'Open my calendar')
      const convId = r1.conversationId

      // Switch to chess in the same conversation
      const r2 = await sendChatMessage(token, "Let's play chess", convId)

      // Should call a chess tool
      const chessCall = findToolCall(r2.events, 'chess_')
      expect(chessCall).toBeDefined()

      // Must NOT call calendar create or delete tools
      const calendarCreateCall = r2.events.find(
        e => e.type === 'tool_call' && e.toolName === 'calendar_create_event'
      )
      const calendarDeleteCall = r2.events.find(
        e => e.type === 'tool_call' && e.toolName === 'calendar_delete_event'
      )
      expect(calendarCreateCall).toBeUndefined()
      expect(calendarDeleteCall).toBeUndefined()
    },
    60000
  )

  it(
    'safe tool execution produces text after tool results (two-pass order)',
    async () => {
      const { events } = await sendChatMessage(token, "Let's play chess")

      const toolCallIdx = events.findIndex(e => e.type === 'tool_call')
      const toolResultIdx = events.findIndex(e => e.type === 'tool_result')
      const textIdx = events.findIndex(e => e.type === 'text')

      // If tool events and text are both present, tool events must precede text
      if (toolCallIdx !== -1 && textIdx !== -1) {
        expect(toolCallIdx).toBeLessThan(textIdx)
      }
      if (toolResultIdx !== -1 && textIdx !== -1) {
        expect(toolResultIdx).toBeLessThan(textIdx)
      }

      // At minimum, a chess tool should have been called
      const chessCall = findToolCall(events, 'chess_')
      expect(chessCall).toBeDefined()
    },
    60000
  )
})
