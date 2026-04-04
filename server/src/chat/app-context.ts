import { sanitizeStateForLLM } from '../security/sanitize.js'

interface SessionInfo {
  appId: string
  status: string
  state: Record<string, unknown> | null
  summary: string | null
}

/** Detect which app the user's message is referring to, if any */
function detectIntentApp(lastUserMessage: string): string | null {
  const msg = lastUserMessage.toLowerCase()
  if (/chess|play a game|play$|let'?s play/.test(msg)) return 'chess'
  if (/math|practice|problems|addition|algebra|subtract|multipl|divid/.test(msg)) return 'math-practice'
  if (/flash|study|quiz|review|learn about/.test(msg)) return 'flashcards'
  if (/calendar|schedule|event|study block|study plan|delete.*event|add.*event|plan.*week/.test(msg)) return 'google-calendar'
  return null
}

/**
 * Build app context string and determine active app ID from sessions.
 * Pure function — no DB calls.
 */
export function buildAppContext(
  sessions: SessionInfo[],
  lastUserMessage: string,
): { activeAppId: string | null; contextLine: string | null } {
  const relevantSessions = sessions.filter(
    (s) => s.status === 'active' || s.status === 'completed' || s.summary,
  )

  if (relevantSessions.length === 0) {
    return { activeAppId: null, contextLine: null }
  }

  const activeSession = relevantSessions.find((s) => s.status === 'active')
  const activeAppId = activeSession?.appId ?? null

  const intentApp = detectIntentApp(lastUserMessage)
  const isSwitching = activeSession && intentApp && activeSession.appId !== intentApp

  const lines = relevantSessions
    .map((s) => {
      if (s.status === 'active') {
        if (isSwitching && s.appId === activeSession!.appId) {
          return `[Switching from ${activeSession!.appId} to ${intentApp}. You MUST call the end tool for ${activeSession!.appId} first, then the start tool for ${intentApp}. Briefly discuss what happened in ${activeSession!.appId} before moving on.]`
        }
        const state = s.state as Record<string, unknown> | null
        if (state?.gameOver) {
          return `[Completed app: ${s.appId} — game is finished. If user wants to play again, call the start tool immediately.]`
        }
        return `[Active app: ${s.appId}, state: ${sanitizeStateForLLM(s.appId, s.state as Record<string, unknown>)}]`
      }
      if (s.status === 'completed' || s.summary) {
        return `[Completed app: ${s.appId} — ${s.summary || 'finished'}. If user wants to play again, call the start tool immediately.]`
      }
      return ''
    })
    .filter(Boolean)

  const contextLine = lines.length > 0 ? lines.join('\n') : null

  return { activeAppId, contextLine }
}
