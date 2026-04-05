# Whiteboard Persistence Design

## Goal

Replace the public excalidraw.com iframe with a self-hosted Excalidraw React component that persists drawings per user session in the database. Users see their previous drawings when reopening the whiteboard.

## Architecture

### Client (`apps/whiteboard/client/`)

Vite + React + `@excalidraw/excalidraw` npm package. Builds to `client/dist/` as static files.

Single React component that:
1. Sends `{ type: 'app.ready', appId: 'whiteboard' }` on mount
2. Receives `{ type: 'host.init', appSessionId, state }` — passes `state.elements` and `state.appState` to Excalidraw's `initialData` prop
3. On Excalidraw's `onChange(elements, appState)` — debounces 1 second, then sends `{ type: 'app.state_patch', state: { elements, appState } }` to host
4. Receives `{ type: 'host.state_patch', patch }` — updates Excalidraw scene if needed (e.g., after tool execution)

**Excalidraw config:**
- `UIOptions.canvasActions.export: false` — no export menu (data stays in platform)
- `UIOptions.canvasActions.saveToActiveFile: false` — no external save
- No collaboration features (not imported)
- Theme follows system/host preference

**Debounce:** 1 second after last change. Prevents flooding the server while drawing but ensures state is saved within a reasonable window. On `beforeunload`, flush any pending state immediately.

### Server (`apps/whiteboard/server/`)

Already exists. Changes:
- Add `express.static(path.join(__dirname, '../client/dist'))` to serve built client at `/app`
- No new API endpoints needed — state persistence uses the existing `sync-app-state` chat endpoint via the host bridge

### Manifest Changes

```typescript
{
  id: 'whiteboard',
  name: 'Whiteboard',
  trustTier: 'internal',           // Was 'verified' — now self-hosted, safe
  iframeUrl: '<self-hosted /app>', // Was 'https://excalidraw.com'
  // Rest unchanged
}
```

### Frontend URL Mapping

`useChatMessages.ts` APP_PREFIX_MAP:
```
whiteboard_: VITE_WHITEBOARD_APP_URL || 'http://localhost:3005/app'
```

### State Shape (stored in `app_sessions.state` JSONB)

```json
{
  "elements": [
    { "type": "rectangle", "x": 10, "y": 20, "width": 100, "height": 50, ... },
    { "type": "text", "text": "Hello", "x": 50, "y": 100, ... }
  ],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "zoom": { "value": 1 },
    "scrollX": 0,
    "scrollY": 0,
    "currentItemFontFamily": 1
  }
}
```

Typical size: 10-500 KB. Postgres JSONB handles this easily.

### Data Flow

```
Open whiteboard:
  LLM calls whiteboard_open → tool-router creates/finds session in DB
  → frontend renders iframe at /app → Excalidraw loads
  → app.ready → host.init with saved state → Excalidraw initialData

Drawing:
  User draws → onChange fires → debounce 1s → app.state_patch
  → host receives → sync-app-state endpoint → DB update

Close whiteboard:
  User clicks X → closeApp → /close-app endpoint → session marked completed
  (state already saved from last onChange)

Reopen whiteboard:
  LLM calls whiteboard_open → tool-router finds completed session OR creates new
  → host.init sends saved state → Excalidraw renders previous drawings
```

### Session Reuse

When whiteboard_open is called and a completed whiteboard session exists for this conversation, the tool should reuse that session (reactivate it) instead of creating a fresh one. This preserves drawings across open/close cycles.

Change in `whiteboard_open` tool or `getOrCreateSession`: if a completed whiteboard session exists in the same conversation, set it back to 'active' and return it with its existing state.

### Security

- No data leaves the platform — Excalidraw npm package is a local React component, no external network calls
- State saved via JWT-authenticated endpoints only
- `trustTier: 'internal'` — same sandbox as chess/flashcards
- No Excalidraw cloud/collaboration features included
- `appState` is filtered before sending to LLM via existing `sanitizeStateForLLM`

### Build & Deploy

- `apps/whiteboard/client/` — Vite project with `@excalidraw/excalidraw`, `react`, `react-dom`
- Build: `cd apps/whiteboard/client && npm run build` → outputs to `dist/`
- Dockerfile.whiteboard updated: add build step before server start
- Railway `whiteboard-app` service redeploys with the built client

### Sanitizer Addition

Add whiteboard case to `sanitizeStateForLLM` in `server/src/security/sanitize.ts`:

```typescript
case 'whiteboard': {
  const parts: string[] = []
  if (Array.isArray(clean.elements)) {
    parts.push(`${clean.elements.length} elements on canvas`)
  }
  return parts.length > 0 ? parts.join('. ') : 'Whiteboard is open.'
}
```

### Files to Create/Modify

**Create:**
- `apps/whiteboard/client/index.html` — Vite entry
- `apps/whiteboard/client/src/main.tsx` — React mount
- `apps/whiteboard/client/src/App.tsx` — Excalidraw wrapper + postMessage bridge
- `apps/whiteboard/client/package.json` — deps: react, react-dom, @excalidraw/excalidraw, vite
- `apps/whiteboard/client/vite.config.ts` — basic Vite config
- `apps/whiteboard/client/tsconfig.json`

**Modify:**
- `apps/whiteboard/server/index.ts` — serve static `client/dist` at `/app`
- `apps/whiteboard/server/manifest.ts` — update `iframeUrl`, `trustTier` back to `'internal'`
- `apps/whiteboard/server/tools.ts` — whiteboard_open reactivates completed sessions
- `src/renderer/components/chatbridge/hooks/useChatMessages.ts` — update whiteboard URL
- `server/src/security/sanitize.ts` — add whiteboard sanitizer case
- `server/src/chat/app-context.ts` — add whiteboard to `detectIntentApp`
- `server/src/chat/system-prompt.ts` — mention whiteboard in app list
- `Dockerfile.whiteboard` — add client build step
- `server/tests/security/sanitize.test.ts` — whiteboard sanitizer test

### What Does NOT Change

- `AppIframe.tsx` — already handles arbitrary state shapes
- `useAppPanel.ts` — no whiteboard-specific logic needed
- `tool-router.ts` — already passes trustTier, handles state persistence
- `session.ts` — JSONB state column handles any shape
- `tool-scoping.ts` — already detects whiteboard intent
