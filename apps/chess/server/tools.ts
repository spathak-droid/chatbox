import { newGame, makeMove, getHint, isCheck, type ChessState } from './engine.js'

interface AppResultEnvelope {
  data?: Record<string, unknown>
  error?: string
  state_patch?: Record<string, unknown>
  iframe_action?: string
}

export function handleTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: Record<string, unknown> | null
): AppResultEnvelope {
  const gameState = sessionState?.chess as ChessState | undefined

  switch (toolName) {
    case 'chess_start_game': {
      const playerColor = (args.playerColor as 'white' | 'black') || 'white'
      const state = newGame(playerColor)
      return {
        data: {
          summary: `New chess game started. You are playing as ${playerColor}. FEN: ${state.fen}`,
          fen: state.fen,
          playerColor,
          gameOver: false,
        },
        state_patch: { chess: state },
        iframe_action: 'reload',
      }
    }

    case 'chess_submit_move': {
      if (!gameState) {
        return { error: 'No active game. Use chess_start_game first.' }
      }
      if (gameState.gameOver) {
        return { error: `Game is already over. Result: ${gameState.result}` }
      }

      const moveStr = args.move as string
      if (!moveStr) {
        return { error: 'Missing required parameter: move' }
      }

      const result = makeMove(gameState, moveStr)
      if (result.error) {
        return { error: result.error }
      }

      const check = isCheck(result.state.fen)
      let summary = `Move: ${result.state.moves[result.state.moves.length - 1]}. FEN: ${result.state.fen}`
      if (result.state.gameOver) {
        summary += ` Game over: ${result.state.result}`
      } else if (check) {
        summary += ' Check!'
      }

      return {
        data: {
          summary,
          fen: result.state.fen,
          lastMove: result.state.moves[result.state.moves.length - 1],
          moves: result.state.moves,
          check,
          gameOver: result.state.gameOver,
          result: result.state.result,
        },
        state_patch: { chess: result.state },
      }
    }

    case 'chess_get_hint': {
      if (!gameState) {
        return { error: 'No active game. Use chess_start_game first.' }
      }

      const hint = getHint(gameState)
      return {
        data: {
          summary: `Current position FEN: ${hint.fen}. Turn: ${hint.turn}. Legal moves: ${hint.legalMoves.join(', ')}`,
          fen: hint.fen,
          turn: hint.turn,
          legalMoves: hint.legalMoves,
          moves: gameState.moves,
        },
      }
    }

    case 'chess_end_game': {
      if (!gameState) {
        return { error: 'No active game.' }
      }

      const moveCount = gameState.moves.length
      const finalFen = gameState.fen
      return {
        data: {
          summary: `Game ended after ${moveCount} moves. Final position: ${finalFen}`,
          moveCount,
          finalFen,
          moves: gameState.moves,
        },
        state_patch: { chess: null },
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}
