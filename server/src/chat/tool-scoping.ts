// ============ DYNAMIC TOOL SCOPING ============
// Only expose tools relevant to user's current intent
// The LLM can't call a tool it can't see
// Map app IDs to tool prefixes
const APP_TOOL_PREFIX: Record<string, string> = {
  'chess': 'chess_',
  'math-practice': 'math_',
  'flashcards': 'flashcards_',
  'google-calendar': 'calendar_',
  'whiteboard': 'whiteboard_',
}

export function scopeToolsToIntent(allTools: any[], userMessage: string, activeAppId?: string | null): any[] {
  // Detect intent from user message — order matters, more specific first
  const wantsCalendar = /calend[ae]r|schedule|event|study block|study plan|delete.*event|add.*event|plan.*week|planner/.test(userMessage)
  const wantsChess = /chess|play a game|let'?s play(?!\s*\w)/.test(userMessage)
  const wantsMath = /math|practice|problems|addition|algebra|subtract|multipl|divid/.test(userMessage)
  const wantsFlashcards = /flash(?:card)?|quiz|review|learn about|study(?!.*(?:block|plan|schedule|calendar))/.test(userMessage)
  const wantsWhiteboard = /whiteboard|draw|sketch/.test(userMessage)

  const hasIntent = wantsChess || wantsMath || wantsFlashcards || wantsCalendar || wantsWhiteboard

  // If no clear intent but an app is active, scope to that app's tools
  // This handles follow-up messages like "what is the answer?" during math
  if (!hasIntent) {
    if (activeAppId && APP_TOOL_PREFIX[activeAppId]) {
      const prefix = APP_TOOL_PREFIX[activeAppId]
      return allTools.filter(tool => {
        const name = tool.function?.name || ''
        return name.startsWith(prefix)
      })
    }
    // No active app and no intent — send all tools (LLM decides)
    return allTools
  }

  // Only include tools for the matched app(s)
  // When switching apps, also include the old app's end/finish tool so LLM can close it
  const activePrefix = activeAppId ? APP_TOOL_PREFIX[activeAppId] : null
  const isSwitchingApps = hasIntent && activePrefix && !(
    (wantsChess && activeAppId === 'chess') ||
    (wantsMath && activeAppId === 'math-practice') ||
    (wantsFlashcards && activeAppId === 'flashcards') ||
    (wantsCalendar && activeAppId === 'google-calendar') ||
    (wantsWhiteboard && activeAppId === 'whiteboard')
  )

  return allTools.filter(tool => {
    const name = tool.function?.name || ''
    if (wantsChess && name.startsWith('chess_')) return true
    if (wantsMath && name.startsWith('math_')) return true
    if (wantsFlashcards && name.startsWith('flashcards_')) return true
    if (wantsCalendar && name.startsWith('calendar_')) return true
    if (wantsWhiteboard && name.startsWith('whiteboard_')) return true
    // Include old app's end/finish/stop tools when switching
    if (isSwitchingApps && activePrefix && name.startsWith(activePrefix) &&
        /end_game|finish|stop|end_session|close/.test(name)) return true
    return false
  })
}
