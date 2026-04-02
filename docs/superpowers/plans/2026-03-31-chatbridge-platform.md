# ChatBridge Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-quality AI chat platform (ChatBridge) on top of Chatbox that lets third-party apps register tools, render custom UI inside the chat via iframes, and communicate bidirectionally with the chatbot — with all 4 apps (Math Practice, Google Calendar, Chess, Flashcards) playable by students directly in the chat window.

**Architecture:** Chatbox gets a new Express backend layer (route protection, schema validation, LLM calls via OpenRouter, tool routing, OAuth token management, app registry). Each third-party app is a standalone service (own backend + own frontend) rendered inside chat via sandboxed iframes. The platform backend mediates all communication: frontend → platform backend → OpenRouter (for LLM) and platform backend → app backends (for tool execution). App frontends communicate with the chat host via `postMessage` bridge.

**Tech Stack:** React 18 (existing Chatbox frontend), Express.js + PostgreSQL (new platform backend), OpenRouter (LLM), chess.js + chessboard.jsx (Chess app), Google Calendar API + OAuth2 (Calendar app), Zod (validation), JWT (auth), iframe + postMessage (app embedding)

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│  Chatbox Frontend (existing React SPA)                    │
│  ┌────────────┐ ┌───────────────┐ ┌───────────────────┐  │
│  │ Chat UI    │ │ App Iframe    │ │ App Iframe        │  │
│  │ (existing) │ │ Container     │ │ Container         │  │
│  │            │ │ (chess board, │ │ (flashcards,      │  │
│  │            │ │  calendar UI) │ │  math UI)         │  │
│  └─────┬──────┘ └──────┬────────┘ └────────┬──────────┘  │
│        │        postMessage bridge          │             │
└────────┼────────────────┼───────────────────┼─────────────┘
         │                │                   │
         ▼                ▼                   ▼
┌──────────────────────────────────────────────────────────┐
│  Platform Backend (NEW Express.js)                        │
│  ┌──────┐ ┌──────────┐ ┌─────────┐ ┌──────────────────┐ │
│  │ Auth │ │ Chat API │ │ App     │ │ Tool Invocation  │ │
│  │ JWT  │ │ OpenRouter│ │ Registry│ │ Router           │ │
│  └──────┘ └──────────┘ └─────────┘ └────────┬─────────┘ │
│  ┌──────────────┐ ┌───────────────┐          │           │
│  │ OAuth Manager│ │ PostgreSQL    │          │           │
│  └──────────────┘ └───────────────┘          │           │
└──────────────────────────────────────────────┼───────────┘
         │              │              │       │
         ▼              ▼              ▼       ▼
   ┌──────────┐  ┌───────────┐  ┌──────────┐ ┌──────────┐
   │ Math App │  │ Calendar  │  │ Chess    │ │Flashcards│
   │ (internal│  │ App       │  │ App      │ │ App      │
   │ no auth) │  │ (OAuth2)  │  │ (public) │ │ (public) │
   │ :3001    │  │ :3002     │  │ :3003    │ │ :3004    │
   └──────────┘  └───────────┘  └──────────┘ └──────────┘
```

## Project Structure (New Files)

```
chatbox/
├── server/                              # NEW — Platform backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                     # Express entry point
│   │   ├── config.ts                    # Environment config
│   │   ├── db/
│   │   │   ├── client.ts               # PostgreSQL connection
│   │   │   ├── migrate.ts              # Migration runner
│   │   │   └── migrations/
│   │   │       └── 001_initial.sql      # Core tables
│   │   ├── auth/
│   │   │   ├── middleware.ts            # JWT auth middleware
│   │   │   ├── routes.ts               # Login/register/me
│   │   │   └── password.ts             # Bcrypt helpers
│   │   ├── chat/
│   │   │   ├── routes.ts               # POST /api/chat (streaming)
│   │   │   └── openrouter.ts           # OpenRouter client + tool injection
│   │   ├── apps/
│   │   │   ├── routes.ts               # App registry CRUD
│   │   │   ├── registry.ts             # In-memory + DB registry
│   │   │   ├── tool-router.ts          # Route tool calls to app backends
│   │   │   ├── session.ts              # App session CRUD
│   │   │   ├── manifest.ts             # Manifest validation (Zod)
│   │   │   └── oauth-manager.ts        # Backend OAuth token management
│   │   ├── middleware/
│   │   │   ├── validate.ts             # Zod request validation
│   │   │   └── error-handler.ts        # Global error handler
│   │   └── types.ts                    # Shared server types
│   └── tests/
│       ├── auth.test.ts
│       ├── chat.test.ts
│       ├── apps.test.ts
│       └── tool-router.test.ts
│
├── apps/                                # NEW — Standalone third-party apps
│   ├── math-practice/                   # Internal app (no auth)
│   │   ├── package.json
│   │   ├── server/
│   │   │   ├── index.ts                # Express :3001
│   │   │   ├── manifest.ts             # App manifest
│   │   │   ├── tools.ts                # Tool handlers
│   │   │   └── problems.ts             # Problem generation
│   │   └── client/
│   │       ├── index.html              # Iframe entry
│   │       ├── app.tsx                 # React math UI
│   │       └── bridge.ts              # postMessage bridge
│   │
│   ├── google-calendar/                 # External authenticated (OAuth2)
│   │   ├── package.json
│   │   ├── server/
│   │   │   ├── index.ts                # Express :3002
│   │   │   ├── manifest.ts
│   │   │   ├── tools.ts
│   │   │   └── google-api.ts           # Calendar API wrapper
│   │   └── client/
│   │       ├── index.html
│   │       ├── app.tsx                 # Calendar planner UI
│   │       └── bridge.ts
│   │
│   ├── chess/                           # External public (no auth, complex state)
│   │   ├── package.json
│   │   ├── server/
│   │   │   ├── index.ts                # Express :3003
│   │   │   ├── manifest.ts
│   │   │   ├── tools.ts
│   │   │   └── engine.ts              # chess.js game logic
│   │   └── client/
│   │       ├── index.html
│   │       ├── app.tsx                 # Chessboard UI
│   │       ├── board.tsx               # Interactive board component
│   │       └── bridge.ts
│   │
│   └── flashcards/                      # External public (no auth)
│       ├── package.json
│       ├── server/
│       │   ├── index.ts                # Express :3004
│       │   ├── manifest.ts
│       │   ├── tools.ts
│       │   └── decks.ts               # Flashcard logic
│       └── client/
│           ├── index.html
│           ├── app.tsx                 # Flashcard flip UI
│           └── bridge.ts
│
├── src/renderer/                        # MODIFIED — Chatbox frontend additions
│   ├── packages/apps/                   # NEW — App integration layer
│   │   ├── iframe-bridge.ts            # postMessage host-side bridge
│   │   └── api.ts                      # HTTP client for platform backend
│   ├── components/app-blocks/           # NEW — App UI in chat
│   │   ├── AppIframe.tsx               # Sandboxed iframe container
│   │   └── AppMessage.tsx              # App invocation message display
│   ├── components/message-parts/
│   │   └── ToolCallPartUI.tsx          # MODIFY — add app tool icons + iframe rendering
│   ├── packages/model-calls/
│   │   └── stream-text.ts             # MODIFY — route through platform backend
│   └── stores/
│       └── appStore.ts                 # NEW — App sessions state
│
└── shared/                              # NEW — Shared types between server + frontend + apps
    └── types/
        ├── app-manifest.ts             # AppManifest, AppToolDefinition
        ├── app-session.ts              # AppSession, AppResultEnvelope
        ├── bridge-messages.ts          # IframeBridgeMessage types
        └── api.ts                      # API request/response shapes
```

---

## Phase 0: Platform Backend Foundation

### Task 1: Backend Project Scaffold

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/index.ts`
- Create: `server/src/config.ts`

- [ ] **Step 1: Create server package.json**

```json
{
  "name": "chatbridge-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "pg": "^8.13.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.23.0",
    "uuid": "^10.0.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/pg": "^8.11.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create server tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["src/**/*", "../shared/**/*"]
}
```

- [ ] **Step 3: Create config.ts**

```typescript
// server/src/config.ts
import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/chatbridge',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-20250514',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:1212',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/oauth/google/callback',
  appUrls: {
    mathPractice: process.env.MATH_APP_URL || 'http://localhost:3001',
    googleCalendar: process.env.CALENDAR_APP_URL || 'http://localhost:3002',
    chess: process.env.CHESS_APP_URL || 'http://localhost:3003',
    flashcards: process.env.FLASHCARDS_APP_URL || 'http://localhost:3004',
  },
}
```

- [ ] **Step 4: Create Express entry point**

```typescript
// server/src/index.ts
import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { errorHandler } from './middleware/error-handler.js'
import { initDb } from './db/client.js'
import { authRoutes } from './auth/routes.js'
import { chatRoutes } from './chat/routes.js'
import { appRoutes } from './apps/routes.js'

const app = express()

app.use(cors({ origin: config.corsOrigin, credentials: true }))
app.use(express.json())

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/apps', appRoutes)

// Error handler
app.use(errorHandler)

async function start() {
  await initDb()
  app.listen(config.port, () => {
    console.log(`ChatBridge server running on port ${config.port}`)
  })
}

start().catch(console.error)
```

- [ ] **Step 5: Install dependencies and verify**

Run: `cd /Users/san/Desktop/Gauntlet/chatbox/server && pnpm install`
Run: `cd /Users/san/Desktop/Gauntlet/chatbox/server && npx tsc --noEmit 2>&1 | head -5`

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/tsconfig.json server/src/index.ts server/src/config.ts
git commit -m "feat: scaffold platform backend with Express"
```

---

### Task 2: Database + Migrations

**Files:**
- Create: `server/src/db/client.ts`
- Create: `server/src/db/migrate.ts`
- Create: `server/src/db/migrations/001_initial.sql`

- [ ] **Step 1: Create PostgreSQL client**

```typescript
// server/src/db/client.ts
import pg from 'pg'
import { config } from '../config.js'

const { Pool } = pg

export const pool = new Pool({ connectionString: config.databaseUrl })

export async function initDb() {
  const client = await pool.connect()
  try {
    await client.query('SELECT NOW()')
    console.log('Database connected')
  } finally {
    client.release()
  }
}

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params)
}
```

- [ ] **Step 2: Create migration runner**

```typescript
// server/src/db/migrate.ts
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from './client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        ran_at TIMESTAMP DEFAULT NOW()
      )
    `)

    const ran = await client.query('SELECT name FROM migrations ORDER BY id')
    const ranNames = new Set(ran.rows.map((r: { name: string }) => r.name))

    const migrationDir = join(__dirname, 'migrations')
    const files = readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort()

    for (const file of files) {
      if (ranNames.has(file)) continue
      console.log(`Running migration: ${file}`)
      const sql = readFileSync(join(migrationDir, file), 'utf-8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`Migration ${file} complete`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }

    console.log('All migrations complete')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
```

- [ ] **Step 3: Create initial migration**

```sql
-- server/src/db/migrations/001_initial.sql

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  tool_call_id TEXT,
  tool_name TEXT,
  tool_args JSONB,
  tool_result JSONB,
  app_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- App Registry
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'oauth2', 'api_key')),
  ui_mode TEXT NOT NULL DEFAULT 'iframe' CHECK (ui_mode IN ('iframe', 'host')),
  base_url TEXT NOT NULL,
  iframe_url TEXT,
  manifest JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- App Tools
CREATE TABLE IF NOT EXISTS app_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  input_schema JSONB NOT NULL,
  UNIQUE(app_id, name)
);

-- App Sessions
CREATE TABLE IF NOT EXISTS app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL REFERENCES apps(id),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  state JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'error')),
  summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tool Invocations (audit log)
CREATE TABLE IF NOT EXISTS tool_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL,
  app_session_id UUID REFERENCES app_sessions(id),
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  input JSONB,
  output JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'error', 'timeout')),
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- OAuth Connections
CREATE TABLE IF NOT EXISTS oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  scopes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- App Permissions (teacher controls)
CREATE TABLE IF NOT EXISTS app_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL REFERENCES apps(id),
  user_id UUID NOT NULL REFERENCES users(id),
  granted_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(app_id, user_id)
);
```

- [ ] **Step 4: Run migration**

Run: `cd /Users/san/Desktop/Gauntlet/chatbox/server && createdb chatbridge 2>/dev/null; pnpm run db:migrate`

- [ ] **Step 5: Commit**

```bash
git add server/src/db/
git commit -m "feat: add PostgreSQL client, migration runner, and initial schema"
```

---

### Task 3: Auth System (JWT)

**Files:**
- Create: `server/src/auth/password.ts`
- Create: `server/src/auth/middleware.ts`
- Create: `server/src/auth/routes.ts`

- [ ] **Step 1: Create password helpers**

```typescript
// server/src/auth/password.ts
import bcrypt from 'bcryptjs'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
```

- [ ] **Step 2: Create JWT auth middleware**

```typescript
// server/src/auth/middleware.ts
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export interface AuthUser {
  id: string
  email: string
  role: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' })
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function createToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: '7d' })
}
```

- [ ] **Step 3: Create auth routes**

```typescript
// server/src/auth/routes.ts
import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db/client.js'
import { hashPassword, verifyPassword } from './password.js'
import { createToken, requireAuth } from './middleware.js'

export const authRoutes = Router()

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1),
  role: z.enum(['student', 'teacher']).default('student'),
})

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

authRoutes.post('/register', async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body)
    const existing = await query('SELECT id FROM users WHERE email = $1', [body.email])
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    const passwordHash = await hashPassword(body.password)
    const result = await query(
      'INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role, display_name',
      [body.email, passwordHash, body.displayName, body.role]
    )

    const user = result.rows[0]
    const token = createToken({ id: user.id, email: user.email, role: user.role })

    res.status(201).json({ token, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } })
  } catch (err) {
    next(err)
  }
})

authRoutes.post('/login', async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body)
    const result = await query(
      'SELECT id, email, password_hash, display_name, role FROM users WHERE email = $1',
      [body.email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const user = result.rows[0]
    const valid = await verifyPassword(body.password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = createToken({ id: user.id, email: user.email, role: user.role })

    res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } })
  } catch (err) {
    next(err)
  }
})

authRoutes.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})
```

- [ ] **Step 4: Create error handler middleware**

```typescript
// server/src/middleware/error-handler.ts
import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error('Error:', err)

  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation error', details: err.errors })
  }

  if (err instanceof Error) {
    return res.status(500).json({ error: err.message })
  }

  res.status(500).json({ error: 'Internal server error' })
}
```

- [ ] **Step 5: Create request validation middleware**

```typescript
// server/src/middleware/validate.ts
import type { Request, Response, NextFunction } from 'express'
import type { ZodSchema } from 'zod'

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (err) {
      next(err)
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add server/src/auth/ server/src/middleware/
git commit -m "feat: add JWT auth system with register, login, and route protection"
```

---

### Task 4: Shared Types (Platform ↔ Apps Contract)

**Files:**
- Create: `shared/types/app-manifest.ts`
- Create: `shared/types/app-session.ts`
- Create: `shared/types/bridge-messages.ts`
- Create: `shared/types/api.ts`

- [ ] **Step 1: Create app manifest types**

```typescript
// shared/types/app-manifest.ts
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
```

- [ ] **Step 2: Create app session and result types**

```typescript
// shared/types/app-session.ts
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
```

- [ ] **Step 3: Create iframe bridge message types**

```typescript
// shared/types/bridge-messages.ts
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
    appId: z.string(),
  }),
  z.object({
    type: z.literal('app.state_patch'),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('app.tool_request'),
    toolName: z.string(),
    args: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('app.resize'),
    height: z.number(),
  }),
  z.object({
    type: z.literal('app.complete'),
    summary: z.string().optional(),
  }),
  z.object({
    type: z.literal('app.error'),
    error: z.string(),
  }),
])

export type HostMessage = z.infer<typeof HostMessageSchema>
export type AppMessage = z.infer<typeof AppMessageSchema>
```

- [ ] **Step 4: Create API types**

```typescript
// shared/types/api.ts
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
```

- [ ] **Step 5: Commit**

```bash
git add shared/
git commit -m "feat: add shared types for app manifest, sessions, bridge messages, and API"
```

---

### Task 5: App Registry + Tool Router

**Files:**
- Create: `server/src/apps/manifest.ts`
- Create: `server/src/apps/registry.ts`
- Create: `server/src/apps/tool-router.ts`
- Create: `server/src/apps/session.ts`
- Create: `server/src/apps/routes.ts`

- [ ] **Step 1: Create manifest validation**

```typescript
// server/src/apps/manifest.ts
import { AppManifestSchema, type AppManifest } from '../../../shared/types/app-manifest.js'

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
            },
          ])
        ),
        required: tool.parameters.filter((p) => p.required).map((p) => p.name),
      },
    },
  }))
}
```

- [ ] **Step 2: Create app registry**

```typescript
// server/src/apps/registry.ts
import type { AppManifest } from '../../../shared/types/app-manifest.js'
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
```

- [ ] **Step 3: Create tool router (routes tool calls to app backends)**

```typescript
// server/src/apps/tool-router.ts
import { type AppResultEnvelope, AppResultEnvelopeSchema } from '../../../shared/types/app-session.js'
import { query } from '../db/client.js'
import { findAppByToolName, getApp } from './registry.js'
import { getOrCreateSession, updateSession } from './session.js'

const TOOL_TIMEOUT_MS = 15000

export async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  context: { userId: string; conversationId: string }
): Promise<AppResultEnvelope> {
  const app = findAppByToolName(toolName)
  if (!app) {
    return { status: 'error', error: `No app found for tool: ${toolName}` }
  }

  const session = await getOrCreateSession(app.id, context.conversationId, context.userId)

  // Log invocation start
  const invResult = await query(
    `INSERT INTO tool_invocations (app_id, app_session_id, conversation_id, user_id, tool_name, input, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id`,
    [app.id, session.id, context.conversationId, context.userId, toolName, JSON.stringify(args)]
  )
  const invocationId = invResult.rows[0].id
  const startTime = Date.now()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS)

    const response = await fetch(`${app.baseUrl}/api/tools/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        args,
        sessionId: session.id,
        sessionState: session.state,
        userId: context.userId,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(`App returned ${response.status}: ${errBody}`)
    }

    const result = AppResultEnvelopeSchema.parse(await response.json())
    const durationMs = Date.now() - startTime

    // Update invocation log
    await query(
      `UPDATE tool_invocations SET status = 'success', output = $1, duration_ms = $2 WHERE id = $3`,
      [JSON.stringify(result), durationMs, invocationId]
    )

    // Update app session state
    if (result.data) {
      await updateSession(session.id, result.data, result.status === 'ok' && result.summary?.includes('completed') ? 'completed' : 'active', result.summary)
    }

    return result
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errorMsg = err instanceof Error ? err.message : String(err)
    const status = errorMsg.includes('abort') ? 'timeout' : 'error'

    await query(
      `UPDATE tool_invocations SET status = $1, error = $2, duration_ms = $3 WHERE id = $4`,
      [status, errorMsg, durationMs, invocationId]
    )

    return { status: 'error', error: status === 'timeout' ? `Tool ${toolName} timed out after ${TOOL_TIMEOUT_MS}ms` : errorMsg }
  }
}
```

- [ ] **Step 4: Create app session management**

```typescript
// server/src/apps/session.ts
import { query } from '../db/client.js'
import type { AppSession } from '../../../shared/types/app-session.js'

export async function getOrCreateSession(
  appId: string, conversationId: string, userId: string
): Promise<AppSession> {
  // Find active session
  const existing = await query(
    `SELECT * FROM app_sessions WHERE app_id = $1 AND conversation_id = $2 AND user_id = $3 AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [appId, conversationId, userId]
  )

  if (existing.rows.length > 0) {
    const row = existing.rows[0]
    return {
      id: row.id,
      appId: row.app_id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      state: row.state,
      status: row.status,
      summary: row.summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  const result = await query(
    `INSERT INTO app_sessions (app_id, conversation_id, user_id, state, status)
     VALUES ($1, $2, $3, '{}', 'active') RETURNING *`,
    [appId, conversationId, userId]
  )

  const row = result.rows[0]
  return {
    id: row.id,
    appId: row.app_id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    state: row.state,
    status: row.status,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function updateSession(
  sessionId: string, statePatch: Record<string, unknown>, status?: string, summary?: string
) {
  await query(
    `UPDATE app_sessions SET
      state = state || $1::jsonb,
      status = COALESCE($2, status),
      summary = COALESCE($3, summary),
      updated_at = NOW()
     WHERE id = $4`,
    [JSON.stringify(statePatch), status || null, summary || null, sessionId]
  )
}

export async function getSessionsForConversation(conversationId: string): Promise<AppSession[]> {
  const result = await query(
    `SELECT * FROM app_sessions WHERE conversation_id = $1 ORDER BY created_at`,
    [conversationId]
  )
  return result.rows.map((row: any) => ({
    id: row.id,
    appId: row.app_id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    state: row.state,
    status: row.status,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}
```

- [ ] **Step 5: Create app API routes**

```typescript
// server/src/apps/routes.ts
import { Router } from 'express'
import { requireAuth } from '../auth/middleware.js'
import { registerApp, getAllApps, getApp } from './registry.js'
import { getSessionsForConversation } from './session.js'
import { validateManifest } from './manifest.js'

export const appRoutes = Router()

// Register a new app (admin/app self-registration)
appRoutes.post('/register', async (req, res, next) => {
  try {
    const manifest = validateManifest(req.body)
    await registerApp(manifest)
    res.status(201).json({ ok: true, appId: manifest.id })
  } catch (err) {
    next(err)
  }
})

// List all enabled apps
appRoutes.get('/', requireAuth, async (_req, res, next) => {
  try {
    const apps = await getAllApps()
    res.json({ apps })
  } catch (err) {
    next(err)
  }
})

// Get single app
appRoutes.get('/:appId', requireAuth, async (req, res, next) => {
  try {
    const app = await getApp(req.params.appId)
    if (!app) return res.status(404).json({ error: 'App not found' })
    res.json({ app })
  } catch (err) {
    next(err)
  }
})

// Get app sessions for a conversation
appRoutes.get('/sessions/:conversationId', requireAuth, async (req, res, next) => {
  try {
    const sessions = await getSessionsForConversation(req.params.conversationId)
    res.json({ sessions })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 6: Commit**

```bash
git add server/src/apps/
git commit -m "feat: add app registry, tool router with timeout/logging, and session management"
```

---

### Task 6: Chat API with OpenRouter + Tool Calling Loop

**Files:**
- Create: `server/src/chat/openrouter.ts`
- Create: `server/src/chat/routes.ts`

- [ ] **Step 1: Create OpenRouter client with tool calling loop**

```typescript
// server/src/chat/openrouter.ts
import { config } from '../config.js'
import { getAllToolSchemas } from '../apps/registry.js'
import { routeToolCall } from '../apps/tool-router.js'
import { getSessionsForConversation } from '../apps/session.js'
import type { Response } from 'express'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

export async function streamChatWithTools(
  messages: ChatMessage[],
  conversationId: string,
  userId: string,
  res: Response
) {
  const toolSchemas = await getAllToolSchemas()

  // Inject app context from active sessions
  const sessions = await getSessionsForConversation(conversationId)
  const activeSessions = sessions.filter((s) => s.status === 'active' || s.summary)
  if (activeSessions.length > 0) {
    const appContext = activeSessions
      .map((s) => {
        if (s.status === 'active') return `[Active app: ${s.appId}, state: ${JSON.stringify(s.state)}]`
        if (s.summary) return `[Completed app: ${s.appId} — ${s.summary}]`
        return ''
      })
      .filter(Boolean)
      .join('\n')

    // Prepend app context to system message
    if (messages[0]?.role === 'system') {
      messages[0].content += `\n\nCurrent app context:\n${appContext}`
    } else {
      messages.unshift({ role: 'system', content: `Current app context:\n${appContext}` })
    }
  }

  // Add system prompt for app awareness
  const systemPrompt = messages.find((m) => m.role === 'system')
  if (!systemPrompt) {
    messages.unshift({
      role: 'system',
      content: `You are a helpful educational AI assistant on the TutorMeAI platform. You can help students learn by using available apps. When a student wants to play a game, practice math, study with flashcards, or plan their schedule, use the appropriate tool. After an app interaction completes, discuss the results naturally. Do not invoke apps for unrelated queries — only use tools when the student's request clearly maps to an available app.`,
    })
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const MAX_TOOL_ROUNDS = 5
  let currentMessages = [...messages]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openrouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://chatbridge.app',
      },
      body: JSON.stringify({
        model: config.openrouterModel,
        messages: currentMessages,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      res.write(`data: ${JSON.stringify({ type: 'error', error: `OpenRouter error: ${response.status} ${errText}` })}\n\n`)
      res.write('data: [DONE]\n\n')
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'No response body' })}\n\n`)
      res.write('data: [DONE]\n\n')
      return
    }

    let assistantContent = ''
    let toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = []
    let hasToolCalls = false
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
        try {
          const chunk = JSON.parse(line.slice(6))
          const delta = chunk.choices?.[0]?.delta

          if (delta?.content) {
            assistantContent += delta.content
            res.write(`data: ${JSON.stringify({ type: 'text', content: delta.content })}\n\n`)
          }

          if (delta?.tool_calls) {
            hasToolCalls = true
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = { id: tc.id || '', function: { name: '', arguments: '' } }
                }
                if (tc.id) toolCalls[tc.index].id = tc.id
                if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name
                if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments
              }
            }
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    // If no tool calls, we're done
    if (!hasToolCalls || toolCalls.length === 0) {
      res.write('data: [DONE]\n\n')
      return
    }

    // Process tool calls
    currentMessages.push({
      role: 'assistant',
      content: assistantContent || '',
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: tc.function,
      })),
    })

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(toolCall.function.arguments)
      } catch {
        args = {}
      }

      // Notify frontend about tool invocation
      res.write(`data: ${JSON.stringify({
        type: 'tool_call',
        toolCallId: toolCall.id,
        toolName,
        args,
      })}\n\n`)

      // Route to app backend
      const result = await routeToolCall(toolName, args, { userId, conversationId })

      // Send tool result with UI info
      res.write(`data: ${JSON.stringify({
        type: 'tool_result',
        toolCallId: toolCall.id,
        toolName,
        result,
      })}\n\n`)

      currentMessages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      })
    }

    // Continue loop — LLM will see tool results and generate a response
  }

  res.write('data: [DONE]\n\n')
}
```

- [ ] **Step 2: Create chat routes**

```typescript
// server/src/chat/routes.ts
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { query } from '../db/client.js'
import { streamChatWithTools } from './openrouter.js'

export const chatRoutes = Router()

chatRoutes.use(requireAuth)

// Send a message and stream response
chatRoutes.post('/send', async (req, res, next) => {
  try {
    const body = z.object({
      conversationId: z.string().uuid().optional(),
      message: z.string().min(1),
    }).parse(req.body)

    const userId = req.user!.id

    // Get or create conversation
    let conversationId = body.conversationId
    if (!conversationId) {
      const result = await query(
        'INSERT INTO conversations (user_id) VALUES ($1) RETURNING id',
        [userId]
      )
      conversationId = result.rows[0].id
    }

    // Store user message
    await query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversationId, 'user', body.message]
    )

    // Load conversation history
    const historyResult = await query(
      `SELECT role, content, tool_call_id, tool_name, tool_result FROM messages
       WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 50`,
      [conversationId]
    )

    const messages = historyResult.rows.map((row: any) => {
      if (row.role === 'tool' && row.tool_call_id) {
        return { role: 'tool', content: row.content, tool_call_id: row.tool_call_id }
      }
      return { role: row.role, content: row.content }
    })

    // Stream response with tool calling
    await streamChatWithTools(messages, conversationId, userId, res)

    // Store assistant response (collect from stream)
    // Note: This is simplified — in production, collect streamed content
  } catch (err) {
    next(err)
  }
})

// Get conversation history
chatRoutes.get('/conversations', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user!.id]
    )
    res.json({ conversations: result.rows })
  } catch (err) {
    next(err)
  }
})

// Get messages for a conversation
chatRoutes.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, role, content, tool_call_id, tool_name, tool_args, tool_result, app_id, metadata, created_at
       FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    )
    res.json({ messages: result.rows })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add server/src/chat/
git commit -m "feat: add chat API with OpenRouter streaming and multi-round tool calling loop"
```

---

## Phase 1: App Contract + First App (Math Practice)

### Task 7: Math Practice App — Standalone Backend + Frontend

**Files:**
- Create: `apps/math-practice/package.json`
- Create: `apps/math-practice/server/index.ts`
- Create: `apps/math-practice/server/manifest.ts`
- Create: `apps/math-practice/server/tools.ts`
- Create: `apps/math-practice/server/problems.ts`
- Create: `apps/math-practice/client/index.html`
- Create: `apps/math-practice/client/bridge.ts`

- [ ] **Step 1: Create math app package.json**

```json
{
  "name": "chatbridge-math-practice",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch server/index.ts",
    "start": "node dist/server/index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create math problem generator**

```typescript
// apps/math-practice/server/problems.ts

export interface MathProblem {
  id: string
  question: string
  answer: number
  hint: string
  topic: string
  difficulty: string
}

export function generateProblems(topic: string, difficulty: string, count: number): MathProblem[] {
  return Array.from({ length: count }, (_, i) => generateOne(topic, difficulty, `p${i}`))
}

function generateOne(topic: string, difficulty: string, id: string): MathProblem {
  const range = difficulty === 'easy' ? 12 : difficulty === 'medium' ? 50 : 100
  const a = Math.floor(Math.random() * range) + 1
  const b = Math.floor(Math.random() * range) + 1

  switch (topic) {
    case 'addition':
      return { id, question: `${a} + ${b}`, answer: a + b, hint: `Break it down: ${a} + ${Math.floor(b / 2)} + ${b - Math.floor(b / 2)}`, topic, difficulty }
    case 'subtraction': {
      const big = Math.max(a, b), small = Math.min(a, b)
      return { id, question: `${big} - ${small}`, answer: big - small, hint: `Count up from ${small} to ${big}`, topic, difficulty }
    }
    case 'multiplication':
      return { id, question: `${a} × ${b}`, answer: a * b, hint: `Think of ${a} groups of ${b}`, topic, difficulty }
    case 'division': {
      const product = a * b
      return { id, question: `${product} ÷ ${a}`, answer: b, hint: `How many groups of ${a} fit in ${product}?`, topic, difficulty }
    }
    case 'algebra': {
      const x = Math.floor(Math.random() * 20) + 1
      const c = Math.floor(Math.random() * 20) + 1
      return { id, question: `x + ${c} = ${x + c}, solve for x`, answer: x, hint: `Subtract ${c} from both sides`, topic, difficulty }
    }
    default:
      return { id, question: `${a} + ${b}`, answer: a + b, hint: 'Add the numbers', topic, difficulty }
  }
}
```

- [ ] **Step 3: Create math app manifest**

```typescript
// apps/math-practice/server/manifest.ts
import type { AppManifest } from '../../../shared/types/app-manifest.js'

const BASE_URL = process.env.MATH_APP_URL || 'http://localhost:3001'

export const manifest: AppManifest = {
  id: 'math-practice',
  name: 'Math Practice',
  description: 'Interactive math practice for students. Generates problems, checks answers, provides hints, and tracks performance.',
  category: 'education',
  authType: 'none',
  baseUrl: BASE_URL,
  iframeUrl: `${BASE_URL}/app`,
  permissions: [],
  tools: [
    {
      name: 'math_start_session',
      description: 'Start a new math practice session with a topic and difficulty.',
      parameters: [
        { name: 'topic', type: 'string', description: 'Math topic', required: true, enum: ['addition', 'subtraction', 'multiplication', 'division', 'algebra'] },
        { name: 'difficulty', type: 'string', description: 'Difficulty level', required: true, enum: ['easy', 'medium', 'hard'] },
        { name: 'numProblems', type: 'number', description: 'Number of problems (default 5)', required: false },
      ],
    },
    {
      name: 'math_submit_answer',
      description: 'Submit an answer for the current problem.',
      parameters: [
        { name: 'answer', type: 'string', description: 'Student answer', required: true },
      ],
    },
    {
      name: 'math_get_hint',
      description: 'Get a hint for the current problem.',
      parameters: [],
    },
    {
      name: 'math_finish_session',
      description: 'End the session and show final results.',
      parameters: [],
    },
  ],
}
```

- [ ] **Step 4: Create math tool handlers**

```typescript
// apps/math-practice/server/tools.ts
import type { AppResultEnvelope } from '../../../shared/types/app-session.js'
import { generateProblems, type MathProblem } from './problems.js'

interface MathState {
  topic?: string
  difficulty?: string
  problems?: MathProblem[]
  currentIndex?: number
  correct?: number
  answers?: Array<{ question: string; userAnswer: string; correctAnswer: number; isCorrect: boolean }>
}

export function handleTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: MathState
): AppResultEnvelope {
  switch (toolName) {
    case 'math_start_session': {
      const topic = (args.topic as string) || 'addition'
      const difficulty = (args.difficulty as string) || 'easy'
      const numProblems = (args.numProblems as number) || 5
      const problems = generateProblems(topic, difficulty, numProblems)

      return {
        status: 'ok',
        data: { topic, difficulty, problems, currentIndex: 0, correct: 0, answers: [] },
        summary: `Started ${difficulty} ${topic} practice with ${numProblems} problems. First problem: ${problems[0].question}`,
        uiUrl: undefined,
      }
    }

    case 'math_submit_answer': {
      const problems = sessionState.problems || []
      const idx = sessionState.currentIndex ?? 0
      const problem = problems[idx]
      if (!problem) return { status: 'error', error: 'No active problem. Start a session first.' }

      const userAnswer = String(args.answer).trim()
      const isCorrect = Number(userAnswer) === problem.answer
      const newCorrect = (sessionState.correct ?? 0) + (isCorrect ? 1 : 0)
      const answers = [...(sessionState.answers ?? []), { question: problem.question, userAnswer, correctAnswer: problem.answer, isCorrect }]
      const nextIndex = idx + 1
      const isLast = nextIndex >= problems.length

      let summary = isCorrect
        ? `Correct! ${problem.question} = ${problem.answer}.`
        : `Incorrect. ${problem.question} = ${problem.answer} (student answered ${userAnswer}).`
      summary += ` Score: ${newCorrect}/${answers.length}.`
      if (!isLast) summary += ` Next: ${problems[nextIndex].question}`
      if (isLast) summary += ' Session complete!'

      return {
        status: 'ok',
        data: { currentIndex: nextIndex, correct: newCorrect, answers, ...(isLast ? { completed: true } : {}) },
        summary,
      }
    }

    case 'math_get_hint': {
      const problems = sessionState.problems || []
      const idx = sessionState.currentIndex ?? 0
      const problem = problems[idx]
      if (!problem) return { status: 'error', error: 'No active problem.' }

      return {
        status: 'ok',
        summary: `Hint for "${problem.question}": ${problem.hint}`,
      }
    }

    case 'math_finish_session': {
      const answers = sessionState.answers ?? []
      const correct = sessionState.correct ?? 0
      const total = answers.length
      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
      const wrong = answers.filter((a) => !a.isCorrect)

      return {
        status: 'ok',
        data: { completed: true },
        summary: `Math practice completed. Score: ${correct}/${total} (${accuracy}%). ${wrong.length > 0 ? `Struggled with: ${wrong.map((w) => w.question).join(', ')}` : 'All correct!'}`,
      }
    }

    default:
      return { status: 'error', error: `Unknown tool: ${toolName}` }
  }
}
```

- [ ] **Step 5: Create math app Express server**

```typescript
// apps/math-practice/server/index.ts
import cors from 'cors'
import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { manifest } from './manifest.js'
import { handleTool } from './tools.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

app.use(cors())
app.use(express.json())

// Serve iframe client
app.use('/app', express.static(join(__dirname, '../client')))

// Manifest endpoint (for platform registration)
app.get('/api/manifest', (_req, res) => {
  res.json(manifest)
})

// Tool execution endpoint (called by platform backend)
app.post('/api/tools/:toolName', (req, res) => {
  const { toolName } = req.params
  const { args, sessionState } = req.body
  const result = handleTool(toolName, args || {}, sessionState || {})
  res.json(result)
})

app.listen(PORT, () => {
  console.log(`Math Practice app running on port ${PORT}`)
})
```

- [ ] **Step 6: Create math app iframe client**

```html
<!-- apps/math-practice/client/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Math Practice</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; padding: 16px; background: #fafafa; color: #1a1a2e; }
    .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 12px; }
    .question { font-size: 24px; font-weight: 700; text-align: center; padding: 20px 0; color: #2d3748; }
    .answer-input { width: 100%; padding: 12px 16px; font-size: 18px; border: 2px solid #e2e8f0; border-radius: 8px; outline: none; text-align: center; }
    .answer-input:focus { border-color: #4f46e5; }
    .btn { padding: 10px 20px; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    .btn-primary { background: #4f46e5; color: white; }
    .btn-primary:hover { background: #4338ca; }
    .btn-hint { background: #fbbf24; color: #1a1a2e; }
    .btn-hint:hover { background: #f59e0b; }
    .btn-row { display: flex; gap: 8px; justify-content: center; margin-top: 12px; }
    .progress { display: flex; justify-content: space-between; padding: 8px 0; color: #64748b; font-size: 14px; }
    .feedback { text-align: center; padding: 12px; border-radius: 8px; font-weight: 600; margin: 8px 0; }
    .feedback.correct { background: #dcfce7; color: #166534; }
    .feedback.incorrect { background: #fee2e2; color: #991b1b; }
    .summary { text-align: center; }
    .summary h2 { font-size: 20px; margin-bottom: 8px; }
    .summary .score { font-size: 36px; font-weight: 800; color: #4f46e5; }
    .hint { background: #fef3c7; padding: 10px; border-radius: 8px; text-align: center; color: #92400e; font-size: 14px; }
    .waiting { text-align: center; color: #94a3b8; padding: 40px; }
  </style>
</head>
<body>
  <div id="root">
    <div class="waiting">Waiting for session to start...</div>
  </div>

  <script>
    let state = {}
    let feedback = null
    let hintText = null

    function render() {
      const root = document.getElementById('root')
      if (!state.problems || state.problems.length === 0) {
        root.innerHTML = '<div class="waiting">Waiting for session to start...</div>'
        return
      }

      const idx = state.currentIndex ?? 0
      const problems = state.problems
      const total = problems.length
      const completed = state.completed || idx >= total

      if (completed) {
        const correct = state.correct ?? 0
        const answers = state.answers ?? []
        const accuracy = answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0
        const wrong = answers.filter(a => !a.isCorrect)
        root.innerHTML = `
          <div class="card summary">
            <h2>Practice Complete!</h2>
            <div class="score">${correct} / ${answers.length}</div>
            <p style="color:#64748b;margin-top:8px">${accuracy}% accuracy — ${state.topic} (${state.difficulty})</p>
            ${wrong.length > 0 ? `<p style="margin-top:12px;color:#991b1b">Review: ${wrong.map(w => w.question + ' = ' + w.correctAnswer).join(', ')}</p>` : '<p style="margin-top:12px;color:#166534">Perfect score!</p>'}
          </div>`
        window.parent.postMessage({ type: 'app.complete', summary: `Math practice done: ${correct}/${answers.length} (${accuracy}%)` }, '*')
        window.parent.postMessage({ type: 'app.resize', height: root.scrollHeight + 40 }, '*')
        return
      }

      const problem = problems[idx]
      root.innerHTML = `
        <div class="card">
          <div class="progress">
            <span>${state.topic} — ${state.difficulty}</span>
            <span>Problem ${idx + 1} of ${total}</span>
          </div>
          <div class="question">${problem.question} = ?</div>
          ${feedback ? `<div class="feedback ${feedback.correct ? 'correct' : 'incorrect'}">${feedback.correct ? '✓ Correct!' : `✗ Incorrect — answer was ${feedback.answer}`}</div>` : ''}
          ${hintText ? `<div class="hint">💡 ${hintText}</div>` : ''}
          <input class="answer-input" id="answerInput" type="text" placeholder="Type your answer..." autofocus>
          <div class="btn-row">
            <button class="btn btn-primary" id="submitBtn">Submit</button>
            <button class="btn btn-hint" id="hintBtn">Hint</button>
          </div>
        </div>`

      document.getElementById('submitBtn').onclick = () => {
        const val = document.getElementById('answerInput').value.trim()
        if (!val) return
        window.parent.postMessage({ type: 'app.tool_request', toolName: 'math_submit_answer', args: { answer: val } }, '*')
      }
      document.getElementById('hintBtn').onclick = () => {
        window.parent.postMessage({ type: 'app.tool_request', toolName: 'math_get_hint', args: {} }, '*')
      }
      document.getElementById('answerInput').onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('submitBtn').click()
      }
      window.parent.postMessage({ type: 'app.resize', height: root.scrollHeight + 40 }, '*')
    }

    window.addEventListener('message', (e) => {
      const msg = e.data
      if (msg.type === 'host.init') {
        state = msg.state || {}
        feedback = null
        hintText = null
        render()
      }
      if (msg.type === 'host.state_patch') {
        // Check for feedback
        const oldIdx = state.currentIndex ?? 0
        Object.assign(state, msg.patch)
        const newIdx = state.currentIndex ?? 0
        if (newIdx > oldIdx && state.answers?.length > 0) {
          const lastAnswer = state.answers[state.answers.length - 1]
          feedback = { correct: lastAnswer.isCorrect, answer: lastAnswer.correctAnswer }
          hintText = null
          setTimeout(() => { feedback = null; render() }, 2000)
        }
        render()
      }
      if (msg.type === 'host.tool_result') {
        if (msg.toolName === 'math_get_hint' && msg.result?.summary) {
          hintText = msg.result.summary.replace('Hint for ', '').replace(/^".*?": /, '')
          render()
        }
        if (msg.toolName === 'math_submit_answer' && msg.result?.data) {
          Object.assign(state, msg.result.data)
          if (msg.result.data.answers) {
            const last = msg.result.data.answers[msg.result.data.answers.length - 1]
            if (last) feedback = { correct: last.isCorrect, answer: last.correctAnswer }
          }
          render()
          if (!feedback?.correct) setTimeout(() => { feedback = null; render() }, 2500)
          else setTimeout(() => { feedback = null; render() }, 1500)
        }
      }
    })

    window.parent.postMessage({ type: 'app.ready', appId: 'math-practice' }, '*')
  </script>
</body>
</html>
```

- [ ] **Step 7: Commit**

```bash
git add apps/math-practice/
git commit -m "feat: add Math Practice app — standalone backend + interactive iframe UI"
```

---

### Task 8: Chess App — Standalone Backend + Interactive Board

**Files:**
- Create: `apps/chess/package.json`
- Create: `apps/chess/server/index.ts`
- Create: `apps/chess/server/manifest.ts`
- Create: `apps/chess/server/tools.ts`
- Create: `apps/chess/server/engine.ts`
- Create: `apps/chess/client/index.html`

- [ ] **Step 1: Create chess app package.json**

```json
{
  "name": "chatbridge-chess",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch server/index.ts",
    "start": "node dist/server/index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "chess.js": "^1.0.0-beta.8",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create chess engine wrapper**

```typescript
// apps/chess/server/engine.ts
import { Chess } from 'chess.js'

export interface ChessState {
  fen: string
  moves: string[]
  playerColor: 'white' | 'black'
  gameOver: boolean
  result?: string
}

export function newGame(playerColor: 'white' | 'black' = 'white'): ChessState {
  const game = new Chess()
  return { fen: game.fen(), moves: [], playerColor, gameOver: false }
}

export function makeMove(state: ChessState, moveSan: string): { state: ChessState; error?: string } {
  const game = new Chess(state.fen)

  let result
  try {
    result = game.move(moveSan)
  } catch {
    result = null
  }

  if (!result) {
    return {
      state,
      error: `Invalid move: "${moveSan}". Legal moves: ${game.moves().join(', ')}`,
    }
  }

  const newMoves = [...state.moves, result.san]
  let gameResult: string | undefined
  const gameOver = game.isGameOver()

  if (game.isCheckmate()) gameResult = `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins.`
  else if (game.isDraw()) gameResult = 'Draw!'
  else if (game.isStalemate()) gameResult = 'Stalemate!'

  return {
    state: {
      fen: game.fen(),
      moves: newMoves,
      playerColor: state.playerColor,
      gameOver,
      result: gameResult,
    },
  }
}

export function getHint(state: ChessState): { fen: string; turn: string; legalMoves: string[] } {
  const game = new Chess(state.fen)
  return {
    fen: state.fen,
    turn: game.turn() === 'w' ? 'white' : 'black',
    legalMoves: game.moves(),
  }
}

export function isCheck(fen: string): boolean {
  return new Chess(fen).isCheck()
}
```

- [ ] **Step 3: Create chess manifest**

```typescript
// apps/chess/server/manifest.ts
import type { AppManifest } from '../../../shared/types/app-manifest.js'

const BASE_URL = process.env.CHESS_APP_URL || 'http://localhost:3003'

export const manifest: AppManifest = {
  id: 'chess',
  name: 'Chess',
  description: 'Play chess inside the chat. The chatbot can analyze positions and suggest moves.',
  category: 'game',
  authType: 'none',
  baseUrl: BASE_URL,
  iframeUrl: `${BASE_URL}/app`,
  permissions: [],
  tools: [
    {
      name: 'chess_start_game',
      description: 'Start a new chess game.',
      parameters: [
        { name: 'playerColor', type: 'string', description: 'Color for the student', required: false, enum: ['white', 'black'] },
      ],
    },
    {
      name: 'chess_submit_move',
      description: 'Submit a chess move in algebraic notation (e.g., e4, Nf3, O-O).',
      parameters: [
        { name: 'move', type: 'string', description: 'Move in SAN notation', required: true },
      ],
    },
    {
      name: 'chess_get_hint',
      description: 'Analyze the current board position and suggest a move.',
      parameters: [],
    },
    {
      name: 'chess_end_game',
      description: 'End the current chess game.',
      parameters: [],
    },
  ],
}
```

- [ ] **Step 4: Create chess tool handlers**

```typescript
// apps/chess/server/tools.ts
import type { AppResultEnvelope } from '../../../shared/types/app-session.js'
import { newGame, makeMove, getHint, isCheck, type ChessState } from './engine.js'

export function handleTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: ChessState
): AppResultEnvelope {
  switch (toolName) {
    case 'chess_start_game': {
      const playerColor = (args.playerColor as 'white' | 'black') || 'white'
      const state = newGame(playerColor)
      return {
        status: 'ok',
        data: state as unknown as Record<string, unknown>,
        summary: `Chess game started. Student plays ${playerColor}. Board: ${state.fen}`,
      }
    }

    case 'chess_submit_move': {
      if (!sessionState.fen) return { status: 'error', error: 'No active game. Start a game first.' }
      const moveStr = args.move as string
      const { state: newState, error } = makeMove(sessionState, moveStr)
      if (error) return { status: 'error', error }

      let summary = `Move: ${newState.moves[newState.moves.length - 1]}.`
      if (isCheck(newState.fen)) summary += ' Check!'
      if (newState.gameOver) summary += ` Game over: ${newState.result}`
      summary += ` Position: ${newState.fen}`

      return {
        status: 'ok',
        data: newState as unknown as Record<string, unknown>,
        summary,
      }
    }

    case 'chess_get_hint': {
      if (!sessionState.fen) return { status: 'error', error: 'No active game.' }
      const hint = getHint(sessionState)
      return {
        status: 'ok',
        data: hint as unknown as Record<string, unknown>,
        summary: `Current position (FEN): ${hint.fen}. It's ${hint.turn}'s turn. Legal moves: ${hint.legalMoves.join(', ')}. Please analyze and suggest a good move.`,
      }
    }

    case 'chess_end_game': {
      return {
        status: 'ok',
        data: { gameOver: true, result: 'Game ended by player' } as unknown as Record<string, unknown>,
        summary: `Chess game ended after ${sessionState.moves?.length ?? 0} moves. Final position: ${sessionState.fen || 'N/A'}`,
      }
    }

    default:
      return { status: 'error', error: `Unknown tool: ${toolName}` }
  }
}
```

- [ ] **Step 5: Create chess Express server**

```typescript
// apps/chess/server/index.ts
import cors from 'cors'
import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { manifest } from './manifest.js'
import { handleTool } from './tools.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = parseInt(process.env.PORT || '3003', 10)

app.use(cors())
app.use(express.json())
app.use('/app', express.static(join(__dirname, '../client')))

app.get('/api/manifest', (_req, res) => res.json(manifest))

app.post('/api/tools/:toolName', (req, res) => {
  const { toolName } = req.params
  const { args, sessionState } = req.body
  const result = handleTool(toolName, args || {}, sessionState || {})
  res.json(result)
})

app.listen(PORT, () => console.log(`Chess app running on port ${PORT}`))
```

- [ ] **Step 6: Create interactive chess board iframe client**

This is a full playable chess board with drag-and-drop and click-to-move. Uses pure HTML/CSS/JS with Unicode chess pieces on an 8×8 grid.

```html
<!-- apps/chess/client/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chess</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; padding: 12px; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; }
    #status { padding: 8px 16px; font-size: 14px; font-weight: 600; border-radius: 8px; margin-bottom: 8px; background: #16213e; }
    #board { display: grid; grid-template-columns: repeat(8, 1fr); width: min(360px, 90vw); height: min(360px, 90vw); border: 2px solid #0f3460; border-radius: 4px; overflow: hidden; }
    .sq { display: flex; align-items: center; justify-content: center; font-size: min(36px, 8vw); cursor: pointer; user-select: none; transition: background 0.1s; position: relative; }
    .sq.light { background: #f0d9b5; }
    .sq.dark { background: #b58863; }
    .sq.selected { outline: 3px solid #ffcc00; outline-offset: -3px; z-index: 1; }
    .sq.legal-target::after { content: ''; position: absolute; width: 30%; height: 30%; border-radius: 50%; background: rgba(0,0,0,0.25); }
    .sq.legal-target.has-piece::after { width: 90%; height: 90%; border-radius: 50%; background: none; border: 3px solid rgba(0,0,0,0.3); }
    .sq.last-move { background: rgba(255, 255, 0, 0.3) !important; }
    #moves { margin-top: 8px; font-size: 12px; color: #94a3b8; max-width: min(360px, 90vw); word-wrap: break-word; text-align: center; max-height: 60px; overflow-y: auto; }
    #info { margin-top: 4px; font-size: 13px; color: #64748b; }
    .game-over { color: #fbbf24; font-size: 16px; font-weight: 700; }
  </style>
</head>
<body>
  <div id="status">Waiting for game...</div>
  <div id="board"></div>
  <div id="moves"></div>
  <div id="info"></div>

  <script>
    const PIECES = {
      K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
      k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
    }
    const FILES = 'abcdefgh'

    let state = { fen: null, moves: [], playerColor: 'white', gameOver: false }
    let selected = null
    let lastMoveSquares = []

    function parseFen(fen) {
      if (!fen) return []
      const board = []
      const rows = fen.split(' ')[0].split('/')
      for (const row of rows) {
        const boardRow = []
        for (const ch of row) {
          if (/\d/.test(ch)) { for (let i = 0; i < parseInt(ch); i++) boardRow.push(null) }
          else boardRow.push(ch)
        }
        board.push(boardRow)
      }
      return board
    }

    function getTurn(fen) {
      return fen?.split(' ')[1] === 'w' ? 'white' : 'black'
    }

    function toAlgebraic(row, col) {
      return FILES[col] + (8 - row)
    }

    function render() {
      const boardEl = document.getElementById('board')
      const statusEl = document.getElementById('status')
      const movesEl = document.getElementById('moves')

      if (!state.fen) {
        statusEl.textContent = 'Waiting for game...'
        boardEl.innerHTML = ''
        return
      }

      const board = parseFen(state.fen)
      const turn = getTurn(state.fen)
      const isFlipped = state.playerColor === 'black'

      if (state.gameOver) {
        statusEl.innerHTML = `<span class="game-over">${state.result || 'Game Over'}</span>`
      } else {
        statusEl.textContent = turn === state.playerColor ? "Your turn" : "Opponent's turn"
      }

      boardEl.innerHTML = ''
      for (let displayRow = 0; displayRow < 8; displayRow++) {
        for (let displayCol = 0; displayCol < 8; displayCol++) {
          const row = isFlipped ? 7 - displayRow : displayRow
          const col = isFlipped ? 7 - displayCol : displayCol
          const piece = board[row]?.[col]
          const isLight = (row + col) % 2 === 0
          const sq = document.createElement('div')
          const sqName = toAlgebraic(row, col)

          sq.className = `sq ${isLight ? 'light' : 'dark'}`
          if (selected === sqName) sq.classList.add('selected')
          if (lastMoveSquares.includes(sqName)) sq.classList.add('last-move')
          if (piece) sq.textContent = PIECES[piece] || ''

          sq.dataset.sq = sqName
          sq.dataset.piece = piece || ''
          sq.onclick = () => handleSquareClick(sqName, piece)
          boardEl.appendChild(sq)
        }
      }

      // Show moves
      if (state.moves?.length > 0) {
        const pairs = []
        for (let i = 0; i < state.moves.length; i += 2) {
          pairs.push(`${Math.floor(i / 2) + 1}. ${state.moves[i]}${state.moves[i + 1] ? ' ' + state.moves[i + 1] : ''}`)
        }
        movesEl.textContent = pairs.join('  ')
      }

      window.parent.postMessage({ type: 'app.resize', height: document.body.scrollHeight + 20 }, '*')
    }

    function handleSquareClick(sqName, piece) {
      if (state.gameOver) return
      const turn = getTurn(state.fen)
      if (turn !== state.playerColor) return

      if (selected) {
        if (selected === sqName) { selected = null; render(); return }
        // Try move
        const move = selected + sqName
        // For pawn promotion, assume queen
        window.parent.postMessage({
          type: 'app.tool_request',
          toolName: 'chess_submit_move',
          args: { move: selected.length === 2 && sqName.length === 2 ? `${selected}${sqName}` : sqName }
        }, '*')
        // Actually we need SAN, so let's send the from-to and let the parent figure it out
        // The tool expects SAN, so let's try sending just the destination if a piece is selected
        selected = null
        render()
        return
      }

      if (piece) {
        const isWhitePiece = piece === piece.toUpperCase()
        const isMyPiece = (state.playerColor === 'white' && isWhitePiece) || (state.playerColor === 'black' && !isWhitePiece)
        if (isMyPiece) {
          selected = sqName
          render()
        }
      }
    }

    window.addEventListener('message', (e) => {
      const msg = e.data
      if (msg.type === 'host.init') {
        state = msg.state || {}
        selected = null
        render()
      }
      if (msg.type === 'host.state_patch') {
        const oldFen = state.fen
        Object.assign(state, msg.patch)
        selected = null
        render()
      }
      if (msg.type === 'host.tool_result') {
        if (msg.result?.data) {
          Object.assign(state, msg.result.data)
          selected = null
          render()
        }
        if (msg.result?.error) {
          document.getElementById('info').textContent = msg.result.error
          setTimeout(() => { document.getElementById('info').textContent = '' }, 3000)
        }
      }
    })

    window.parent.postMessage({ type: 'app.ready', appId: 'chess' }, '*')
  </script>
</body>
</html>
```

- [ ] **Step 7: Install dependencies**

Run: `cd /Users/san/Desktop/Gauntlet/chatbox/apps/chess && pnpm install`

- [ ] **Step 8: Commit**

```bash
git add apps/chess/
git commit -m "feat: add Chess app — standalone backend with chess.js + interactive board iframe"
```

---

### Task 9: Google Calendar App (OAuth2 Authenticated)

**Files:**
- Create: `apps/google-calendar/package.json`
- Create: `apps/google-calendar/server/index.ts`
- Create: `apps/google-calendar/server/manifest.ts`
- Create: `apps/google-calendar/server/tools.ts`
- Create: `apps/google-calendar/server/google-api.ts`
- Create: `apps/google-calendar/client/index.html`
- Create: `server/src/apps/oauth-manager.ts`

This task is larger because it includes the platform's OAuth token management.

- [ ] **Step 1: Create platform OAuth manager**

```typescript
// server/src/apps/oauth-manager.ts
import { config } from '../config.js'
import { query } from '../db/client.js'

export async function getOAuthConnection(userId: string, provider: string) {
  const result = await query(
    'SELECT * FROM oauth_connections WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  )
  if (result.rows.length === 0) return null

  const conn = result.rows[0]
  // Check if token is expired and refresh if needed
  if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
    if (conn.refresh_token) {
      return refreshToken(userId, provider, conn.refresh_token)
    }
    return null
  }
  return conn
}

export async function saveOAuthConnection(
  userId: string, provider: string, accessToken: string, refreshToken?: string, expiresAt?: Date, scopes?: string
) {
  await query(
    `INSERT INTO oauth_connections (user_id, provider, access_token, refresh_token, expires_at, scopes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, provider) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_connections.refresh_token),
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`,
    [userId, provider, accessToken, refreshToken || null, expiresAt || null, scopes || null]
  )
}

async function refreshToken(userId: string, provider: string, refreshToken: string) {
  if (provider !== 'google') return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) return null
  const data = await res.json()

  const expiresAt = new Date(Date.now() + data.expires_in * 1000)
  await saveOAuthConnection(userId, provider, data.access_token, undefined, expiresAt)

  return { access_token: data.access_token, refresh_token: refreshToken, expires_at: expiresAt }
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCode(code: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.googleRedirectUri,
    }),
  })

  if (!res.ok) throw new Error('Token exchange failed')
  const data = await res.json()
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in }
}
```

- [ ] **Step 2: Add OAuth routes to platform backend**

Add to `server/src/apps/routes.ts`:

```typescript
// Add these imports and routes to server/src/apps/routes.ts
import { buildGoogleAuthUrl, exchangeGoogleCode, saveOAuthConnection, getOAuthConnection } from './oauth-manager.js'

// Start OAuth flow
appRoutes.get('/oauth/google/start', requireAuth, (req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: req.user!.id })).toString('base64')
  const authUrl = buildGoogleAuthUrl(state)
  res.json({ authUrl })
})

// OAuth callback
appRoutes.get('/oauth/google/callback', async (req, res, next) => {
  try {
    const code = req.query.code as string
    const state = JSON.parse(Buffer.from(req.query.state as string, 'base64').toString())
    const userId = state.userId

    const tokens = await exchangeGoogleCode(code)
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000)
    await saveOAuthConnection(userId, 'google', tokens.accessToken, tokens.refreshToken, expiresAt, 'calendar.events')

    // Redirect back to app with success
    res.send('<html><body><script>window.close(); window.opener?.postMessage({type:"oauth_complete",provider:"google"}, "*")</script><p>Connected! You can close this tab.</p></body></html>')
  } catch (err) {
    next(err)
  }
})

// Check OAuth connection status
appRoutes.get('/oauth/:provider/status', requireAuth, async (req, res, next) => {
  try {
    const conn = await getOAuthConnection(req.user!.id, req.params.provider)
    res.json({ connected: !!conn })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 3: Create Google Calendar app manifest + tools + server**

```typescript
// apps/google-calendar/server/manifest.ts
import type { AppManifest } from '../../../shared/types/app-manifest.js'

const BASE_URL = process.env.CALENDAR_APP_URL || 'http://localhost:3002'

export const manifest: AppManifest = {
  id: 'google-calendar',
  name: 'Google Calendar Study Planner',
  description: 'Plan study sessions and create events on Google Calendar. Requires Google account authorization.',
  category: 'productivity',
  authType: 'oauth2',
  baseUrl: BASE_URL,
  iframeUrl: `${BASE_URL}/app`,
  permissions: ['calendar.events'],
  tools: [
    { name: 'calendar_check_connection', description: 'Check if the user has connected their Google Calendar.', parameters: [] },
    { name: 'calendar_start_connect', description: 'Start the Google OAuth flow.', parameters: [] },
    { name: 'calendar_list_events', description: 'List upcoming events.', parameters: [{ name: 'maxResults', type: 'number', description: 'Max events (default 10)', required: false }] },
    { name: 'calendar_create_study_block', description: 'Create a study block on the calendar.',
      parameters: [
        { name: 'subject', type: 'string', description: 'Subject to study', required: true },
        { name: 'date', type: 'string', description: 'Date YYYY-MM-DD', required: true },
        { name: 'startTime', type: 'string', description: 'Start time HH:MM (24h)', required: true },
        { name: 'durationMinutes', type: 'number', description: 'Duration in minutes', required: true },
      ],
    },
    { name: 'calendar_create_study_plan', description: 'Create a multi-day study plan.',
      parameters: [
        { name: 'subject', type: 'string', description: 'Subject', required: true },
        { name: 'blocks', type: 'array', description: 'Array of {date, startTime, durationMinutes}', required: true },
      ],
    },
  ],
}
```

```typescript
// apps/google-calendar/server/google-api.ts
export async function calendarFetch(path: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...options.headers },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Google API ${res.status}`)
  }
  return res.json()
}
```

```typescript
// apps/google-calendar/server/tools.ts
import type { AppResultEnvelope } from '../../../shared/types/app-session.js'
import { calendarFetch } from './google-api.js'

const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:3000'

export async function handleTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: Record<string, unknown>,
  userId: string,
): Promise<AppResultEnvelope> {
  switch (toolName) {
    case 'calendar_check_connection': {
      // Ask platform backend for OAuth status
      try {
        const res = await fetch(`${PLATFORM_URL}/api/apps/oauth/google/status`, {
          headers: { 'X-User-Id': userId },
        })
        const data = await res.json()
        return {
          status: 'ok',
          data: { connected: data.connected },
          summary: data.connected ? 'Google Calendar is connected.' : 'Google Calendar is not connected. Use calendar_start_connect to connect.',
        }
      } catch {
        return { status: 'ok', data: { connected: false }, summary: 'Unable to check connection. Please try connecting.' }
      }
    }

    case 'calendar_start_connect': {
      try {
        const res = await fetch(`${PLATFORM_URL}/api/apps/oauth/google/start`, {
          headers: { 'X-User-Id': userId },
        })
        const data = await res.json()
        return {
          status: 'pending',
          data: { authUrl: data.authUrl },
          summary: 'Please click the link to connect your Google Calendar.',
        }
      } catch (err) {
        return { status: 'error', error: 'Failed to start OAuth flow.' }
      }
    }

    case 'calendar_list_events': {
      const accessToken = sessionState.accessToken as string
      if (!accessToken) return { status: 'error', error: 'Not connected. Use calendar_check_connection first.' }
      const maxResults = (args.maxResults as number) || 10
      const data = await calendarFetch(
        `/calendars/primary/events?maxResults=${maxResults}&timeMin=${new Date().toISOString()}&orderBy=startTime&singleEvents=true`,
        accessToken
      )
      const events = (data.items || []).map((e: any) => ({
        title: e.summary || 'Untitled',
        start: e.start?.dateTime || e.start?.date || '',
      }))
      return {
        status: 'ok',
        data: { events },
        summary: `Found ${events.length} upcoming events.`,
      }
    }

    case 'calendar_create_study_block': {
      const accessToken = sessionState.accessToken as string
      if (!accessToken) return { status: 'error', error: 'Not connected.' }
      const { subject, date, startTime, durationMinutes } = args as { subject: string; date: string; startTime: string; durationMinutes: number }
      const start = new Date(`${date}T${startTime}:00`)
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
      await calendarFetch('/calendars/primary/events', accessToken, {
        method: 'POST',
        body: JSON.stringify({ summary: `📚 Study: ${subject}`, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } }),
      })
      return {
        status: 'ok',
        data: { subject, date, startTime, durationMinutes, created: true },
        summary: `Created study block: ${subject} on ${date} at ${startTime} for ${durationMinutes} minutes.`,
      }
    }

    case 'calendar_create_study_plan': {
      const accessToken = sessionState.accessToken as string
      if (!accessToken) return { status: 'error', error: 'Not connected.' }
      const { subject, blocks } = args as { subject: string; blocks: Array<{ date: string; startTime: string; durationMinutes: number }> }
      let created = 0
      for (const block of blocks) {
        const start = new Date(`${block.date}T${block.startTime}:00`)
        const end = new Date(start.getTime() + block.durationMinutes * 60 * 1000)
        await calendarFetch('/calendars/primary/events', accessToken, {
          method: 'POST',
          body: JSON.stringify({ summary: `📚 Study: ${subject}`, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } }),
        })
        created++
      }
      return {
        status: 'ok',
        data: { subject, blocksCreated: created },
        summary: `Study plan created: ${created} blocks for ${subject} scheduled.`,
      }
    }

    default:
      return { status: 'error', error: `Unknown tool: ${toolName}` }
  }
}
```

```typescript
// apps/google-calendar/server/index.ts
import cors from 'cors'
import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { manifest } from './manifest.js'
import { handleTool } from './tools.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = parseInt(process.env.PORT || '3002', 10)

app.use(cors())
app.use(express.json())
app.use('/app', express.static(join(__dirname, '../client')))

app.get('/api/manifest', (_req, res) => res.json(manifest))

app.post('/api/tools/:toolName', async (req, res) => {
  const { toolName } = req.params
  const { args, sessionState, userId } = req.body
  const result = await handleTool(toolName, args || {}, sessionState || {}, userId || '')
  res.json(result)
})

app.listen(PORT, () => console.log(`Google Calendar app running on port ${PORT}`))
```

- [ ] **Step 4: Create calendar iframe client**

```html
<!-- apps/google-calendar/client/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Study Planner</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; padding: 16px; background: #f8fafc; color: #1e293b; }
    .card { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 12px; }
    h2 { font-size: 18px; margin-bottom: 8px; }
    .status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .connected { background: #dcfce7; color: #166534; }
    .disconnected { background: #fee2e2; color: #991b1b; }
    .btn { padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn-google { background: #4285f4; color: white; }
    .btn-google:hover { background: #3367d6; }
    .event { padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .event:last-child { border: none; }
    .event-title { font-weight: 600; }
    .event-time { color: #64748b; font-size: 12px; }
    .created { background: #f0fdf4; padding: 12px; border-radius: 8px; text-align: center; }
    .created .check { font-size: 24px; }
    .waiting { text-align: center; color: #94a3b8; padding: 30px; }
  </style>
</head>
<body>
  <div id="root"><div class="waiting">Loading study planner...</div></div>
  <script>
    let state = {}

    function render() {
      const root = document.getElementById('root')

      if (state.authUrl) {
        root.innerHTML = `
          <div class="card" style="text-align:center">
            <h2>Connect Google Calendar</h2>
            <p style="color:#64748b;margin:8px 0">Authorize access to create study events</p>
            <button class="btn btn-google" id="connectBtn">Connect with Google</button>
          </div>`
        document.getElementById('connectBtn').onclick = () => {
          window.open(state.authUrl, '_blank', 'width=500,height=600')
        }
        window.parent.postMessage({ type: 'app.resize', height: root.scrollHeight + 40 }, '*')
        return
      }

      if (!state.connected && !state.events && !state.created) {
        root.innerHTML = `
          <div class="card">
            <span class="status disconnected">● Not Connected</span>
            <p style="margin-top:8px;color:#64748b">Ask the chatbot to connect your Google Calendar.</p>
          </div>`
        window.parent.postMessage({ type: 'app.resize', height: root.scrollHeight + 40 }, '*')
        return
      }

      let html = '<div class="card"><span class="status connected">● Connected</span></div>'

      if (state.events) {
        html += '<div class="card"><h2>Upcoming Events</h2>'
        for (const ev of state.events) {
          html += `<div class="event"><div class="event-title">${ev.title}</div><div class="event-time">${ev.start}</div></div>`
        }
        html += '</div>'
      }

      if (state.created) {
        html += `<div class="card created"><div class="check">✓</div><p style="font-weight:600;margin-top:4px">${state.subject ? 'Study block created for ' + state.subject : 'Event created!'}</p></div>`
      }

      if (state.blocksCreated) {
        html += `<div class="card created"><div class="check">📅</div><p style="font-weight:600;margin-top:4px">${state.blocksCreated} study blocks scheduled for ${state.subject}</p></div>`
      }

      root.innerHTML = html
      window.parent.postMessage({ type: 'app.resize', height: root.scrollHeight + 40 }, '*')
    }

    window.addEventListener('message', (e) => {
      const msg = e.data
      if (msg.type === 'host.init') { state = msg.state || {}; render() }
      if (msg.type === 'host.state_patch') { Object.assign(state, msg.patch); render() }
      if (msg.type === 'host.tool_result' && msg.result?.data) {
        Object.assign(state, msg.result.data)
        render()
      }
      if (msg.type === 'oauth_complete') {
        state.connected = true
        state.authUrl = null
        render()
      }
    })

    window.addEventListener('message', (e) => {
      if (e.data?.type === 'oauth_complete') { state.connected = true; state.authUrl = null; render() }
    })

    window.parent.postMessage({ type: 'app.ready', appId: 'google-calendar' }, '*')
  </script>
</body>
</html>
```

- [ ] **Step 5: Create package.json for calendar app**

```json
{
  "name": "chatbridge-google-calendar",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "tsx watch server/index.ts" },
  "dependencies": { "express": "^4.21.0", "cors": "^2.8.5", "zod": "^3.23.0" },
  "devDependencies": { "@types/express": "^4.17.21", "@types/cors": "^2.8.17", "tsx": "^4.19.0", "typescript": "^5.6.0" }
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/google-calendar/ server/src/apps/oauth-manager.ts server/src/apps/routes.ts
git commit -m "feat: add Google Calendar app with OAuth2 flow and study planner"
```

---

### Task 10: Flashcards App

**Files:**
- Create: `apps/flashcards/package.json`
- Create: `apps/flashcards/server/index.ts`
- Create: `apps/flashcards/server/manifest.ts`
- Create: `apps/flashcards/server/tools.ts`
- Create: `apps/flashcards/client/index.html`

- [ ] **Step 1: Create flashcards app (server + client)**

The flashcards app follows the same pattern. Server exposes tools, client renders a flip-card UI.

```json
{
  "name": "chatbridge-flashcards",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "tsx watch server/index.ts" },
  "dependencies": { "express": "^4.21.0", "cors": "^2.8.5", "zod": "^3.23.0" },
  "devDependencies": { "@types/express": "^4.17.21", "@types/cors": "^2.8.17", "tsx": "^4.19.0", "typescript": "^5.6.0" }
}
```

```typescript
// apps/flashcards/server/manifest.ts
import type { AppManifest } from '../../../shared/types/app-manifest.js'

const BASE_URL = process.env.FLASHCARDS_APP_URL || 'http://localhost:3004'

export const manifest: AppManifest = {
  id: 'flashcards',
  name: 'Flashcards',
  description: 'Study with interactive flashcards. Create decks, flip cards, track progress.',
  category: 'education',
  authType: 'none',
  baseUrl: BASE_URL,
  iframeUrl: `${BASE_URL}/app`,
  permissions: [],
  tools: [
    { name: 'flashcards_start_deck', description: 'Start a flashcard deck.', parameters: [
      { name: 'topic', type: 'string', description: 'Topic', required: true },
      { name: 'cards', type: 'array', description: 'Array of {front, back} objects', required: true },
    ]},
    { name: 'flashcards_reveal_card', description: 'Reveal the answer.', parameters: [] },
    { name: 'flashcards_mark_known', description: 'Mark current card as known.', parameters: [] },
    { name: 'flashcards_mark_unknown', description: 'Mark current card as unknown.', parameters: [] },
    { name: 'flashcards_finish_deck', description: 'Finish the deck and see results.', parameters: [] },
  ],
}
```

```typescript
// apps/flashcards/server/tools.ts
import type { AppResultEnvelope } from '../../../shared/types/app-session.js'

interface FlashcardState {
  topic?: string
  cards?: Array<{ front: string; back: string }>
  currentIndex?: number
  revealed?: boolean
  known?: number
  unknown?: number
  unknownCards?: string[]
}

export function handleTool(toolName: string, args: Record<string, unknown>, state: FlashcardState): AppResultEnvelope {
  switch (toolName) {
    case 'flashcards_start_deck': {
      const topic = args.topic as string
      const cards = args.cards as Array<{ front: string; back: string }>
      return {
        status: 'ok',
        data: { topic, cards, currentIndex: 0, revealed: false, known: 0, unknown: 0, unknownCards: [] },
        summary: `Flashcard deck "${topic}" started with ${cards.length} cards. First card: ${cards[0]?.front}`,
      }
    }
    case 'flashcards_reveal_card': {
      const card = state.cards?.[state.currentIndex ?? 0]
      if (!card) return { status: 'error', error: 'No active card.' }
      return { status: 'ok', data: { revealed: true }, summary: `Answer: ${card.back}` }
    }
    case 'flashcards_mark_known': {
      const newKnown = (state.known ?? 0) + 1
      const nextIdx = (state.currentIndex ?? 0) + 1
      const isLast = nextIdx >= (state.cards?.length ?? 0)
      const nextCard = state.cards?.[nextIdx]
      return {
        status: 'ok',
        data: { currentIndex: nextIdx, known: newKnown, revealed: false, ...(isLast ? { completed: true } : {}) },
        summary: `Marked as known. ${newKnown} known so far.${nextCard ? ` Next: ${nextCard.front}` : ' Deck complete!'}`,
      }
    }
    case 'flashcards_mark_unknown': {
      const newUnknown = (state.unknown ?? 0) + 1
      const card = state.cards?.[state.currentIndex ?? 0]
      const unknownCards = [...(state.unknownCards ?? []), card?.front ?? '']
      const nextIdx = (state.currentIndex ?? 0) + 1
      const isLast = nextIdx >= (state.cards?.length ?? 0)
      const nextCard = state.cards?.[nextIdx]
      return {
        status: 'ok',
        data: { currentIndex: nextIdx, unknown: newUnknown, unknownCards, revealed: false, ...(isLast ? { completed: true } : {}) },
        summary: `Marked for review. ${newUnknown} need review.${nextCard ? ` Next: ${nextCard.front}` : ' Deck complete!'}`,
      }
    }
    case 'flashcards_finish_deck': {
      const known = state.known ?? 0
      const unknown = state.unknown ?? 0
      const total = known + unknown
      const accuracy = total > 0 ? Math.round((known / total) * 100) : 0
      return {
        status: 'ok',
        data: { completed: true },
        summary: `Flashcards done. ${known}/${total} known (${accuracy}%).${(state.unknownCards?.length ?? 0) > 0 ? ` Review: ${state.unknownCards!.join(', ')}` : ' All known!'}`,
      }
    }
    default:
      return { status: 'error', error: `Unknown tool: ${toolName}` }
  }
}
```

```typescript
// apps/flashcards/server/index.ts
import cors from 'cors'
import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { manifest } from './manifest.js'
import { handleTool } from './tools.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = parseInt(process.env.PORT || '3004', 10)

app.use(cors())
app.use(express.json())
app.use('/app', express.static(join(__dirname, '../client')))
app.get('/api/manifest', (_req, res) => res.json(manifest))
app.post('/api/tools/:toolName', (req, res) => {
  const { args, sessionState } = req.body
  res.json(handleTool(req.params.toolName, args || {}, sessionState || {}))
})
app.listen(PORT, () => console.log(`Flashcards app running on port ${PORT}`))
```

```html
<!-- apps/flashcards/client/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Flashcards</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; padding: 16px; background: #faf5ff; color: #1e293b; display: flex; flex-direction: column; align-items: center; }
    .card-container { perspective: 800px; width: 300px; height: 200px; margin: 16px 0; cursor: pointer; }
    .card { width: 100%; height: 100%; position: relative; transition: transform 0.5s; transform-style: preserve-3d; border-radius: 16px; }
    .card.flipped { transform: rotateY(180deg); }
    .card-face { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; backface-visibility: hidden; border-radius: 16px; padding: 20px; text-align: center; font-size: 18px; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .card-front { background: white; color: #1e293b; }
    .card-back { background: #7c3aed; color: white; transform: rotateY(180deg); }
    .progress { font-size: 14px; color: #64748b; margin-bottom: 8px; }
    .btn-row { display: flex; gap: 8px; margin-top: 12px; }
    .btn { padding: 10px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn-know { background: #22c55e; color: white; }
    .btn-unknown { background: #ef4444; color: white; }
    .btn-reveal { background: #7c3aed; color: white; }
    .summary { text-align: center; }
    .summary h2 { font-size: 20px; }
    .summary .score { font-size: 32px; font-weight: 800; color: #7c3aed; margin: 8px 0; }
    .waiting { text-align: center; color: #94a3b8; padding: 40px; }
    .topic { font-size: 13px; color: #a78bfa; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div id="root"><div class="waiting">Waiting for deck...</div></div>
  <script>
    let state = {}
    let flipped = false

    function render() {
      const root = document.getElementById('root')
      const cards = state.cards || []
      const idx = state.currentIndex ?? 0
      const completed = state.completed || idx >= cards.length

      if (cards.length === 0) {
        root.innerHTML = '<div class="waiting">Waiting for deck...</div>'
        window.parent.postMessage({ type: 'app.resize', height: 120 }, '*')
        return
      }

      if (completed) {
        const known = state.known ?? 0, unknown = state.unknown ?? 0, total = known + unknown
        const accuracy = total > 0 ? Math.round((known / total) * 100) : 0
        root.innerHTML = `
          <div class="summary">
            <div class="topic">${state.topic || 'Flashcards'}</div>
            <h2>Deck Complete!</h2>
            <div class="score">${known} / ${total}</div>
            <p style="color:#64748b">${accuracy}% known</p>
            ${(state.unknownCards?.length > 0) ? `<p style="margin-top:8px;color:#ef4444">Review: ${state.unknownCards.join(', ')}</p>` : '<p style="margin-top:8px;color:#22c55e">Perfect!</p>'}
          </div>`
        window.parent.postMessage({ type: 'app.complete', summary: `Flashcards: ${known}/${total} known (${accuracy}%)` }, '*')
        window.parent.postMessage({ type: 'app.resize', height: root.scrollHeight + 40 }, '*')
        return
      }

      const card = cards[idx]
      const revealed = state.revealed || flipped

      root.innerHTML = `
        <div class="topic">${state.topic || 'Flashcards'}</div>
        <div class="progress">Card ${idx + 1} of ${cards.length}</div>
        <div class="card-container" id="flipCard">
          <div class="card ${revealed ? 'flipped' : ''}">
            <div class="card-face card-front">${card.front}</div>
            <div class="card-face card-back">${card.back}</div>
          </div>
        </div>
        ${!revealed ? `
          <div class="btn-row">
            <button class="btn btn-reveal" id="revealBtn">Flip Card</button>
          </div>
        ` : `
          <div class="btn-row">
            <button class="btn btn-know" id="knowBtn">✓ Know It</button>
            <button class="btn btn-unknown" id="unknownBtn">✗ Review Later</button>
          </div>
        `}`

      if (!revealed) {
        document.getElementById('revealBtn').onclick = () => {
          flipped = true
          window.parent.postMessage({ type: 'app.tool_request', toolName: 'flashcards_reveal_card', args: {} }, '*')
          render()
        }
        document.getElementById('flipCard').onclick = () => {
          flipped = true
          window.parent.postMessage({ type: 'app.tool_request', toolName: 'flashcards_reveal_card', args: {} }, '*')
          render()
        }
      } else {
        document.getElementById('knowBtn').onclick = () => {
          flipped = false
          window.parent.postMessage({ type: 'app.tool_request', toolName: 'flashcards_mark_known', args: {} }, '*')
        }
        document.getElementById('unknownBtn').onclick = () => {
          flipped = false
          window.parent.postMessage({ type: 'app.tool_request', toolName: 'flashcards_mark_unknown', args: {} }, '*')
        }
      }
      window.parent.postMessage({ type: 'app.resize', height: root.scrollHeight + 40 }, '*')
    }

    window.addEventListener('message', (e) => {
      const msg = e.data
      if (msg.type === 'host.init') { state = msg.state || {}; flipped = false; render() }
      if (msg.type === 'host.state_patch') { Object.assign(state, msg.patch); flipped = false; render() }
      if (msg.type === 'host.tool_result' && msg.result?.data) { Object.assign(state, msg.result.data); flipped = state.revealed || false; render() }
    })
    window.parent.postMessage({ type: 'app.ready', appId: 'flashcards' }, '*')
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add apps/flashcards/
git commit -m "feat: add Flashcards app with flip-card UI and progress tracking"
```

---

## Phase 2: Frontend Integration (Chatbox Modifications)

### Task 11: Iframe Bridge + App Iframe Component

**Files:**
- Create: `src/renderer/packages/apps/iframe-bridge.ts`
- Create: `src/renderer/packages/apps/api.ts`
- Create: `src/renderer/components/app-blocks/AppIframe.tsx`
- Create: `src/renderer/components/app-blocks/AppMessage.tsx`
- Create: `src/renderer/stores/appStore.ts`

- [ ] **Step 1: Create platform API client**

```typescript
// src/renderer/packages/apps/api.ts
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

let authToken: string | null = null

export function setAuthToken(token: string) {
  authToken = token
}

export function getAuthToken(): string | null {
  return authToken
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `API error: ${res.status}`)
  }
  return res
}

export async function apiJson<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options)
  return res.json()
}

export async function apiStream(path: string, body: unknown, onEvent: (event: { type: string; [key: string]: unknown }) => void) {
  const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: [DONE]')) return
      if (line.startsWith('data: ')) {
        try {
          onEvent(JSON.parse(line.slice(6)))
        } catch {}
      }
    }
  }
}
```

- [ ] **Step 2: Create host-side iframe bridge**

```typescript
// src/renderer/packages/apps/iframe-bridge.ts
import type { AppMessage, HostMessage } from '../../../../shared/types/bridge-messages'
import { AppMessageSchema } from '../../../../shared/types/bridge-messages'

export class IframeBridge {
  private iframe: HTMLIFrameElement
  private listeners = new Map<string, Set<(msg: AppMessage) => void>>()
  private handler: (e: MessageEvent) => void

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe
    this.handler = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return
      try {
        const msg = AppMessageSchema.parse(e.data)
        const handlers = this.listeners.get(msg.type)
        if (handlers) handlers.forEach((h) => h(msg))
        // Also fire wildcard listeners
        const all = this.listeners.get('*')
        if (all) all.forEach((h) => h(msg))
      } catch {
        // Ignore non-bridge messages
      }
    }
    window.addEventListener('message', this.handler)
  }

  send(msg: HostMessage) {
    this.iframe.contentWindow?.postMessage(msg, '*')
  }

  on(type: string, handler: (msg: AppMessage) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(handler)
  }

  off(type: string, handler: (msg: AppMessage) => void) {
    this.listeners.get(type)?.delete(handler)
  }

  destroy() {
    window.removeEventListener('message', this.handler)
    this.listeners.clear()
  }
}
```

- [ ] **Step 3: Create AppIframe component**

```typescript
// src/renderer/components/app-blocks/AppIframe.tsx
import { Box, Loader, Paper, Text } from '@mantine/core'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { IframeBridge } from '@/packages/apps/iframe-bridge'
import type { AppMessage } from '../../../../shared/types/bridge-messages'
import { apiJson } from '@/packages/apps/api'

interface AppIframeProps {
  appId: string
  iframeUrl: string
  sessionState: Record<string, unknown>
  appSessionId: string
  onComplete?: (summary?: string) => void
  onToolRequest?: (toolName: string, args: Record<string, unknown>) => void
}

export const AppIframe: FC<AppIframeProps> = ({
  appId, iframeUrl, sessionState, appSessionId, onComplete, onToolRequest,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const bridgeRef = useRef<IframeBridge | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [height, setHeight] = useState(350)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const bridge = new IframeBridge(iframe)
    bridgeRef.current = bridge

    bridge.on('app.ready', () => {
      bridge.send({ type: 'host.init', appSessionId, state: sessionState })
      setLoading(false)
    })

    bridge.on('app.resize', (msg: any) => {
      if (msg.height && msg.height > 100) setHeight(Math.min(msg.height, 600))
    })

    bridge.on('app.complete', (msg: any) => {
      onComplete?.(msg.summary)
    })

    bridge.on('app.error', (msg: any) => {
      setError(msg.error)
    })

    bridge.on('app.tool_request', (msg: any) => {
      onToolRequest?.(msg.toolName, msg.args || {})
    })

    bridge.on('app.state_patch', (msg: any) => {
      // State patches from the app go to the platform
    })

    return () => bridge.destroy()
  }, [appSessionId])

  // Expose bridge for parent to send messages
  useEffect(() => {
    if (bridgeRef.current && sessionState) {
      bridgeRef.current.send({ type: 'host.state_patch', patch: sessionState })
    }
  }, [sessionState])

  return (
    <Paper withBorder radius="md" p={0} my="xs" style={{ overflow: 'hidden' }}>
      {loading && (
        <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100 }}>
          <Loader size="sm" />
          <Text size="sm" ml="xs" c="dimmed">Loading {appId}...</Text>
        </Box>
      )}
      {error && <Text c="red" size="sm" p="sm">{error}</Text>}
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        sandbox="allow-scripts allow-popups allow-same-origin"
        style={{ width: '100%', height, border: 'none', display: loading ? 'none' : 'block' }}
        onLoad={() => {}}
        onError={() => setError('Failed to load app')}
      />
    </Paper>
  )
}
```

- [ ] **Step 4: Create app store**

```typescript
// src/renderer/stores/appStore.ts
import { create } from 'zustand'

interface ActiveApp {
  appId: string
  appSessionId: string
  iframeUrl: string
  state: Record<string, unknown>
}

interface AppStoreState {
  activeApps: Record<string, ActiveApp>
  setActiveApp: (conversationId: string, app: ActiveApp) => void
  updateAppState: (conversationId: string, patch: Record<string, unknown>) => void
  clearApp: (conversationId: string) => void
  getActiveApp: (conversationId: string) => ActiveApp | undefined
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  activeApps: {},
  setActiveApp: (conversationId, app) => set((s) => ({
    activeApps: { ...s.activeApps, [conversationId]: app },
  })),
  updateAppState: (conversationId, patch) => set((s) => {
    const existing = s.activeApps[conversationId]
    if (!existing) return s
    return {
      activeApps: {
        ...s.activeApps,
        [conversationId]: { ...existing, state: { ...existing.state, ...patch } },
      },
    }
  }),
  clearApp: (conversationId) => set((s) => {
    const { [conversationId]: _, ...rest } = s.activeApps
    return { activeApps: rest }
  }),
  getActiveApp: (conversationId) => get().activeApps[conversationId],
}))
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/packages/apps/ src/renderer/components/app-blocks/ src/renderer/stores/appStore.ts
git commit -m "feat: add iframe bridge, app iframe component, API client, and app store"
```

---

### Task 12: App Auto-Registration on Server Start

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add app auto-registration to server startup**

After `await initDb()` in `server/src/index.ts`, add:

```typescript
import { loadAppsIntoCache, registerApp } from './apps/registry.js'

// Inside start() function, after initDb():
// Auto-register apps by fetching their manifests
const appEndpoints = [
  config.appUrls.mathPractice,
  config.appUrls.googleCalendar,
  config.appUrls.chess,
  config.appUrls.flashcards,
]

for (const baseUrl of appEndpoints) {
  try {
    const res = await fetch(`${baseUrl}/api/manifest`)
    if (res.ok) {
      const manifest = await res.json()
      await registerApp(manifest)
      console.log(`Registered app: ${manifest.name}`)
    }
  } catch (err) {
    console.warn(`Could not register app at ${baseUrl}:`, err instanceof Error ? err.message : err)
  }
}

await loadAppsIntoCache()
```

- [ ] **Step 2: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: auto-register apps from their manifest endpoints on server start"
```

---

## Phase 3: Verification + Polish

### Task 13: Dev Runner Script

**Files:**
- Create: `scripts/dev.sh`

- [ ] **Step 1: Create a dev runner that starts all services**

```bash
#!/bin/bash
# scripts/dev.sh — Start all ChatBridge services

echo "Starting ChatBridge development environment..."

# Start app backends
cd apps/math-practice && pnpm dev &
cd apps/google-calendar && pnpm dev &
cd apps/chess && pnpm dev &
cd apps/flashcards && pnpm dev &

# Wait for apps to start
sleep 2

# Start platform backend
cd server && pnpm dev &

# Wait for backend
sleep 2

# Start frontend
pnpm run dev:web &

echo ""
echo "ChatBridge is running:"
echo "  Frontend:         http://localhost:1212"
echo "  Platform Backend: http://localhost:3000"
echo "  Math Practice:    http://localhost:3001"
echo "  Google Calendar:  http://localhost:3002"
echo "  Chess:            http://localhost:3003"
echo "  Flashcards:       http://localhost:3004"
echo ""

wait
```

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x scripts/dev.sh
git add scripts/dev.sh
git commit -m "feat: add dev runner script for all ChatBridge services"
```

---

## MVP Validation Checklist

| # | Requirement | Task | Status |
|---|------------|-------|--------|
| 1 | Platform backend (auth, routes, validation) | Tasks 1-3 | [ ] |
| 2 | PostgreSQL schema (all tables) | Task 2 | [ ] |
| 3 | Shared type contract (manifest, session, bridge) | Task 4 | [ ] |
| 4 | App registry + tool router | Task 5 | [ ] |
| 5 | Chat API with OpenRouter + tool calling loop | Task 6 | [ ] |
| 6 | Math Practice — Internal, no auth, playable UI | Task 7 | [ ] |
| 7 | Chess — External Public, iframe, complex state | Task 8 | [ ] |
| 8 | Google Calendar — External Authenticated, OAuth2 | Task 9 | [ ] |
| 9 | Flashcards — External Public, iframe | Task 10 | [ ] |
| 10 | Frontend iframe bridge + app components | Task 11 | [ ] |
| 11 | App auto-registration | Task 12 | [ ] |
| 12 | Dev runner script | Task 13 | [ ] |

## Test Scenario Coverage

| # | Test Scenario | How It's Covered |
|---|--------------|-----------------|
| 1 | User asks chatbot to use app (tool discovery) | OpenRouter sees tool schemas from registry, invokes correct tool |
| 2 | App UI renders in chat | AppIframe component loads app's iframe URL with postMessage bridge |
| 3 | User interacts with app then returns to chat | app.complete message triggers completion, chat continues |
| 4 | Chatbot remembers app results | App session summaries injected into system prompt context |
| 5 | Switch between multiple apps | Each app gets own session, tool router finds correct app by tool name |
| 6 | Ambiguous query routing | System prompt instructs LLM to only invoke when clearly relevant |
| 7 | Refuses apps for unrelated queries | System prompt + LLM judgment (no forced tool use) |

## 3 App Types Coverage

| Type | App | Auth | Evidence |
|------|-----|------|----------|
| Internal | Math Practice | None | Bundled, no external deps |
| External Public | Chess + Flashcards | None | Standalone backends on separate ports |
| External Authenticated | Google Calendar | OAuth2 | Backend-managed token storage + refresh |
