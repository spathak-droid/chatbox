// server/src/index.ts
import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { authRoutes } from './auth/routes.js'
import { appRoutes } from './apps/routes.js'
import { chatRoutes } from './chat/routes.js'
import { errorHandler } from './middleware/error-handler.js'
import { initDb } from './db/client.js'
import { loadAppsIntoCache, registerApp } from './apps/registry.js'

const app = express()

app.use(cors({
  origin: [
    config.corsOrigin,
    config.appUrls.mathPractice,
    config.appUrls.googleCalendar,
    config.appUrls.chess,
    config.appUrls.flashcards,
    config.appUrls.whiteboard,
  ].filter(Boolean),
  credentials: true,
}))
app.use(express.json())

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/apps', appRoutes)

// Error handler
app.use(errorHandler)

async function start() {
  await initDb()

  const appEndpoints = [
    config.appUrls.mathPractice,
    config.appUrls.googleCalendar,
    config.appUrls.chess,
    config.appUrls.flashcards,
    config.appUrls.whiteboard,
  ]

  for (const baseUrl of appEndpoints) {
    try {
      const res = await fetch(`${baseUrl}/api/manifest`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const manifest = await res.json()
        await registerApp(manifest)
        console.log(`Registered app: ${manifest.name}`)
      }
    } catch (err) {
      console.warn(`Could not register app at ${baseUrl}:`, (err as Error).message)
    }
  }

  await loadAppsIntoCache()

  app.listen(config.port, () => {
    console.log(`ChatBridge server running on port ${config.port}`)
  })
}

start().catch(console.error)
