import type { Request, Response, NextFunction } from 'express'
import { config } from '../config.js'

interface RateWindow {
  count: number
  windowStart: number
}

const userWindows = new Map<string, RateWindow>()

// Purge expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, window] of userWindows) {
    if (now - window.windowStart > 60_000) {
      userWindows.delete(key)
    }
  }
}, 5 * 60 * 1000)

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id
  if (!userId) return next()

  const now = Date.now()
  const limit = config.rateLimitPerMin

  let window = userWindows.get(userId)
  if (!window || now - window.windowStart > 60_000) {
    window = { count: 0, windowStart: now }
    userWindows.set(userId, window)
  }

  window.count++

  if (window.count > limit) {
    const retryAfter = Math.ceil((window.windowStart + 60_000 - now) / 1000)
    res.setHeader('Retry-After', String(retryAfter))
    return res.status(429).json({
      error: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      retryAfter,
    })
  }

  next()
}
