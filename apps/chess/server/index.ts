import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { manifest } from './manifest.js'
import { handleTool } from './tools.js'
import { getLegalMovesFrom, makeAiMove, type ChessState } from './engine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.PORT || '3003', 10)

const app = express()
app.use(cors())
app.use(express.json())

// Serve client files at /app
app.use('/app', express.static(path.join(__dirname, '..', 'client')))

// Manifest endpoint
app.get('/api/manifest', (_req, res) => {
  res.json(manifest)
})

// Tool execution endpoint
app.post('/api/tools/:toolName', (req, res) => {
  const { toolName } = req.params
  const { args, sessionState } = req.body ?? {}

  try {
    const result = handleTool(toolName, args ?? {}, sessionState ?? null)
    res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// Legal moves for a square (used by client for dots)
app.post('/api/legal-moves', (req, res) => {
  const { fen, square } = req.body ?? {}
  if (!fen || !square) {
    return res.json({ moves: [] })
  }
  try {
    const moves = getLegalMovesFrom(fen, square)
    res.json({ moves })
  } catch {
    res.json({ moves: [] })
  }
})

// AI opponent move
app.post('/api/ai-move', (req, res) => {
  const { sessionState } = req.body ?? {}
  if (!sessionState?.fen) {
    return res.status(400).json({ error: 'No game state' })
  }
  try {
    const result = makeAiMove(sessionState as ChessState)
    if (result.error) {
      return res.json({ status: 'error', error: result.error })
    }
    res.json({
      status: 'ok',
      data: {
        fen: result.state.fen,
        moves: result.state.moves,
        playerColor: result.state.playerColor,
        gameOver: result.state.gameOver,
        result: result.state.result,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

app.listen(PORT, () => {
  console.log(`Chess app listening on http://localhost:${PORT}`)
  console.log(`  Manifest: http://localhost:${PORT}/api/manifest`)
  console.log(`  Board UI: http://localhost:${PORT}/app`)
})
