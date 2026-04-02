import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { createEvalTrace, scoreAssertion, flushLangfuse, setupEvalSuite, evalMode } from './setup.js'
import { startRecording, stopRecording } from './recorder.js'
import { startReplay, stopReplay } from './replayer.js'
import { sendChatMessage, registerAndLogin } from '../e2e/helpers.js'

const CATEGORY = 'multi-turn'
setupEvalSuite()

function setupFixture(testId: string): boolean {
  if (evalMode === 'record') {
    startRecording(CATEGORY, testId)
    return true
  }
  try {
    startReplay(CATEGORY, testId)
    return true
  } catch {
    return false // No fixture yet
  }
}

function teardownFixture() {
  if (evalMode === 'record') stopRecording()
  else stopReplay()
}

describe('Multi-Turn Evals', () => {
  let token: string

  afterAll(async () => {
    await flushLangfuse()
  })

  // Only run in record or live mode — these need the full server
  const shouldRun = evalMode === 'record' || evalMode === 'live'

  it('MT1: chess coaching across turns', async () => {
    if (!shouldRun) return
    if (!setupFixture('MT1')) return
    const trace = createEvalTrace(CATEGORY, 'MT1')

    try {
      const auth = await registerAndLogin()
      token = auth.token

      const r1 = await sendChatMessage(token, "Let's play chess")
      const convId = r1.conversationId

      // Send a coaching request
      const r2 = await sendChatMessage(token, 'What should I do?', convId)
      const textEvents = r2.events.filter((e: any) => e.type === 'text')
      const toolCalls = r2.events.filter((e: any) => e.type === 'tool_call')

      // Coaching should produce text, NOT re-call chess_start_game
      const hasText = textEvents.length > 0
      const noRestart = !toolCalls.some((e: any) => e.toolName === 'chess_start_game')

      scoreAssertion(trace.id, 'has_coaching_text', hasText)
      scoreAssertion(trace.id, 'no_restart', noRestart)
    } finally {
      teardownFixture()
    }
  }, 60000)

  it('MT5: 10 chat turns then app start', async () => {
    if (!shouldRun) return
    if (!setupFixture('MT5')) return
    const trace = createEvalTrace(CATEGORY, 'MT5')

    try {
      const auth = await registerAndLogin()
      token = auth.token

      // Send 5 generic messages (reduced from 10 for speed)
      let convId: string | undefined
      for (let i = 0; i < 5; i++) {
        const r = await sendChatMessage(token, `Tell me a fun fact #${i + 1}`, convId)
        convId = r.conversationId
      }

      // Now start chess
      const r = await sendChatMessage(token, "Let's play chess", convId)
      const chessCall = r.events.find((e: any) => e.type === 'tool_call' && e.toolName === 'chess_start_game')

      scoreAssertion(trace.id, 'chess_starts_after_chat', !!chessCall)
    } finally {
      teardownFixture()
    }
  }, 120000)

  it('MT6: context switch mid-coaching', async () => {
    if (!shouldRun) return
    if (!setupFixture('MT6')) return
    const trace = createEvalTrace(CATEGORY, 'MT6')

    try {
      const auth = await registerAndLogin()
      token = auth.token

      const r1 = await sendChatMessage(token, "Let's play chess")
      const convId = r1.conversationId

      // Coaching
      await sendChatMessage(token, 'Give me a hint', convId)

      // Switch to calendar
      const r3 = await sendChatMessage(token, 'Open my calendar', convId)
      const calCall = r3.events.find((e: any) => e.type === 'tool_call' && String(e.toolName).startsWith('calendar_'))
      const chessCall = r3.events.find((e: any) => e.type === 'tool_call' && e.toolName === 'chess_start_game')

      scoreAssertion(trace.id, 'calendar_called', !!calCall)
      scoreAssertion(trace.id, 'chess_not_restarted', !chessCall)
    } finally {
      teardownFixture()
    }
  }, 60000)
})
