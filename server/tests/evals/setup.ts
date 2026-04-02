import { afterAll } from 'vitest'
import { flushLangfuse, createTrace, scoreAssertion, hashString } from '../../src/lib/langfuse.js'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ============ EVAL MODE ============
export type EvalMode = 'replay' | 'record' | 'live'
export const evalMode: EvalMode = (process.env.EVAL_MODE as EvalMode) || 'replay'

// ============ SYSTEM PROMPT HASH ============
export function getSystemPromptHash(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const content = fs.readFileSync(
    path.resolve(__dirname, '../../src/chat/openrouter.ts'),
    'utf-8'
  )
  const match = content.match(/const systemContent = `([\s\S]*?)`;?\s*\n/)
  return hashString(match?.[1] || content)
}

export function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

// ============ APP SERVER MOCKS ============
export const APP_TOOL_RESPONSES: Record<string, Record<string, unknown>> = {
  chess_start_game: {
    status: 'ok',
    data: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', playerColor: 'white', gameOver: false },
    summary: 'Chess game started. You are playing white.',
    appSessionId: 'chess-session-1',
  },
  chess_end_game: {
    status: 'ok',
    data: { gameOver: true },
    summary: 'Chess game ended.',
    appSessionId: 'chess-session-1',
  },
  math_start_session: {
    status: 'ok',
    data: { topic: 'addition', difficulty: 'easy', currentIndex: 0, problems: [{ question: '2 + 3', answer: 5 }] },
    summary: 'Math practice started: addition (easy).',
    appSessionId: 'math-session-1',
  },
  flashcards_start_deck: {
    status: 'ok',
    data: { cards: [{ front: 'What is H2O?', back: 'Water' }], currentIndex: 0 },
    summary: 'Flashcard deck started with 1 card.',
    appSessionId: 'flash-session-1',
  },
  calendar_search_events: {
    status: 'ok',
    data: { events: [{ id: 'evt-1', summary: 'Math Study', start: '2026-04-03T15:00:00Z' }] },
    summary: 'Found 1 event.',
    appSessionId: 'cal-session-1',
  },
  calendar_create_event: {
    status: 'ok',
    data: { eventId: 'evt-new', summary: 'Study Session' },
    summary: 'Created event: Study Session.',
    appSessionId: 'cal-session-1',
  },
  calendar_delete_event: {
    status: 'pending' as any,
    data: { pendingConfirmation: true, actions: [{ id: 'action-1', description: 'Delete event (ID: evt-1)' }] },
    summary: 'Action queued for confirmation: Delete event (ID: evt-1). Waiting for user to confirm.',
    appSessionId: 'cal-session-1',
  },
  calendar_update_event: {
    status: 'pending' as any,
    data: { pendingConfirmation: true, actions: [{ id: 'action-2', description: 'Update event (ID: evt-1)' }] },
    summary: 'Action queued for confirmation.',
    appSessionId: 'cal-session-1',
  },
}

// ============ TRACE HELPERS ============
export function createEvalTrace(category: string, testId: string) {
  return createTrace(`eval:${testId}`, {
    tags: ['eval', category],
    metadata: {
      category,
      testId,
      evalMode,
      gitSha: getGitSha(),
      promptHash: getSystemPromptHash(),
    },
  })
}

export { scoreAssertion, flushLangfuse }

// ============ VITEST LIFECYCLE ============
export function setupEvalSuite() {
  afterAll(async () => {
    await flushLangfuse()
  })
}
