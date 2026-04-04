import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { manifest } from './manifest.js'
import { handleTool } from './tools.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3002

app.use(cors())
app.use(express.json())

// Serve iframe client
app.use('/app', express.static(path.join(__dirname, '..', 'client')))

// Manifest endpoint
app.get('/api/manifest', (_req, res) => {
  res.json(manifest)
})

// Tool execution endpoint
app.post('/api/tools/:toolName', async (req, res) => {
  const { toolName } = req.params
  const { args, sessionState } = req.body
  // Read OAuth token from secure platform header
  const oauthToken = req.headers['x-platform-oauth-token'] as string | undefined
  const stateWithToken = oauthToken
    ? { ...sessionState, accessToken: oauthToken }
    : sessionState || {}

  try {
    const result = await handleTool(toolName, args || {}, stateWithToken)
    res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ status: 'error', error: message })
  }
})

app.listen(PORT, () => {
  console.log(`Google Calendar app running on http://localhost:${PORT}`)
  console.log(`  Manifest: http://localhost:${PORT}/api/manifest`)
  console.log(`  Iframe:   http://localhost:${PORT}/app`)
})
