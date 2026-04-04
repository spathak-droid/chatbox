// server/src/middleware/error-handler.ts
import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error('Error:', err)

  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation error', details: err.issues })
  }

  if (err instanceof Error) {
    // Never leak internal error details to the client
    return res.status(500).json({ error: 'Internal server error' })
  }

  res.status(500).json({ error: 'Internal server error' })
}
