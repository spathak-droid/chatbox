import { describe, it, expect } from 'vitest'
import { buildAppContext } from '../../src/chat/app-context.js'

describe('buildAppContext', () => {
  it('returns no-app-active context for empty sessions', () => {
    const result = buildAppContext([], 'play chess')
    expect(result.contextLine).toContain('NO APP IS CURRENTLY ACTIVE')
    expect(result.activeAppId).toBeNull()
  })

  it('returns active app context with sanitized state', () => {
    const sessions = [
      { appId: 'chess', status: 'active', state: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', moveCount: 5 }, summary: null },
    ]
    const result = buildAppContext(sessions as any, 'whats the best move')
    expect(result.activeAppId).toBe('chess')
    expect(result.contextLine).toContain('CURRENTLY ACTIVE APP: chess')
    expect(result.contextLine).toContain('[Active app: chess')
  })

  it('returns switching instruction when intent differs from active app', () => {
    const sessions = [
      { appId: 'chess', status: 'active', state: {}, summary: null },
    ]
    const result = buildAppContext(sessions as any, 'lets do flashcards')
    expect(result.contextLine).toContain('Switching from chess to flashcards')
  })

  it('returns completed app context with Previously closed label', () => {
    const sessions = [
      { appId: 'chess', status: 'completed', state: {}, summary: 'Game ended in checkmate' },
    ]
    const result = buildAppContext(sessions as any, 'hello')
    expect(result.contextLine).toContain('NO APP IS CURRENTLY ACTIVE')
    expect(result.contextLine).toContain('Previously closed: chess')
    expect(result.contextLine).toContain('Game ended in checkmate')
    expect(result.contextLine).toContain('NOT running')
  })

  it('detects gameOver in active session', () => {
    const sessions = [
      { appId: 'chess', status: 'active', state: { gameOver: true }, summary: null },
    ]
    const result = buildAppContext(sessions as any, 'play again')
    expect(result.contextLine).toContain('game is finished')
  })

  it('returns null activeAppId when no session is active', () => {
    const sessions = [
      { appId: 'chess', status: 'completed', state: {}, summary: 'done' },
    ]
    const result = buildAppContext(sessions as any, 'hello')
    expect(result.activeAppId).toBeNull()
  })

  it('de-duplicates sessions keeping only the latest per app', () => {
    const sessions = [
      { appId: 'chess', status: 'completed', state: {}, summary: 'First game' },
      { appId: 'chess', status: 'completed', state: {}, summary: 'Second game' },
      { appId: 'chess', status: 'completed', state: {}, summary: 'Third game' },
    ]
    const result = buildAppContext(sessions as any, 'hello')
    // Should only mention chess once, with the latest summary
    const chessMatches = result.contextLine.match(/Previously closed: chess/g)
    expect(chessMatches).toHaveLength(1)
    expect(result.contextLine).toContain('Third game')
  })

  it('prefers active session over completed when de-duplicating', () => {
    const sessions = [
      { appId: 'chess', status: 'completed', state: {}, summary: 'Old game' },
      { appId: 'chess', status: 'active', state: { fen: 'abc' }, summary: null },
    ]
    const result = buildAppContext(sessions as any, 'whats the best move')
    expect(result.activeAppId).toBe('chess')
    expect(result.contextLine).toContain('CURRENTLY ACTIVE APP: chess')
    expect(result.contextLine).not.toContain('Previously closed: chess')
  })

  // ========== CLOSE / REOPEN SCENARIOS ==========

  describe('close and reopen (user manually closes panel)', () => {
    it('completed session + same app intent → NO APP ACTIVE, must call start tool', () => {
      // User closed whiteboard → session is completed → user says "open the whiteboard"
      const sessions = [
        { appId: 'whiteboard', status: 'completed', state: {}, summary: 'Closed by user' },
      ]
      const result = buildAppContext(sessions as any, 'open the whiteboard')
      expect(result.activeAppId).toBeNull()
      expect(result.contextLine).toContain('NO APP IS CURRENTLY ACTIVE')
      expect(result.contextLine).toContain('Previously closed: whiteboard')
      expect(result.contextLine).toContain('call its start tool')
    })

    it('completed session + same app intent without "open" → still works', () => {
      // User closed math → session is completed → user says "let's practice math"
      const sessions = [
        { appId: 'math-practice', status: 'completed', state: {}, summary: 'Closed by user' },
      ]
      const result = buildAppContext(sessions as any, "let's practice math")
      expect(result.activeAppId).toBeNull()
      expect(result.contextLine).toContain('NO APP IS CURRENTLY ACTIVE')
    })

    it('active session + same app intent (race condition) → treats as NOT active so LLM calls tool', () => {
      // Race condition: close hasn't reached DB yet, session still "active"
      // User says "open the whiteboard" → should NOT say "currently active"
      const sessions = [
        { appId: 'whiteboard', status: 'active', state: { active: true }, summary: null },
      ]
      const result = buildAppContext(sessions as any, 'open the whiteboard')
      // needsReopen should kick in
      expect(result.activeAppId).toBeNull()
      expect(result.contextLine).toContain('NO APP IS CURRENTLY ACTIVE')
      expect(result.contextLine).toContain('user closed the panel')
      expect(result.contextLine).toContain('MUST call the start tool')
    })

    it('active session + same app intent without "open" (race) → still reopens', () => {
      // "let's play chess" while chess session is stale-active
      const sessions = [
        { appId: 'chess', status: 'active', state: { fen: 'abc' }, summary: null },
      ]
      const result = buildAppContext(sessions as any, "let's play chess")
      expect(result.activeAppId).toBeNull()
      expect(result.contextLine).toContain('NO APP IS CURRENTLY ACTIVE')
    })

    it('active session + different app intent → switching flow (not reopen)', () => {
      // Chess is active, user wants math → normal switch, not reopen
      const sessions = [
        { appId: 'chess', status: 'active', state: {}, summary: null },
      ]
      const result = buildAppContext(sessions as any, "let's practice math")
      expect(result.activeAppId).toBe('chess')
      expect(result.contextLine).toContain('CURRENTLY ACTIVE APP: chess')
      expect(result.contextLine).toContain('Switching from chess to math-practice')
    })

    it('active session + no intent → normal active state', () => {
      // User says something generic while chess is active → keep active
      const sessions = [
        { appId: 'chess', status: 'active', state: { fen: 'abc' }, summary: null },
      ]
      const result = buildAppContext(sessions as any, 'what should i do next')
      expect(result.activeAppId).toBe('chess')
      expect(result.contextLine).toContain('CURRENTLY ACTIVE APP: chess')
    })

    it('completed whiteboard + chess intent → no reopen, just start chess', () => {
      // Whiteboard was closed, user wants chess → don't try to reopen whiteboard
      const sessions = [
        { appId: 'whiteboard', status: 'completed', state: {}, summary: 'Closed by user' },
      ]
      const result = buildAppContext(sessions as any, "let's play chess")
      expect(result.activeAppId).toBeNull()
      expect(result.contextLine).toContain('NO APP IS CURRENTLY ACTIVE')
    })
  })
})
