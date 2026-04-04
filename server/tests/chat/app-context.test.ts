import { describe, it, expect } from 'vitest'
import { buildAppContext } from '../../src/chat/app-context.js'

describe('buildAppContext', () => {
  it('returns null context for empty sessions', () => {
    const result = buildAppContext([], 'play chess')
    expect(result.contextLine).toBeNull()
    expect(result.activeAppId).toBeNull()
  })

  it('returns active app context with sanitized state', () => {
    const sessions = [
      { appId: 'chess', status: 'active', state: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', moveCount: 5 }, summary: null },
    ]
    const result = buildAppContext(sessions as any, 'whats the best move')
    expect(result.activeAppId).toBe('chess')
    expect(result.contextLine).toContain('[Active app: chess')
  })

  it('returns switching instruction when intent differs from active app', () => {
    const sessions = [
      { appId: 'chess', status: 'active', state: {}, summary: null },
    ]
    const result = buildAppContext(sessions as any, 'lets do flashcards')
    expect(result.contextLine).toContain('Switching from chess to flashcards')
  })

  it('returns completed app context', () => {
    const sessions = [
      { appId: 'chess', status: 'completed', state: {}, summary: 'Game ended in checkmate' },
    ]
    const result = buildAppContext(sessions as any, 'hello')
    expect(result.contextLine).toContain('Completed app: chess')
    expect(result.contextLine).toContain('Game ended in checkmate')
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
})
