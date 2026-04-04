const SENSITIVE_KEYS = new Set([
  'accessToken', 'access_token',
  'refreshToken', 'refresh_token',
  'platformToken', 'platform_token',
  'userId', 'user_id',
  'email', 'user_email',
  '_refreshTrigger',
  'password', 'secret', 'apiKey', 'api_key',
])

/** Strip sensitive fields from state before sending anywhere outside the platform */
export function stripSensitiveKeys(state: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(state)) {
    if (!SENSITIVE_KEYS.has(key)) {
      clean[key] = value
    }
  }
  return clean
}

/** Format app state into a concise, safe string for LLM context */
export function sanitizeStateForLLM(appId: string, state: Record<string, unknown>): string {
  const clean = stripSensitiveKeys(state)

  switch (appId) {
    case 'chess': {
      const parts: string[] = []
      if (clean.fen) parts.push(`Position: ${clean.fen}`)
      if (clean.moves) parts.push(`Moves played: ${Array.isArray(clean.moves) ? clean.moves.length : clean.moves}`)
      if (clean.gameOver) parts.push(`Game over: ${clean.result || 'unknown'}`)
      if (clean.playerColor) parts.push(`Playing as: ${clean.playerColor}`)
      return parts.length > 0 ? parts.join('. ') : 'Chess game in progress.'
    }
    case 'math-practice': {
      const parts: string[] = []
      if (clean.correct !== undefined) parts.push(`Correct: ${clean.correct}`)
      if (clean.incorrect !== undefined) parts.push(`Incorrect: ${clean.incorrect}`)
      if (clean.topic) parts.push(`Topic: ${clean.topic}`)
      if (clean.currentIndex !== undefined) parts.push(`Problems attempted: ${clean.currentIndex}`)
      return parts.length > 0 ? parts.join('. ') : 'Math session in progress.'
    }
    case 'flashcards': {
      const parts: string[] = []
      if (clean.topic) parts.push(`Topic: ${clean.topic}`)
      if (Array.isArray(clean.cards)) parts.push(`Total cards: ${clean.cards.length}`)
      if (clean.known !== undefined) parts.push(`Known: ${clean.known}`)
      if (clean.unknown !== undefined) parts.push(`Unknown: ${clean.unknown}`)
      if (clean.currentIndex !== undefined && Array.isArray(clean.cards)) {
        parts.push(`Reviewed: ${clean.currentIndex}/${clean.cards.length}`)
      }
      if (clean.finished) parts.push('Deck complete')
      if (Array.isArray(clean.unknownCards) && clean.unknownCards.length > 0) {
        parts.push(`Cards to review: ${clean.unknownCards.map((c: any) => c.front).join(', ')}`)
      }
      return parts.length > 0 ? parts.join('. ') : 'Flashcard session in progress.'
    }
    case 'google-calendar': {
      const parts: string[] = []
      if (clean.events && Array.isArray(clean.events)) parts.push(`${clean.events.length} events visible`)
      if (clean.studyBlocks && Array.isArray(clean.studyBlocks)) parts.push(`${clean.studyBlocks.length} study blocks`)
      return parts.length > 0 ? parts.join('. ') : 'Calendar session.'
    }
    case 'mario': {
      const parts: string[] = []
      if (clean.level) parts.push(`Level: ${clean.level}`)
      if (clean.lives !== undefined) parts.push(`Lives: ${clean.lives}`)
      if (clean.coins !== undefined) parts.push(`Coins: ${clean.coins}`)
      return parts.length > 0 ? parts.join('. ') : 'Mario game in progress.'
    }
    default:
      return JSON.stringify(clean).slice(0, 500)
  }
}

/** Sanitize a tool result summary to prevent prompt injection */
export function sanitizeToolSummary(summary: string): string {
  const INJECTION_PATTERNS = [
    /ignore\s*(all\s*)?(previous|prior|above)\s*(instructions|prompts|rules)/gi,
    /you\s*are\s*now/gi,
    /system\s*:/gi,
    /\[INST\]/gi,
    /<<\s*SYS\s*>>/gi,
    /pretend\s*(you('re|\s*are)?\s*)/gi,
    /disregard\s*(all\s*)?(previous|prior)/gi,
  ]
  let clean = summary
  for (const pattern of INJECTION_PATTERNS) {
    clean = clean.replace(pattern, '[filtered]')
  }
  return clean.slice(0, 500)
}
