import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { requireAuth } from '../auth/middleware.js'
import { registerApp, getAllApps, getApp } from './registry.js'
import { getSessionsForConversation } from './session.js'
import { validateManifest } from './manifest.js'
import { buildGoogleAuthUrl, exchangeGoogleCode, saveOAuthConnection, getOAuthConnection } from './oauth-manager.js'
import { query } from '../db/client.js'

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

// Start OAuth flow (JSON response for fetch-based flows)
appRoutes.get('/oauth/google/start', requireAuth, (_req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: _req.user!.id })).toString('base64')
  const authUrl = buildGoogleAuthUrl(state)
  res.json({ authUrl })
})

// Direct redirect OAuth flow (for popup - no fetch needed, just navigate here)
// Accepts token as query param since popups can't send Authorization headers
appRoutes.get('/oauth/google/redirect', (req, res) => {
  const token = req.query.token as string
  if (!token) return res.status(401).send('Missing token')
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { id: string }
    const state = Buffer.from(JSON.stringify({ userId: payload.id })).toString('base64')
    const authUrl = buildGoogleAuthUrl(state)
    res.redirect(authUrl)
  } catch {
    res.status(401).send('Invalid token')
  }
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

    await saveOAuthConnection(userId, 'google', tokens.accessToken, tokens.refreshToken, expiresAt, 'calendar.events', googleEmail)
    res.send(`<html><body><script>window.close()</script><p>Connected${googleEmail ? ` as ${googleEmail}` : ''}! You can close this tab.</p></body></html>`)
  } catch (err) {
    next(err)
  }
})

// Check connection status - verifies token is actually valid
appRoutes.get('/oauth/:provider/status', requireAuth, async (req, res, next) => {
  try {
    const conn = await getOAuthConnection(req.user!.id, req.params.provider)
    if (!conn) {
      return res.json({ connected: false, accessToken: null, email: null })
    }

    // Verify the token actually works by fetching user info from Google
    let email = conn.email || null
    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${conn.access_token}` },
      })
      if (infoRes.ok) {
        const info = await infoRes.json()
        email = info.email || email
        // Save email if we didn't have it
        if (info.email && !conn.email) {
          await saveOAuthConnection(req.user!.id, req.params.provider, conn.access_token, conn.refresh_token, conn.expires_at ? new Date(conn.expires_at) : undefined, conn.scopes, info.email)
        }
      } else {
        // Token is invalid - connection is stale
        return res.json({ connected: false, accessToken: null, email: null })
      }
    } catch {
      // Can't verify - treat as disconnected
      return res.json({ connected: false, accessToken: null, email: null })
    }

    res.json({ connected: true, accessToken: conn.access_token, email })
  } catch (err) {
    next(err)
  }
})

// Disconnect OAuth (remove stored tokens so user can re-auth)
appRoutes.delete('/oauth/:provider/disconnect', requireAuth, async (req, res, next) => {
  try {
    await query(
      'DELETE FROM oauth_connections WHERE user_id = $1 AND provider = $2',
      [req.user!.id, req.params.provider]
    )
    res.json({ ok: true, message: `Disconnected from ${req.params.provider}` })
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
