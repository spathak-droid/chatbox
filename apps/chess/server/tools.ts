import { newGame, makeMove, makeAiMove, getHint, isCheck, type ChessState } from './engine.js'

interface AppResultEnvelope {
  status: 'ok' | 'error' | 'pending'
  data?: Record<string, unknown>
  summary?: string
  error?: string
}

export function handleTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: Record<string, unknown> | null
): AppResultEnvelope {
  const gameState = (sessionState as ChessState | undefined) ?? undefined
  // Also check if state is nested under 'chess' key
  const chess = gameState?.fen ? gameState : (sessionState?.chess as ChessState | undefined)

  switch (toolName) {
    case 'chess_start_game': {
      const playerColor = (args.playerColor as 'white' | 'black') || 'white'
      const state = newGame(playerColor)
      return {
        status: 'ok',
        data: {
          fen: state.fen,
          moves: state.moves,
          playerColor: state.playerColor,
          gameOver: state.gameOver,
        },
        summary: `New chess game started. You are playing as ${playerColor}. FEN: ${state.fen}`,
      }
    }

    case 'chess_submit_move': {
      if (!chess) {
        return { status: 'error', error: 'No active game. Use chess_start_game first.' }
      }
      if (chess.gameOver) {
        return { status: 'error', error: `Game is already over. Result: ${chess.result}` }
      }

      const moveStr = args.move as string
      if (!moveStr) {
        return { status: 'error', error: 'Missing required parameter: move' }
      }

      const result = makeMove(chess, moveStr)
      if (result.error) {
        return { status: 'error', error: result.error }
      }

      const check = isCheck(result.state.fen)
      let summary = `Move: ${result.state.moves[result.state.moves.length - 1]}. FEN: ${result.state.fen}`
      if (result.state.gameOver) {
        summary += ` Game over: ${result.state.result}`
      } else if (check) {
        summary += ' Check!'
      }

      return {
        status: 'ok',
        data: {
          fen: result.state.fen,
          moves: result.state.moves,
          playerColor: result.state.playerColor,
          gameOver: result.state.gameOver,
          result: result.state.result,
        },
        summary,
      }
    }

    case 'chess_get_hint': {
      if (!chess) {
        return { status: 'error', error: 'No active game. Use chess_start_game first.' }
      }

      const hint = getHint(chess)
      return {
        status: 'ok',
        data: {
          fen: hint.fen,
          turn: hint.turn,
          legalMoves: hint.legalMoves,
          moves: chess.moves,
        },
        summary: `Current position FEN: ${hint.fen}. Turn: ${hint.turn}. Legal moves: ${hint.legalMoves.join(', ')}`,
      }
    }

    case 'chess_end_game': {
      if (!chess) {
        return { status: 'error', error: 'No active game.' }
      }

      return {
        status: 'ok',
        data: {
          gameOver: true,
          result: 'Game ended by player',
          moves: chess.moves,
          fen: chess.fen,
        },
        summary: `Game ended after ${chess.moves.length} moves. Final position: ${chess.fen}`,
      }
    }

    default:
      return { status: 'error', error: `Unknown tool: ${toolName}` }
  }
}
