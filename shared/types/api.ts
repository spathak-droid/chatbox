import { z } from 'zod'

export const ChatRequestSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string(),
})

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  toolArgs: z.unknown().optional(),
  toolResult: z.unknown().optional(),
  appId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
})

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
})

export type ChatRequest = z.infer<typeof ChatRequestSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ToolCall = z.infer<typeof ToolCallSchema>
