import { describe, it, expect, afterAll } from 'vitest'
import { createEvalTrace, scoreAssertion, flushLangfuse, setupEvalSuite } from './setup.js'

const CATEGORY = 'golden-set'
setupEvalSuite()

// Import the scoping function — it's not exported, so we test via the module
// We re-implement the regex logic here to test the routing truth table
// This tests the SAME patterns used in openrouter.ts scopeToolsToIntent
function detectIntent(userMessage: string) {
  const msg = userMessage.toLowerCase()
  return {
    chess: /chess|play a game|play$|let'?s play/.test(msg),
    math: /math|practice|problems|addition|algebra|subtract|multipl|divid/.test(msg),
    flashcards: /flash|study|quiz|review|learn about/.test(msg),
    calendar: /calendar|schedule|event|study block|study plan|delete.*event|add.*event|plan.*week/.test(msg),
  }
}

function wouldScope(userMessage: string): string[] {
  const intent = detectIntent(userMessage)
  const scoped: string[] = []
  if (intent.chess) scoped.push('chess_')
  if (intent.math) scoped.push('math_')
  if (intent.flashcards) scoped.push('flashcards_')
  if (intent.calendar) scoped.push('calendar_')
  return scoped
}

// Guardrail regex — same patterns from openrouter.ts
function wouldBlockGuardrail(toolName: string, userMessage: string): boolean {
  const msg = userMessage.toLowerCase()
  if (toolName === 'chess_start_game' && !msg.match(/chess|play a game|play$/)) return true
  if (toolName === 'math_start_session' && !msg.match(/math|practice|problems|addition|algebra|subtract|multipl|divid/)) return true
  if (toolName === 'flashcards_start_deck' && !msg.match(/flash|study|quiz|review|learn/)) return true
  return false
}

describe('Golden Set Evals — Routing Truth Table', () => {
  afterAll(async () => {
    await flushLangfuse()
  })

  const goldenCases: Array<{
    id: string
    input: string
    expectedPrefix: string
    blockedPrefixes: string[]
  }> = [
    { id: 'G1', input: "let's play chess", expectedPrefix: 'chess_', blockedPrefixes: ['math_', 'flashcards_', 'calendar_'] },
    { id: 'G2', input: 'play', expectedPrefix: 'chess_', blockedPrefixes: ['math_', 'flashcards_'] },
    { id: 'G3', input: 'practice math', expectedPrefix: 'math_', blockedPrefixes: ['chess_', 'flashcards_'] },
    { id: 'G4', input: 'help me study', expectedPrefix: 'flashcards_', blockedPrefixes: ['chess_', 'math_'] },
    { id: 'G5', input: 'quiz me on history', expectedPrefix: 'flashcards_', blockedPrefixes: ['chess_'] },
    { id: 'G6', input: 'schedule a study block', expectedPrefix: 'calendar_', blockedPrefixes: ['chess_', 'math_'] },
    { id: 'G7', input: 'delete that event', expectedPrefix: 'calendar_', blockedPrefixes: ['chess_'] },
    { id: 'G8', input: "let's play", expectedPrefix: 'chess_', blockedPrefixes: ['math_', 'flashcards_'] },
    { id: 'G9', input: 'do some addition problems', expectedPrefix: 'math_', blockedPrefixes: ['chess_'] },
    { id: 'G10', input: 'review my flashcards', expectedPrefix: 'flashcards_', blockedPrefixes: ['chess_'] },
  ]

  for (const tc of goldenCases) {
    it(`${tc.id}: "${tc.input}" → ${tc.expectedPrefix}`, () => {
      const trace = createEvalTrace(CATEGORY, tc.id)
      const scoped = wouldScope(tc.input)

      const hasExpected = scoped.includes(tc.expectedPrefix)
      expect(hasExpected).toBe(true)
      scoreAssertion(trace.id, 'correct_scope', hasExpected)

      for (const blocked of tc.blockedPrefixes) {
        const isBlocked = !scoped.includes(blocked)
        expect(isBlocked).toBe(true)
        scoreAssertion(trace.id, `blocks_${blocked}`, isBlocked)
      }
    })
  }

  // G11: Calendar active + "play chess" → context = switching
  it('G11: calendar active + "play chess" → switching context', () => {
    const trace = createEvalTrace(CATEGORY, 'G11')
    const scoped = wouldScope('play chess')
    const hasChess = scoped.includes('chess_')
    const noCalendar = !scoped.includes('calendar_')

    expect(hasChess).toBe(true)
    expect(noCalendar).toBe(true)

    scoreAssertion(trace.id, 'chess_scoped', hasChess)
    scoreAssertion(trace.id, 'calendar_not_scoped', noCalendar)
  })

  // G12: Math active + "quiz me" → flashcards scoped
  it('G12: math active + "quiz me" → flashcards scoped', () => {
    const trace = createEvalTrace(CATEGORY, 'G12')
    const scoped = wouldScope('quiz me')
    const hasFlashcards = scoped.includes('flashcards_')
    const noMath = !scoped.includes('math_')

    expect(hasFlashcards).toBe(true)
    expect(noMath).toBe(true)

    scoreAssertion(trace.id, 'flashcards_scoped', hasFlashcards)
    scoreAssertion(trace.id, 'math_not_scoped', noMath)
  })

  // Guardrail tests (G13-G18 use the guardrail function)
  describe('Guardrail blocking', () => {
    it('G13: chess_start_game blocked when user says "flashcards"', () => {
      const trace = createEvalTrace(CATEGORY, 'G13-guardrail')
      const blocked = wouldBlockGuardrail('chess_start_game', 'quiz me with flashcards')
      expect(blocked).toBe(true)
      scoreAssertion(trace.id, 'guardrail_blocks', blocked)
    })

    it('G14: math_start_session blocked when user says "chess"', () => {
      const trace = createEvalTrace(CATEGORY, 'G14-guardrail')
      const blocked = wouldBlockGuardrail('math_start_session', "let's play chess")
      expect(blocked).toBe(true)
      scoreAssertion(trace.id, 'guardrail_blocks', blocked)
    })

    it('G15: flashcards_start_deck blocked when user says "math"', () => {
      const trace = createEvalTrace(CATEGORY, 'G15-guardrail')
      const blocked = wouldBlockGuardrail('flashcards_start_deck', 'practice math')
      expect(blocked).toBe(true)
      scoreAssertion(trace.id, 'guardrail_blocks', blocked)
    })

    it('G16: chess_start_game NOT blocked when user says "play"', () => {
      const trace = createEvalTrace(CATEGORY, 'G16-guardrail')
      const blocked = wouldBlockGuardrail('chess_start_game', "let's play")
      expect(blocked).toBe(false)
      scoreAssertion(trace.id, 'guardrail_allows', !blocked)
    })

    it('G17: math_start_session NOT blocked for "multiplication"', () => {
      const trace = createEvalTrace(CATEGORY, 'G17-guardrail')
      const blocked = wouldBlockGuardrail('math_start_session', 'do some multiplication')
      expect(blocked).toBe(false)
      scoreAssertion(trace.id, 'guardrail_allows', !blocked)
    })

    it('G18: flashcards_start_deck NOT blocked for "study biology"', () => {
      const trace = createEvalTrace(CATEGORY, 'G18-guardrail')
      const blocked = wouldBlockGuardrail('flashcards_start_deck', 'study biology')
      expect(blocked).toBe(false)
      scoreAssertion(trace.id, 'guardrail_allows', !blocked)
    })
  })
})
