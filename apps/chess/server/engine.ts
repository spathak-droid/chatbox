import { Chess } from 'chess.js'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface ChessState {
  fen: string
  moves: string[]
  playerColor: 'white' | 'black'
  gameOver: boolean
  result?: string
  difficulty?: Difficulty
}

export function newGame(playerColor: 'white' | 'black' = 'white', difficulty?: Difficulty): ChessState {
  const game = new Chess()
  return {
    fen: game.fen(),
    moves: [],
    playerColor,
    gameOver: false,
    difficulty,
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

// ============ MINIMAX AI ENGINE ============

const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
}

// Piece-square tables for positional play (from white's perspective)
const PAWN_TABLE = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
]

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
]

function evaluateBoard(game: Chess): number {
  if (game.isCheckmate()) {
    return game.turn() === 'w' ? -99999 : 99999
  }
  if (game.isDraw()) return 0

  let score = 0
  const board = game.board()
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c]
      if (!piece) continue
      const val = PIECE_VALUES[piece.type] || 0
      // Add positional bonus
      let posBonus = 0
      if (piece.type === 'p') {
        posBonus = PAWN_TABLE[piece.color === 'w' ? r * 8 + c : (7 - r) * 8 + c]
      } else if (piece.type === 'n') {
        posBonus = KNIGHT_TABLE[piece.color === 'w' ? r * 8 + c : (7 - r) * 8 + c]
      }
      score += piece.color === 'w' ? (val + posBonus) : -(val + posBonus)
    }
  }
  return score
}

function minimax(game: Chess, depth: number, alpha: number, beta: number, isMaximizing: boolean): number {
  if (depth === 0 || game.isGameOver()) {
    return evaluateBoard(game)
  }

  const moves = game.moves()

  if (isMaximizing) {
    let maxEval = -Infinity
    for (const move of moves) {
      game.move(move)
      const eval_ = minimax(game, depth - 1, alpha, beta, false)
      game.undo()
      maxEval = Math.max(maxEval, eval_)
      alpha = Math.max(alpha, eval_)
      if (beta <= alpha) break
    }
    return maxEval
  } else {
    let minEval = Infinity
    for (const move of moves) {
      game.move(move)
      const eval_ = minimax(game, depth - 1, alpha, beta, true)
      game.undo()
      minEval = Math.min(minEval, eval_)
      beta = Math.min(beta, eval_)
      if (beta <= alpha) break
    }
    return minEval
  }
}

function findBestMove(game: Chess, depth: number): string {
  const moves = game.moves()
  const isMaximizing = game.turn() === 'w'
  let bestMove = moves[0]
  let bestEval = isMaximizing ? -Infinity : Infinity

  for (const move of moves) {
    game.move(move)
    const eval_ = minimax(game, depth - 1, -Infinity, Infinity, !isMaximizing)
    game.undo()

    if (isMaximizing ? eval_ > bestEval : eval_ < bestEval) {
      bestEval = eval_
      bestMove = move
    }
  }
  return bestMove
}

export function makeAiMove(state: ChessState): { state: ChessState; error?: string } {
  const game = new Chess(state.fen)
  const moves = game.moves()
  if (moves.length === 0) return { state }

  const difficulty = state.difficulty || 'medium'
  let chosen: string

  if (difficulty === 'easy') {
    // Easy: purely random — a beginner who just knows how pieces move
    chosen = moves[Math.floor(Math.random() * moves.length)]
  } else if (difficulty === 'hard') {
    // Hard: depth 4 — looks 4 half-moves ahead with alpha-beta pruning
    chosen = findBestMove(game, 4)
  } else {
    // Medium: depth 2 — looks 2 half-moves ahead
    chosen = findBestMove(game, 2)
  }

  return makeMove(state, chosen)
}
