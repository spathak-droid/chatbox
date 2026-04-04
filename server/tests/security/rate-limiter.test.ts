import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rateLimiter } from '../../src/middleware/rate-limiter.js'
import type { Request, Response, NextFunction } from 'express'

function mockReq(userId?: string): Partial<Request> {
  return {
    user: userId ? { id: userId, email: `${userId}@test.com`, role: 'student' } : undefined,
  } as Partial<Request>
}

function mockRes(): Partial<Response> & { _status: number; _headers: Record<string, string>; _json: any } {
  const res: any = {
    _status: 200,
    _headers: {} as Record<string, string>,
    _json: null,
    setHeader(key: string, value: string) {
      res._headers[key] = value
      return res
    },
    status(code: number) {
      res._status = code
      return res
    },
    json(body: any) {
      res._json = body
      return res
    },
  }
  return res
}

describe('rateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('passes requests through when under the limit', () => {
    const req = mockReq('user-1')
    const res = mockRes()
    const next = vi.fn()

    rateLimiter(req as Request, res as unknown as Response, next as NextFunction)

    expect(next).toHaveBeenCalled()
    expect(res._status).toBe(200)
  })

  it('passes through when req.user is not set', () => {
    const req = mockReq()
    const res = mockRes()
    const next = vi.fn()

    rateLimiter(req as Request, res as unknown as Response, next as NextFunction)

    expect(next).toHaveBeenCalled()
  })

  it('returns 429 when requests exceed the limit', () => {
    const limit = 15 // default rateLimitPerMin

    for (let i = 0; i < limit; i++) {
      const req = mockReq('user-flood')
      const res = mockRes()
      const next = vi.fn()
      rateLimiter(req as Request, res as unknown as Response, next as NextFunction)
      expect(next).toHaveBeenCalled()
    }

    // Request 16 should be blocked
    const req = mockReq('user-flood')
    const res = mockRes()
    const next = vi.fn()
    rateLimiter(req as Request, res as unknown as Response, next as NextFunction)

    expect(next).not.toHaveBeenCalled()
    expect(res._status).toBe(429)
    expect(res._json).toHaveProperty('error')
    expect(res._json.error).toMatch(/Rate limit exceeded/)
  })

  it('sets Retry-After header on 429 responses', () => {
    const limit = 15

    for (let i = 0; i < limit; i++) {
      const req = mockReq('user-retry')
      const res = mockRes()
      const next = vi.fn()
      rateLimiter(req as Request, res as unknown as Response, next as NextFunction)
    }

    // Advance time by 10 seconds so Retry-After is ~50
    vi.advanceTimersByTime(10_000)

    const req = mockReq('user-retry')
    const res = mockRes()
    const next = vi.fn()
    rateLimiter(req as Request, res as unknown as Response, next as NextFunction)

    expect(res._status).toBe(429)
    expect(res._headers['Retry-After']).toBeDefined()
    const retryAfter = parseInt(res._headers['Retry-After'], 10)
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(60)
  })

  it('tracks different users separately', () => {
    const limit = 15

    // Exhaust limit for user-a
    for (let i = 0; i < limit; i++) {
      const req = mockReq('user-a')
      const res = mockRes()
      const next = vi.fn()
      rateLimiter(req as Request, res as unknown as Response, next as NextFunction)
    }

    // user-a is now rate-limited
    const reqA = mockReq('user-a')
    const resA = mockRes()
    const nextA = vi.fn()
    rateLimiter(reqA as Request, resA as unknown as Response, nextA as NextFunction)
    expect(resA._status).toBe(429)
    expect(nextA).not.toHaveBeenCalled()

    // user-b should still pass through
    const reqB = mockReq('user-b')
    const resB = mockRes()
    const nextB = vi.fn()
    rateLimiter(reqB as Request, resB as unknown as Response, nextB as NextFunction)
    expect(nextB).toHaveBeenCalled()
    expect(resB._status).toBe(200)
  })

  it('resets the window after 60 seconds', () => {
    const limit = 15

    // Exhaust limit
    for (let i = 0; i < limit; i++) {
      const req = mockReq('user-reset')
      const res = mockRes()
      const next = vi.fn()
      rateLimiter(req as Request, res as unknown as Response, next as NextFunction)
    }

    // Confirm rate-limited
    const reqBlocked = mockReq('user-reset')
    const resBlocked = mockRes()
    const nextBlocked = vi.fn()
    rateLimiter(reqBlocked as Request, resBlocked as unknown as Response, nextBlocked as NextFunction)
    expect(resBlocked._status).toBe(429)

    // Advance past the 60-second window
    vi.advanceTimersByTime(61_000)

    // Should pass through again
    const req = mockReq('user-reset')
    const res = mockRes()
    const next = vi.fn()
    rateLimiter(req as Request, res as unknown as Response, next as NextFunction)

    expect(next).toHaveBeenCalled()
    expect(res._status).toBe(200)
  })
})
