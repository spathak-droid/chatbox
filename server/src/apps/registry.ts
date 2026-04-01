import type { AppManifest } from '../shared-types/app-manifest.js'
import { query } from '../db/client.js'
import { validateManifest, manifestToToolSchemas } from './manifest.js'

const appCache = new Map<string, AppManifest>()

export async function registerApp(manifest: AppManifest): Promise<void> {
  const valid = validateManifest(manifest)

  await query(
    `INSERT INTO apps (id, name, description, category, auth_type, ui_mode, base_url, iframe_url, manifest)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description,
       manifest = EXCLUDED.manifest, base_url = EXCLUDED.base_url,
       iframe_url = EXCLUDED.iframe_url`,
    [valid.id, valid.name, valid.description, valid.category, valid.authType,
     'iframe', valid.baseUrl, valid.iframeUrl || null, JSON.stringify(valid)]
  )

  for (const tool of valid.tools) {
    await query(
      `INSERT INTO app_tools (app_id, name, description, input_schema)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (app_id, name) DO UPDATE SET
         description = EXCLUDED.description, input_schema = EXCLUDED.input_schema`,
      [valid.id, tool.name, tool.description, JSON.stringify(tool.parameters)]
    )
  }

  appCache.set(valid.id, valid)
}

export async function getApp(appId: string): Promise<AppManifest | null> {
  if (appCache.has(appId)) return appCache.get(appId)!
  const result = await query('SELECT manifest FROM apps WHERE id = $1 AND enabled = true', [appId])
  if (result.rows.length === 0) return null
  const manifest = result.rows[0].manifest as AppManifest
  appCache.set(appId, manifest)
  return manifest
}

export async function getAllApps(): Promise<AppManifest[]> {
  const result = await query('SELECT manifest FROM apps WHERE enabled = true')
  return result.rows.map((r: { manifest: AppManifest }) => r.manifest)
}

export function findAppByToolName(toolName: string): AppManifest | undefined {
  for (const app of appCache.values()) {
    if (app.tools.some((t) => t.name === toolName)) return app
  }
  return undefined
}

export async function getAllToolSchemas() {
  const apps = await getAllApps()
  return apps.flatMap(manifestToToolSchemas)
}

export async function loadAppsIntoCache() {
  const apps = await getAllApps()
  for (const app of apps) {
    appCache.set(app.id, app)
  }
  console.log(`Loaded ${apps.length} apps into cache`)
}
