import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db/client.js'
import { hashPassword, verifyPassword } from './password.js'
import { createToken, requireAuth } from './middleware.js'

export const authRoutes = Router()

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1),
  role: z.enum(['student', 'teacher']).default('student'),
})

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

authRoutes.post('/register', async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body)
    const existing = await query('SELECT id FROM users WHERE email = $1', [body.email])
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    const passwordHash = await hashPassword(body.password)
    const result = await query(
      'INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role, display_name',
      [body.email, passwordHash, body.displayName, body.role]
    )

    const user = result.rows[0]
    const token = createToken({ id: user.id, email: user.email, role: user.role })

    res.status(201).json({ token, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } })
  } catch (err) {
    next(err)
  }
})

authRoutes.post('/login', async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body)
    const result = await query(
      'SELECT id, email, password_hash, display_name, role FROM users WHERE email = $1',
      [body.email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const user = result.rows[0]
    const valid = await verifyPassword(body.password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = createToken({ id: user.id, email: user.email, role: user.role })

    res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } })
  } catch (err) {
    next(err)
  }
})

authRoutes.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})
