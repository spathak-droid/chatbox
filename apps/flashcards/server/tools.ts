import type { AppResultEnvelope } from '../../../shared/types/app-session.js'

interface Card {
  front: string
  back: string
}

interface SessionState {
  topic?: string
  cards?: Card[]
  currentIndex?: number
  revealed?: boolean
  known?: number
  unknown?: number
  unknownCards?: Card[]
  finished?: boolean
  [key: string]: unknown
}

export function handleTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: SessionState,
): AppResultEnvelope {
  switch (toolName) {
    case 'flashcards_start_deck':
      return handleStartDeck(args, sessionState)
    case 'flashcards_reveal_card':
      return handleRevealCard(sessionState)
    case 'flashcards_mark_known':
      return handleMarkKnown(sessionState)
    case 'flashcards_mark_unknown':
      return handleMarkUnknown(sessionState)
    case 'flashcards_finish_deck':
      return handleFinishDeck(sessionState)
    default:
      return { status: 'error', error: `Unknown tool: ${toolName}` }
  }
}

function handleStartDeck(
  args: Record<string, unknown>,
  _sessionState: SessionState,
): AppResultEnvelope {
  const topic = (args.topic as string) || 'General'
  const cards = (args.cards as Card[]) || []

  if (cards.length === 0) {
    return { status: 'error', error: 'Cards array is required and must not be empty.' }
  }

  const state: SessionState = {
    topic,
    cards,
    currentIndex: 0,
    revealed: false,
    known: 0,
    unknown: 0,
    unknownCards: [],
    finished: false,
  }

  return {
    status: 'ok',
    data: state as Record<string, unknown>,
    summary: `Started flashcard deck "${topic}" with ${cards.length} cards. Card 1 front: "${cards[0].front}"`,
  }
}

function handleRevealCard(sessionState: SessionState): AppResultEnvelope {
  if (!sessionState.cards || sessionState.finished) {
    return { status: 'error', error: 'No active deck. Use flashcards_start_deck first.' }
  }

  const currentIndex = sessionState.currentIndex ?? 0
  const card = sessionState.cards[currentIndex]

  if (!card) {
    return { status: 'error', error: 'No current card available.' }
  }

  const patch: SessionState = {
    ...sessionState,
    revealed: true,
  }

  return {
    status: 'ok',
    data: patch as Record<string, unknown>,
    summary: `Card ${currentIndex + 1} — Front: "${card.front}" | Back: "${card.back}"`,
  }
}

function handleMarkKnown(sessionState: SessionState): AppResultEnvelope {
  if (!sessionState.cards || sessionState.finished) {
    return { status: 'error', error: 'No active deck.' }
  }

  const currentIndex = sessionState.currentIndex ?? 0
  const known = (sessionState.known ?? 0) + 1
  const nextIndex = currentIndex + 1
  const totalCards = sessionState.cards.length
  const finished = nextIndex >= totalCards

  const patch: SessionState = {
    ...sessionState,
    currentIndex: nextIndex,
    revealed: false,
    known,
    finished,
  }

  let summary = `Marked card ${currentIndex + 1} as known. (${known} known so far)`

  if (finished) {
    const unknown = sessionState.unknown ?? 0
    const total = known + unknown
    const accuracy = total > 0 ? Math.round((known / total) * 100) : 0
    summary = `Deck complete! ${known}/${total} known (${accuracy}% accuracy).`
    if ((sessionState.unknownCards ?? []).length > 0) {
      summary += ` Cards to review: ${(sessionState.unknownCards ?? []).map((c) => c.front).join('; ')}.`
    }
  } else {
    summary += ` Next card ${nextIndex + 1} of ${totalCards}: "${sessionState.cards[nextIndex].front}"`
  }

  return {
    status: 'ok',
    data: patch as Record<string, unknown>,
    summary,
  }
}

function handleMarkUnknown(sessionState: SessionState): AppResultEnvelope {
  if (!sessionState.cards || sessionState.finished) {
    return { status: 'error', error: 'No active deck.' }
  }

  const currentIndex = sessionState.currentIndex ?? 0
  const card = sessionState.cards[currentIndex]
  const unknown = (sessionState.unknown ?? 0) + 1
  const unknownCards = [...(sessionState.unknownCards ?? []), card]
  const nextIndex = currentIndex + 1
  const totalCards = sessionState.cards.length
  const finished = nextIndex >= totalCards

  const patch: SessionState = {
    ...sessionState,
    currentIndex: nextIndex,
    revealed: false,
    unknown,
    unknownCards,
    finished,
  }

  let summary = `Marked card ${currentIndex + 1} as unknown / needs review. (${unknown} unknown so far)`

  if (finished) {
    const known = sessionState.known ?? 0
    const total = known + unknown
    const accuracy = total > 0 ? Math.round((known / total) * 100) : 0
    summary = `Deck complete! ${known}/${total} known (${accuracy}% accuracy).`
    summary += ` Cards to review: ${unknownCards.map((c) => c.front).join('; ')}.`
  } else {
    summary += ` Next card ${nextIndex + 1} of ${totalCards}: "${sessionState.cards[nextIndex].front}"`
  }

  return {
    status: 'ok',
    data: patch as Record<string, unknown>,
    summary,
  }
}

function handleFinishDeck(sessionState: SessionState): AppResultEnvelope {
  if (!sessionState.cards) {
    return { status: 'error', error: 'No active deck.' }
  }

  const known = sessionState.known ?? 0
  const unknown = sessionState.unknown ?? 0
  const total = known + unknown
  const totalCards = sessionState.cards.length
  const remaining = totalCards - (sessionState.currentIndex ?? 0)
  const accuracy = total > 0 ? Math.round((known / total) * 100) : 0
  const unknownCards = sessionState.unknownCards ?? []

  const patch: SessionState = {
    ...sessionState,
    finished: true,
  }

  let summary = `Deck finished early! ${known}/${total} reviewed cards known (${accuracy}% accuracy). ${remaining} cards skipped.`
  if (unknownCards.length > 0) {
    summary += ` Cards to review: ${unknownCards.map((c) => `"${c.front}"`).join('; ')}.`
  }

  return {
    status: 'ok',
    data: patch as Record<string, unknown>,
    summary,
  }
}
