import { sanitizeStateForLLM } from '../security/sanitize.js'

interface SessionInfo {
  appId: string
  status: string
  state: Record<string, unknown> | null
  summary: string | null
}

/** Detect which app the user's message is referring to, if any */
export function detectIntentApp(lastUserMessage: string): string | null {
  const msg = lastUserMessage.toLowerCase()
  if (/chess|play a game|play$|let'?s play/.test(msg)) return 'chess'
  if (/math|practice|problems|addition|algebra|subtract|multipl|divid/.test(msg)) return 'math-practice'
  if (/flash|study|quiz|review|learn about/.test(msg)) return 'flashcards'
  if (/calendar|schedule|event|study block|study plan|delete.*event|add.*event|plan.*week/.test(msg)) return 'google-calendar'
  if (/whiteboard|draw|sketch|diagram/.test(msg)) return 'whiteboard'
  return null
}

/**
 * Build app context string and determine active app ID from sessions.
 * Pure function — no DB calls.
 *
 * Always returns a contextLine (never null) so the LLM always knows the
 * current app state — even when no app is running.
 */
export function buildAppContext(
  sessions: SessionInfo[],
  lastUserMessage: string,
): { activeAppId: string | null; contextLine: string } {
  // De-duplicate: keep only the most recent session per app.
  // Sessions arrive ordered by created_at, so later entries win — unless
  // an earlier one is 'active' (active always beats completed).
  const latestByApp = new Map<string, SessionInfo>()
  for (const s of sessions) {
    if (s.status !== 'active' && s.status !== 'completed' && !s.summary) continue
    const existing = latestByApp.get(s.appId)
    if (!existing || existing.status !== 'active' || s.status === 'active') {
      latestByApp.set(s.appId, s)
    }
  }

  const relevantSessions = [...latestByApp.values()]

  const activeSession = relevantSessions.find((s) => s.status === 'active')
  const activeAppId = activeSession?.appId ?? null

  const intentApp = detectIntentApp(lastUserMessage)
  const isSwitching = activeSession && intentApp && activeSession.appId !== intentApp

  // If the user expresses intent for an app that's already "active", the UI
  // may have been closed manually (race condition with async close).
  // Always let the LLM call the start tool — it's idempotent and will
  // re-show the panel if it was dismissed.
  const needsReopen = activeSession && intentApp === activeAppId

  console.log('[buildAppContext]', { activeAppId, intentApp, needsReopen: !!needsReopen, sessions: relevantSessions.map(s => ({ appId: s.appId, status: s.status })) })

  // Explicit status header — the LLM must read this first
  const lines: string[] = []
  if (activeAppId && !needsReopen) {
    lines.push(`=== CURRENTLY ACTIVE APP: ${activeAppId} ===`)
  } else if (needsReopen) {
    lines.push(`=== NO APP IS CURRENTLY ACTIVE. To start an app, call its start tool. ===`)
  } else {
    lines.push('=== NO APP IS CURRENTLY ACTIVE. To start an app, call its start tool. ===')
  }

  for (const s of relevantSessions) {
    if (s.status === 'active') {
      if (needsReopen && s.appId === activeAppId) {
        // User explicitly asked to reopen — treat as closed so LLM calls start tool
        lines.push(`[Previously closed: ${s.appId} — user closed the panel. NOT running. You MUST call the start tool to reopen it.]`)
      } else if (isSwitching && s.appId === activeSession!.appId) {
        lines.push(`[Switching from ${activeSession!.appId} to ${intentApp}. You MUST call the end tool for ${activeSession!.appId} first, then the start tool for ${intentApp}. Briefly discuss what happened in ${activeSession!.appId} before moving on.]`)
      } else {
        const state = s.state as Record<string, unknown> | null
        if (state?.gameOver) {
          lines.push(`[Completed app: ${s.appId} — game is finished. If user wants to play again, call the start tool immediately.]`)
        } else {
          lines.push(`[Active app: ${s.appId}, state: ${sanitizeStateForLLM(s.appId, s.state as Record<string, unknown>)}]`)
        }
      }
    } else if (s.status === 'completed' || s.summary) {
      lines.push(`[Previously closed: ${s.appId} — ${s.summary || 'finished'}. NOT running. To restart, call its start tool.]`)
    }
  }

  // When reopening, don't report an active app ID so tools get scoped correctly
  const effectiveActiveAppId = needsReopen ? null : activeAppId

  return { activeAppId: effectiveActiveAppId, contextLine: lines.join('\n') }
}
