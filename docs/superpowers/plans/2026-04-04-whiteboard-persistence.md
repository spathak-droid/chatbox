# Whiteboard Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public excalidraw.com iframe with a self-hosted Excalidraw React component that persists drawings per user session in the database.

**Architecture:** Vite-built React client wrapping the `@excalidraw/excalidraw` npm package, served as static files by the existing whiteboard Express server at `/app`. State syncs to the host via the existing postMessage bridge (`app.state_patch` / `host.init`), which persists to `app_sessions.state` JSONB column. Session reuse ensures drawings survive open/close cycles.

**Tech Stack:** React 18, Vite, `@excalidraw/excalidraw`, TypeScript, Express static serving

---

### Task 1: Scaffold the Vite + React client

**Files:**
- Create: `apps/whiteboard/client/package.json`
- Create: `apps/whiteboard/client/index.html`
- Create: `apps/whiteboard/client/vite.config.ts`
- Create: `apps/whiteboard/client/tsconfig.json`
- Create: `apps/whiteboard/client/src/main.tsx`
- Create: `apps/whiteboard/client/src/App.tsx`

- [ ] **Step 1: Create `apps/whiteboard/client/package.json`**

```json
{
  "name": "chatbridge-whiteboard-client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@excalidraw/excalidraw": "^0.18.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `apps/whiteboard/client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Whiteboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 3: Create `apps/whiteboard/client/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
  },
  define: {
    'process.env.IS_PREACT': 'false',
  },
})
```

The `process.env.IS_PREACT` define is required by the Excalidraw package to avoid build errors.

- [ ] **Step 4: Create `apps/whiteboard/client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create `apps/whiteboard/client/src/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 6: Create `apps/whiteboard/client/src/App.tsx` — initial skeleton**

This is a minimal version that just loads Excalidraw and sends `app.ready`. The full bridge logic is added in Task 2.

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'

function sendToHost(message: Record<string, unknown>) {
  window.parent.postMessage(message, '*')
}

export default function App() {
  const [initialData, setInitialData] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Send app.ready on mount
  useEffect(() => {
    sendToHost({ type: 'app.ready', appId: 'whiteboard' })
  }, [])

  // Listen for host messages
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data
      if (!msg?.type) return

      switch (msg.type) {
        case 'host.init': {
          const state = msg.state || {}
          if (state.elements && state.elements.length > 0) {
            setInitialData({
              elements: state.elements,
              appState: state.appState || {},
            })
          }
          setReady(true)
          break
        }
        case 'host.state_patch': {
          const patch = msg.patch || {}
          if (patch.elements && apiRef.current) {
            apiRef.current.updateScene({
              elements: patch.elements,
            })
          }
          break
        }
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Debounced onChange — sends state patch to host
  const handleChange = useCallback(
    (elements: readonly any[], appState: any) => {
      if (!ready) return
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        // Only send serializable elements (filter out deleted)
        const liveElements = elements.filter((el) => !el.isDeleted)
        sendToHost({
          type: 'app.state_patch',
          state: {
            elements: liveElements,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              zoom: appState.zoom,
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
            },
          },
        })
      }, 1000)
    },
    [ready],
  )

  // Flush pending state on unload
  useEffect(() => {
    const flush = () => {
      if (debounceTimer.current && apiRef.current) {
        clearTimeout(debounceTimer.current)
        const elements = apiRef.current.getSceneElements().filter((el) => !el.isDeleted)
        const appState = apiRef.current.getAppState()
        sendToHost({
          type: 'app.state_patch',
          state: {
            elements,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              zoom: appState.zoom,
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
            },
          },
        })
      }
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
        Loading whiteboard...
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api }}
        initialData={initialData || undefined}
        onChange={handleChange}
        UIOptions={{
          canvasActions: {
            export: false,
            saveToActiveFile: false,
          },
        }}
      />
    </div>
  )
}
```

- [ ] **Step 7: Install dependencies**

Run: `cd apps/whiteboard/client && npm install`
Expected: `node_modules` created, no errors

- [ ] **Step 8: Build and verify**

Run: `cd apps/whiteboard/client && npm run build`
Expected: `dist/` directory created with `index.html`, JS and CSS bundles

- [ ] **Step 9: Commit**

```bash
git add apps/whiteboard/client/
git commit -m "feat: scaffold Excalidraw whiteboard client with Vite + React"
```

---

### Task 2: Serve client from whiteboard server

**Files:**
- Modify: `apps/whiteboard/server/index.ts`

- [ ] **Step 1: Update `apps/whiteboard/server/index.ts` to serve static client**

Replace the full file:

```typescript
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { manifest } from './manifest.js'
import { handleTool } from './tools.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = parseInt(process.env.PORT || '3005', 10)

const app = express()
app.use(cors())
app.use(express.json())

// Serve Excalidraw client
app.use('/app', express.static(path.join(__dirname, '..', 'client', 'dist')))

// Manifest endpoint
app.get('/api/manifest', (_req, res) => {
  res.json(manifest)
})

// Tool execution endpoint
app.post('/api/tools/:toolName', (req, res) => {
  const { toolName } = req.params
  const { args, sessionState } = req.body ?? {}

  try {
    const result = handleTool(toolName, args ?? {}, sessionState ?? null)
    res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

app.listen(PORT, () => {
  console.log(`Whiteboard app listening on http://localhost:${PORT}`)
  console.log(`  Manifest: http://localhost:${PORT}/api/manifest`)
  console.log(`  Iframe:   http://localhost:${PORT}/app`)
})
```

- [ ] **Step 2: Verify locally**

Run: `cd apps/whiteboard && npm run dev`
Then open: `http://localhost:3005/app` in a browser
Expected: Excalidraw canvas loads, "Loading whiteboard..." shows briefly then canvas appears

- [ ] **Step 3: Commit**

```bash
git add apps/whiteboard/server/index.ts
git commit -m "feat: serve Excalidraw client from whiteboard server"
```

---

### Task 3: Update manifest, URL mapping, and trustTier

**Files:**
- Modify: `apps/whiteboard/server/manifest.ts`
- Modify: `src/renderer/components/chatbridge/hooks/useChatMessages.ts:12`

- [ ] **Step 1: Update manifest — iframeUrl and trustTier**

Replace `apps/whiteboard/server/manifest.ts`:

```typescript
const baseUrl = process.env.WHITEBOARD_BASE_URL || 'http://localhost:3005'

export const manifest = {
  id: 'whiteboard',
  name: 'Whiteboard',
  description: 'Open a whiteboard powered by Excalidraw where students can draw, diagram, brainstorm, and sketch visually. Features an infinite canvas with drawing tools, shapes, arrows, text, colors, and more. No login required.',
  category: 'productivity' as const,
  authType: 'none' as const,
  baseUrl,
  trustTier: 'internal' as const,
  iframeUrl: `${baseUrl}/app`,
  permissions: [],
  activationKeywords: ['whiteboard', 'draw', 'diagram', 'sketch', 'brainstorm', 'collab board', 'collaborative board'],
  tools: [
    {
      name: 'whiteboard_open',
      description: 'Open the collaborative whiteboard. Use this when the student wants to draw, sketch, diagram, brainstorm visually, or use a whiteboard. The whiteboard opens in the side panel and the student can interact with it directly.',
      parameters: [],
    },
    {
      name: 'whiteboard_close',
      description: 'Close the whiteboard. Call when the student is done using the whiteboard or wants to switch to a different app.',
      parameters: [],
    },
  ],
}
```

- [ ] **Step 2: Update frontend URL mapping**

In `src/renderer/components/chatbridge/hooks/useChatMessages.ts`, change line 12:

```typescript
  whiteboard_: (import.meta.env.VITE_WHITEBOARD_EMBED_URL as string) || 'http://localhost:3005/app',
```

- [ ] **Step 3: Commit**

```bash
git add apps/whiteboard/server/manifest.ts src/renderer/components/chatbridge/hooks/useChatMessages.ts
git commit -m "feat: point whiteboard iframe to self-hosted Excalidraw client"
```

---

### Task 4: Session reuse — preserve drawings across open/close

**Files:**
- Modify: `server/src/apps/session.ts`
- Test: `server/tests/apps/session.test.ts`

Currently `getOrCreateSession` only finds `active` sessions. When the user closes the whiteboard and reopens it, a NEW empty session is created and old drawings are lost. We need to reactivate completed sessions for apps like whiteboard.

- [ ] **Step 1: Write the failing test**

Add to `server/tests/apps/session.test.ts`:

```typescript
it('reactivates a completed session for the same app', async () => {
  // Create a session, complete it, then call getOrCreateSession again
  const s1 = await getOrCreateSession('whiteboard', testConvId, testUserId)
  await updateSession(s1.id, { elements: [{ id: '1' }] }, 'completed', 'Closed by user')

  const s2 = await getOrCreateSession('whiteboard', testConvId, testUserId)
  expect(s2.id).toBe(s1.id)
  expect(s2.status).toBe('active')
  expect((s2.state as any).elements).toEqual([{ id: '1' }])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/apps/session.test.ts -t "reactivates"`
Expected: FAIL — `s2.id` is a new UUID, not `s1.id`

- [ ] **Step 3: Update `getOrCreateSession` in `server/src/apps/session.ts`**

Replace the function:

```typescript
export async function getOrCreateSession(
  appId: string, conversationId: string, userId: string
): Promise<AppSession> {
  // 1. Return existing active session if one exists
  const existing = await query(
    `SELECT * FROM app_sessions WHERE app_id = $1 AND conversation_id = $2 AND user_id = $3 AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [appId, conversationId, userId]
  )

  if (existing.rows.length > 0) return rowToSession(existing.rows[0])

  // 2. Reactivate the most recent completed session for this app (preserves state like drawings)
  const completed = await query(
    `SELECT * FROM app_sessions WHERE app_id = $1 AND conversation_id = $2 AND user_id = $3 AND status = 'completed'
     ORDER BY updated_at DESC LIMIT 1`,
    [appId, conversationId, userId]
  )

  if (completed.rows.length > 0) {
    await query(
      `UPDATE app_sessions SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [completed.rows[0].id]
    )
    return rowToSession({ ...completed.rows[0], status: 'active' })
  }

  // 3. Auto-close any active sessions for OTHER apps in this conversation
  await query(
    `UPDATE app_sessions SET status = 'completed', summary = COALESCE(summary, 'Ended (switched to another app)'), updated_at = NOW()
     WHERE conversation_id = $1 AND user_id = $2 AND status = 'active' AND app_id != $3`,
    [conversationId, userId, appId]
  )

  // 4. Create fresh session
  const result = await query(
    `INSERT INTO app_sessions (app_id, conversation_id, user_id, state, status)
     VALUES ($1, $2, $3, '{}', 'active') RETURNING *`,
    [appId, conversationId, userId]
  )

  return rowToSession(result.rows[0])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/apps/session.test.ts`
Expected: ALL tests pass, including the new reactivation test

- [ ] **Step 5: Commit**

```bash
git add server/src/apps/session.ts server/tests/apps/session.test.ts
git commit -m "feat: reactivate completed sessions to preserve whiteboard drawings"
```

---

### Task 5: Whiteboard sanitizer and intent detection

**Files:**
- Modify: `server/src/security/sanitize.ts`
- Modify: `server/src/chat/app-context.ts`
- Modify: `server/src/chat/system-prompt.ts:17`
- Test: `server/tests/security/sanitize.test.ts`

- [ ] **Step 1: Write the failing test for whiteboard sanitizer**

Add to `server/tests/security/sanitize.test.ts` inside the `describe('sanitizeStateForLLM', ...)` block:

```typescript
  it('formats whiteboard state with element count', () => {
    const state = {
      elements: [
        { type: 'rectangle', x: 0, y: 0 },
        { type: 'text', text: 'Hello' },
        { type: 'arrow', x: 10, y: 20 },
      ],
      appState: { viewBackgroundColor: '#ffffff' },
    }
    const result = sanitizeStateForLLM('whiteboard', state)
    expect(result).toContain('3 elements on canvas')
    expect(result).not.toContain('rectangle')
    expect(result).not.toContain('#ffffff')
  })

  it('returns default message for empty whiteboard', () => {
    const result = sanitizeStateForLLM('whiteboard', {})
    expect(result).toBe('Whiteboard is open.')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/security/sanitize.test.ts -t "whiteboard"`
Expected: FAIL — falls through to default JSON.stringify case

- [ ] **Step 3: Add whiteboard case to `sanitizeStateForLLM`**

In `server/src/security/sanitize.ts`, add this case before the `default:` case (after the `mario` case):

```typescript
    case 'whiteboard': {
      const parts: string[] = []
      if (Array.isArray(clean.elements)) parts.push(`${clean.elements.length} elements on canvas`)
      return parts.length > 0 ? parts.join('. ') : 'Whiteboard is open.'
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/security/sanitize.test.ts`
Expected: ALL tests pass

- [ ] **Step 5: Add whiteboard to `detectIntentApp`**

In `server/src/chat/app-context.ts`, add this line after the calendar detection (line 16):

```typescript
  if (/whiteboard|draw|sketch|diagram/.test(msg)) return 'whiteboard'
```

- [ ] **Step 6: Update system prompt to mention whiteboard**

In `server/src/chat/system-prompt.ts`, change line 17:

```typescript
  let prompt = `You are TutorMeAI, a friendly tutor for students ages 8-14. You have 5 apps: Chess, Math Practice, Flashcards, Calendar, and Whiteboard.
```

- [ ] **Step 7: Commit**

```bash
git add server/src/security/sanitize.ts server/src/chat/app-context.ts server/src/chat/system-prompt.ts server/tests/security/sanitize.test.ts
git commit -m "feat: add whiteboard sanitizer, intent detection, and system prompt"
```

---

### Task 6: Update Dockerfile and deploy config

**Files:**
- Modify: `Dockerfile.whiteboard`

- [ ] **Step 1: Update `Dockerfile.whiteboard` with client build step**

Replace the full file:

```dockerfile
FROM node:20-alpine AS client-build
WORKDIR /build
COPY apps/whiteboard/client/package.json apps/whiteboard/client/package-lock.json* ./
RUN npm install
COPY apps/whiteboard/client/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY apps/whiteboard/package.json ./
RUN npm install

COPY apps/whiteboard/ ./
COPY --from=client-build /build/dist ./client/dist

EXPOSE 3005
CMD ["npx", "tsx", "server/index.ts"]
```

- [ ] **Step 2: Commit**

```bash
git add Dockerfile.whiteboard
git commit -m "feat: add client build step to whiteboard Dockerfile"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Build the client**

Run: `cd apps/whiteboard/client && npm run build`
Expected: `dist/` created with index.html and JS bundles

- [ ] **Step 2: Start the whiteboard server**

Run: `cd apps/whiteboard && npm run dev`
Expected: Server starts on port 3005, logs `Iframe: http://localhost:3005/app`

- [ ] **Step 3: Open in browser and verify Excalidraw loads**

Open: `http://localhost:3005/app`
Expected: Excalidraw canvas renders with drawing tools. "Loading whiteboard..." appears briefly then the full canvas loads.

- [ ] **Step 4: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All unit tests pass (sanitize, session, app-context, system-prompt)

- [ ] **Step 5: Final commit and push**

```bash
git push origin main
```

Then deploy to Railway:
- Deploy `chatbridge-server` (sanitizer + session changes)
- Deploy `whiteboard-app` (new client + server changes)
