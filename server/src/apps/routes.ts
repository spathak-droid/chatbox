import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import { registerApp, getAllApps, getApp } from './registry.js'
import { getSessionsForConversation } from './session.js'
import { validateManifest } from './manifest.js'
import { buildGoogleAuthUrl, exchangeGoogleCode, saveOAuthConnection, getOAuthConnection } from './oauth-manager.js'

export const appRoutes = Router()

appRoutes.post('/register', async (req, res, next) => {
  try {
    const manifest = validateManifest(req.body)
    await registerApp(manifest)
    res.status(201).json({ ok: true, appId: manifest.id })
  } catch (err) {
    next(err)
  }
})

appRoutes.get('/', requireAuth, async (_req, res, next) => {
  try {
    const apps = await getAllApps()
    res.json({ apps })
  } catch (err) {
    next(err)
  }
})

// ============ OAuth Routes ============

// Start OAuth flow
appRoutes.get('/oauth/google/start', requireAuth, (_req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: _req.user!.id })).toString('base64')
  const authUrl = buildGoogleAuthUrl(state)
  res.json({ authUrl })
})

// OAuth callback (no auth required - comes from Google redirect)
appRoutes.get('/oauth/google/callback', async (req, res, next) => {
  try {
    const code = req.query.code as string
    const stateParam = req.query.state as string
    if (!code || !stateParam) {
      return res.status(400).send('Missing code or state parameter')
    }
    const state = JSON.parse(Buffer.from(stateParam, 'base64').toString())
    const userId = state.userId
    const tokens = await exchangeGoogleCode(code)
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000)

    // Fetch Google email
    let googleEmail = ''
    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      if (infoRes.ok) {
        const info = await infoRes.json()
        googleEmail = info.email || ''
      }
    } catch {}

    await saveOAuthConnection(userId, 'google', tokens.accessToken, tokens.refreshToken, expiresAt, 'calendar.events')
    res.send(`<html><body><script>window.close()</script><p>Connected${googleEmail ? ` as ${googleEmail}` : ''}! You can close this tab.</p></body></html>`)
  } catch (err) {
    next(err)
  }
})

// Check connection status
appRoutes.get('/oauth/:provider/status', requireAuth, async (req, res, next) => {
  try {
    const conn = await getOAuthConnection(req.user!.id, req.params.provider)
    res.json({ connected: !!conn, accessToken: conn?.access_token || null })
  } catch (err) {
    next(err)
  }
})

// ============ App Routes ============

appRoutes.get('/sessions/:conversationId', requireAuth, async (req, res, next) => {
  try {
    const sessions = await getSessionsForConversation(req.params.conversationId)
    res.json({ sessions })
  } catch (err) {
    next(err)
  }
})

appRoutes.get('/:appId', requireAuth, async (req, res, next) => {
  try {
    const app = await getApp(req.params.appId)
    if (!app) return res.status(404).json({ error: 'App not found' })
    res.json({ app })
  } catch (err) {
    next(err)
  }
})
