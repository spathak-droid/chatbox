import { describe, it, expect } from 'vitest'
import { scopeToolsToIntent } from '../../src/chat/openrouter.js'

const allTools = [
  { function: { name: 'chess_start_game' } },
  { function: { name: 'chess_end_game' } },
  { function: { name: 'math_start_session' } },
  { function: { name: 'math_finish_session' } },
  { function: { name: 'calendar_list_events' } },
  { function: { name: 'calendar_end_session' } },
  { function: { name: 'flashcards_start_deck' } },
  { function: { name: 'flashcards_finish_deck' } },
]

function toolNames(tools: any[]): string[] {
  return tools.map(t => t.function?.name).sort()
}

describe('scopeToolsToIntent', () => {
  it('returns chess tools when message says "play chess"', () => {
    const result = scopeToolsToIntent(allTools, 'play chess')
    const names = toolNames(result)
    expect(names).toContain('chess_start_game')
    expect(names).toContain('chess_end_game')
    expect(names).not.toContain('math_start_session')
    expect(names).not.toContain('flashcards_start_deck')
    expect(names).not.toContain('calendar_list_events')
  })

  it('returns math tools when message says "practice math"', () => {
    const result = scopeToolsToIntent(allTools, 'practice math')
    const names = toolNames(result)
    expect(names).toContain('math_start_session')
    expect(names).toContain('math_finish_session')
    expect(names).not.toContain('chess_start_game')
    expect(names).not.toContain('flashcards_start_deck')
    expect(names).not.toContain('calendar_list_events')
  })

  it('returns flashcard tools when message says "flashcards"', () => {
    const result = scopeToolsToIntent(allTools, 'flashcards')
    const names = toolNames(result)
    expect(names).toContain('flashcards_start_deck')
    expect(names).toContain('flashcards_finish_deck')
    expect(names).not.toContain('chess_start_game')
    expect(names).not.toContain('math_start_session')
    expect(names).not.toContain('calendar_list_events')
  })

  it('returns calendar tools when message says "calendar"', () => {
    const result = scopeToolsToIntent(allTools, 'calendar')
    const names = toolNames(result)
    expect(names).toContain('calendar_list_events')
    expect(names).toContain('calendar_end_session')
    expect(names).not.toContain('chess_start_game')
    expect(names).not.toContain('math_start_session')
    expect(names).not.toContain('flashcards_start_deck')
  })

  it('includes old app end tool when switching apps', () => {
    // Active app is chess, user wants flashcards
    const result = scopeToolsToIntent(allTools, 'lets do flashcards', 'chess')
    const names = toolNames(result)
    // Should include flashcard tools
    expect(names).toContain('flashcards_start_deck')
    expect(names).toContain('flashcards_finish_deck')
    // Should include chess end tool for cleanup
    expect(names).toContain('chess_end_game')
    // Should NOT include chess start tool
    expect(names).not.toContain('chess_start_game')
  })

  it('does not include end tool when same app is requested', () => {
    // Active app is chess, user says "play chess" again
    const result = scopeToolsToIntent(allTools, 'play chess', 'chess')
    const names = toolNames(result)
    // Should include chess tools normally (no switching)
    expect(names).toContain('chess_start_game')
    expect(names).toContain('chess_end_game')
    // Should NOT include tools from other apps
    expect(names).not.toContain('math_start_session')
    expect(names).not.toContain('flashcards_start_deck')
    expect(names).not.toContain('calendar_list_events')
  })

  it('returns all tools when no intent is detected and no active app', () => {
    const result = scopeToolsToIntent(allTools, 'hello how are you')
    expect(result).toHaveLength(allTools.length)
  })

  it('scopes to active app tools when no intent is detected but app is active', () => {
    const result = scopeToolsToIntent(allTools, 'what is the answer?', 'math-practice')
    const names = toolNames(result)
    expect(names).toContain('math_start_session')
    expect(names).toContain('math_finish_session')
    expect(names).not.toContain('chess_start_game')
    expect(names).not.toContain('flashcards_start_deck')
    expect(names).not.toContain('calendar_list_events')
  })

  it('includes end tool from math when switching to calendar', () => {
    const result = scopeToolsToIntent(allTools, 'show me my calendar', 'math-practice')
    const names = toolNames(result)
    expect(names).toContain('calendar_list_events')
    expect(names).toContain('calendar_end_session')
    expect(names).toContain('math_finish_session')
    expect(names).not.toContain('math_start_session')
  })
})
