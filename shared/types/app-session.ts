import { z } from 'zod'

export const AppResultEnvelopeSchema = z.object({
  status: z.enum(['ok', 'error', 'pending']),
  data: z.record(z.string(), z.unknown()).optional(),
  summary: z.string().optional(),
  uiUrl: z.string().optional(),
  error: z.string().optional(),
})

export const AppSessionSchema = z.object({
  id: z.string(),
  appId: z.string(),
  conversationId: z.string(),
  userId: z.string(),
  state: z.record(z.string(), z.unknown()),
  status: z.enum(['active', 'completed', 'error']),
  summary: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AppResultEnvelope = z.infer<typeof AppResultEnvelopeSchema>
export type AppSession = z.infer<typeof AppSessionSchema>
