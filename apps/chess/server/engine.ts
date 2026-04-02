import { Chess } from 'chess.js'

export interface ChessState {
  fen: string
  moves: string[]
  playerColor: 'white' | 'black'
  gameOver: boolean
  result?: string
}

export function newGame(playerColor: 'white' | 'black' = 'white'): ChessState {
  const game = new Chess()
  return {
    fen: game.fen(),
    moves: [],
    playerColor,
    gameOver: false,
  }
}

export function makeMove(
  state: ChessState,
  moveStr: string
): { state: ChessState; error?: string } {
  const game = new Chess(state.fen)

  let result = null

  // Try as SAN first (e.g., "e4", "Nf3")
  try {
    result = game.move(moveStr)
  } catch {
    result = null
  }

  // Try as UCI (e.g., "e2e4")
  if (!result) {
    try {
      result = game.move({
        from: moveStr.slice(0, 2),
        to: moveStr.slice(2, 4),
        promotion: moveStr[4] || undefined,
      })
    } catch {
      result = null
    }
  }

  if (!result) {
    const legalMoves = game.moves()
    return {
      state,
      error: `Invalid move: "${moveStr}". Legal moves: ${legalMoves.join(', ')}`,
    }
  }

  const newMoves = [...state.moves, result.san]
  let gameOver = false
  let gameResult: string | undefined

  if (game.isCheckmate()) {
    gameOver = true
    gameResult = `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins.`
  } else if (game.isDraw()) {
    gameOver = true
    if (game.isStalemate()) {
      gameResult = 'Draw by stalemate.'
    } else if (game.isThreefoldRepetition()) {
      gameResult = 'Draw by threefold repetition.'
    } else if (game.isInsufficientMaterial()) {
      gameResult = 'Draw by insufficient material.'
    } else {
      gameResult = 'Draw.'
    }
  }

  return {
    state: {
      fen: game.fen(),
      moves: newMoves,
      playerColor: state.playerColor,
      gameOver,
      result: gameResult,
    },
  }
}

export function getHint(state: ChessState): {
  fen: string
  turn: string
  legalMoves: string[]
} {
  const game = new Chess(state.fen)
  return {
    fen: state.fen,
    turn: game.turn() === 'w' ? 'white' : 'black',
    legalMoves: game.moves(),
  }
}

export function isCheck(fen: string): boolean {
  const game = new Chess(fen)
  return game.isCheck()
}

export function getLegalMovesFrom(fen: string, square: string): string[] {
  const game = new Chess(fen)
  const moves = game.moves({ square: square as any, verbose: true })
  return moves.map(m => m.to)
}

export function makeAiMove(state: ChessState): { state: ChessState; error?: string } {
  const game = new Chess(state.fen)
  const moves = game.moves()
  if (moves.length === 0) return { state }

  // Pick a reasonable move: prioritize captures/checks, then random
  const captureMoves = moves.filter(m => m.includes('x'))
  const checkMoves = moves.filter(m => m.includes('+'))
  const centerMoves = moves.filter(m => m.includes('d4') || m.includes('d5') || m.includes('e4') || m.includes('e5'))

  let pool = checkMoves.length > 0 ? checkMoves
    : captureMoves.length > 0 ? captureMoves
    : centerMoves.length > 0 ? centerMoves
    : moves

  const chosen = pool[Math.floor(Math.random() * pool.length)]
  return makeMove(state, chosen)
}
