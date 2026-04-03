import { z } from 'zod'

export const HostMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('host.init'),
    appSessionId: z.string(),
    state: z.record(z.string(), z.unknown()),
    theme: z.enum(['light', 'dark']).optional(),
  }),
  z.object({
    type: z.literal('host.state_patch'),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('host.tool_result'),
    toolName: z.string(),
    result: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('host.cancel'),
  }),
])

export const AppMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('app.ready'),
    appId: z.string().optional(),
  }),
  z.object({
    type: z.literal('app.state_patch'),
    patch: z.record(z.string(), z.unknown()).optional(),
    state: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('app.tool_request'),
    toolName: z.string().optional(),
    tool: z.string().optional(),
    args: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('app.resize'),
    height: z.number(),
  }),
  z.object({
    type: z.literal('app.complete'),
    summary: z.string().optional(),
    result: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('app.game_over'),
    result: z.string().optional(),
  }),
  z.object({
    type: z.literal('app.error'),
    error: z.string(),
  }),
])

export type HostMessage = z.infer<typeof HostMessageSchema>
export type AppMessage = z.infer<typeof AppMessageSchema>
