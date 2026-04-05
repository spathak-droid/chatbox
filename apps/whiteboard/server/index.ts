import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { manifest } from './manifest.js'
import { handleTool } from './tools.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = parseInt(process.env.PORT || '3005', 10)

const app = express()
app.use(cors())
app.use(express.json())

// Serve Excalidraw client
app.use('/app', express.static(path.join(__dirname, '..', 'client', 'dist')))

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

app.listen(PORT, () => {
  console.log(`Whiteboard app listening on http://localhost:${PORT}`)
  console.log(`  Manifest: http://localhost:${PORT}/api/manifest`)
  console.log(`  Iframe:   http://localhost:${PORT}/app`)
})
