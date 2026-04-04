import { describe, it, expect } from 'vitest'

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api'

function uniqueEmail(): string {
  return `auth-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`
}

describe('POST /auth/register', () => {
  it('creates a new user and returns token + user object with role=student', async () => {
    const email = uniqueEmail()
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123', displayName: 'Test User' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('token')
    expect(typeof body.token).toBe('string')
    expect(body.token.length).toBeGreaterThan(0)
    expect(body).toHaveProperty('user')
    expect(body.user.email).toBe(email)
    expect(body.user.role).toBe('student')
    expect(body.user).toHaveProperty('id')
    expect(body.user).toHaveProperty('displayName')
  })

  it('returns 409 for duplicate email', async () => {
    const email = uniqueEmail()
    // Register once
    await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123', displayName: 'Test User' }),
    })

    // Register again with same email
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123', displayName: 'Test User' }),
    })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 400+ for missing/invalid fields (email: bad)', async () => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bad', password: 'password123', displayName: 'Test User' }),
    })

    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

describe('POST /auth/login', () => {
  it('returns token for valid credentials', async () => {
    const email = uniqueEmail()
    const password = 'validpass123'

    // Register first
    await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName: 'Login Test User' }),
    })

    // Login
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('token')
    expect(typeof body.token).toBe('string')
    expect(body.token.length).toBeGreaterThan(0)
    expect(body).toHaveProperty('user')
    expect(body.user.email).toBe(email)
  })

  it('returns 401 for wrong password', async () => {
    const email = uniqueEmail()

    await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'correctpassword', displayName: 'Test User' }),
    })

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrongpassword' }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 401 for nonexistent user', async () => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: uniqueEmail(), password: 'somepassword' }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })
})

describe('GET /auth/me', () => {
  it('returns user for valid token', async () => {
    const email = uniqueEmail()

    const registerRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123', displayName: 'Me Test User' }),
    })
    const { token } = await registerRes.json()

    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('user')
    expect(body.user.email).toBe(email)
  })

  it('returns 401 for invalid token', async () => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: 'Bearer invalidtoken' },
    })

    expect(res.status).toBe(401)
  })
})
