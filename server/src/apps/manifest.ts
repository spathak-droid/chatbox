import { AppManifestSchema, type AppManifest } from '../shared-types/app-manifest.js'

export function validateManifest(data: unknown): AppManifest {
  return AppManifestSchema.parse(data)
}

export function manifestToToolSchemas(manifest: AppManifest) {
  return manifest.tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: `[${manifest.name}] ${tool.description}`,
      parameters: {
        type: 'object' as const,
        properties: Object.fromEntries(
          tool.parameters.map((p) => [
            p.name,
            {
              type: p.type,
              description: p.description,
              ...(p.enum ? { enum: p.enum } : {}),
              // Google's API requires 'items' for array types
              ...(p.type === 'array' ? { items: { type: 'object' as const } } : {}),
            },
          ])
        ),
        required: tool.parameters.filter((p) => p.required).map((p) => p.name),
      },
    },
  }))
}
