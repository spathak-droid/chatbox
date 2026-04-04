import { config } from '../config.js'
import { query } from '../db/client.js'
import { encrypt, decrypt } from '../security/crypto.js'

export async function getOAuthConnection(userId: string, provider: string) {
  const result = await query(
    'SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  )
  if (result.rows.length === 0) return null
  const conn = result.rows[0]
  // Decrypt tokens when reading from DB
  conn.access_token = decrypt(conn.access_token)
  if (conn.refresh_token) conn.refresh_token = decrypt(conn.refresh_token)
  if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
    if (conn.refresh_token) return refreshToken(userId, provider, conn.refresh_token)
    return null
  }
  return conn
}

export async function saveOAuthConnection(
  userId: string,
  provider: string,
  accessToken: string,
  refreshToken?: string,
  expiresAt?: Date,
  scopes?: string,
  email?: string,
) {
  await query(
    `INSERT INTO oauth_connections (user_id, provider, access_token, refresh_token, expires_at, scopes, email)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_connections.refresh_token),
       expires_at = EXCLUDED.expires_at,
       email = COALESCE(EXCLUDED.email, oauth_connections.email),
       updated_at = NOW()`,
    [userId, provider, encrypt(accessToken), refreshToken ? encrypt(refreshToken) : null, expiresAt || null, scopes || null, email || null]
  )
}

async function refreshToken(userId: string, provider: string, refreshTokenValue: string) {
  if (provider !== 'google') return null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refreshTokenValue,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)
  await saveOAuthConnection(userId, provider, data.access_token, undefined, expiresAt)
  return { access_token: data.access_token, refresh_token: refreshTokenValue, expires_at: expiresAt }
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCode(code: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.googleRedirectUri,
    }),
  })
  if (!res.ok) throw new Error('Token exchange failed')
  const data = await res.json()
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in }
}
