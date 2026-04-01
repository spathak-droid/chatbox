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
