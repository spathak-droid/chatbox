import { z } from 'zod'

export const AppToolParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  description: z.string(),
  required: z.boolean().default(true),
  enum: z.array(z.string()).optional(),
})

export const AppToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.array(AppToolParameterSchema),
})

export const AppManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['education', 'productivity', 'game', 'utility']),
  authType: z.enum(['none', 'oauth2', 'api_key']),
  baseUrl: z.string().url(),
  iframeUrl: z.string().url().optional(),
  permissions: z.array(z.string()).default([]),
  tools: z.array(AppToolDefinitionSchema),
})

export type AppToolParameter = z.infer<typeof AppToolParameterSchema>
export type AppToolDefinition = z.infer<typeof AppToolDefinitionSchema>
export type AppManifest = z.infer<typeof AppManifestSchema>
