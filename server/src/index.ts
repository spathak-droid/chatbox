// server/src/index.ts
import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { errorHandler } from './middleware/error-handler.js'

const app = express()

app.use(cors({ origin: config.corsOrigin, credentials: true }))
app.use(express.json())

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

// Placeholder for routes — will be added in later tasks
// app.use('/api/auth', authRoutes)
// app.use('/api/chat', chatRoutes)
// app.use('/api/apps', appRoutes)

// Error handler
app.use(errorHandler)

async function start() {
  app.listen(config.port, () => {
    console.log(`ChatBridge server running on port ${config.port}`)
  })
}

start().catch(console.error)
