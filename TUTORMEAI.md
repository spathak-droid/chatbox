# TutorMeAI — Interactive Learning Platform

A chat-based tutoring platform for students ages 8-14, built on top of [Chatbox](https://github.com/nicepkg/chatbox). Students chat with an AI tutor that launches interactive apps — chess, math practice, flashcards, and Google Calendar — directly in the conversation.

## What This Is

Forked from Chatbox (an open-source ChatGPT desktop client). We added:

- **4 interactive apps** that render as iframes alongside the chat
- **A backend server** with tool routing, session management, and a two-pass LLM architecture
- **69 evals** covering routing correctness, adversarial attacks, failure modes, and content safety
- **Langfuse observability** on every LLM call

The AI tutor routes student requests to the right app, coaches them contextually (reading game state, math progress), and handles destructive actions (calendar deletions) with a confirmation flow.

---

## Architecture

```
+----------------------------------------------------------+
|  Frontend (React + Mantine)                               |
|  +---------------+  +----------------------------------+ |
|  |  Chat Panel    |  |  Active App Panel (iframe)       | |
|  |  - Messages    |  |  - Chess board                   | |
|  |  - Tool badges |  |  - Math problems                 | |
|  |  - Confirm UI  |  |  - Flashcard deck                | |
|  |  - Suggestions |  |  - Calendar view                 | |
|  +-------+-------+  +----------------+-----------------+ |
|          | SSE stream                  | postMessage       |
+----------+----------------------------+------------------+
           |                             |
+----------v-----------------------------v------------------+
|  Server (Express + PostgreSQL)                             |
|                                                            |
|  +------------------------------------------------------+ |
|  |  Two-Pass LLM (OpenRouter)                            | |
|  |  Pass 1: Get tool proposals (non-streaming)           | |
|  |  Pass 2: Generate text from results (streaming)       | |
|  +-------------------------+----------------------------+ |
|                             |                              |
|  +-----------+ +------------v--------+ +-----------------+ |
|  | Guardrails| |  Tool Router        | | Session Manager | |
|  | Scoping   | |  Confirmation       | | State Sync      | |
|  +-----------+ +------------+--------+ +-----------------+ |
|                             |                              |
|  +-------+ +-------+ +-----v-----+ +------------------+   |
|  | Chess  | | Math  | | Calendar  | |   Flashcards     |   |
|  | :3003  | | :3001 | | :3002     | |   :3004          |   |
|  +-------+ +-------+ +-----------+ +------------------+   |
+------------------------------------------------------------+
```

---

## Apps

| App | Port | What It Does | Key Features |
|-----|------|-------------|--------------|
| **Chess** | 3003 | Play chess against an AI opponent | Auto-opponent moves, legal move dots, chess.com colors, confetti on win |
| **Math Practice** | 3001 | Solve math problems by difficulty | Addition/subtraction/multiplication, difficulty levels, progress tracking |
| **Flashcards** | 3004 | Study with AI-generated flashcard decks | LLM generates cards on any topic, flip animation, completion confetti |
| **Google Calendar** | 3002 | View/create/delete/update calendar events | Full OAuth flow (popup), CRUD operations, study plan creation |

Each app is a self-contained Express server with:
- `server/manifest.ts` — Tool definitions (name, description, parameters)
- `server/tools.ts` — Tool execution logic
- `client/index.html` — Interactive UI rendered in an iframe

---

## What Changed From the Fork

### New: Everything in `server/`
The original Chatbox had no backend. We built a full Express server with:
- **Auth** — JWT-based registration/login
- **Chat** — OpenRouter integration with tool calling
- **Tool Router** — Routes LLM tool calls to the correct app server
- **Session Manager** — Tracks app sessions per conversation
- **OAuth Manager** — Google OAuth for calendar integration
- **PostgreSQL** — Conversations, messages, sessions, tool invocations

### New: Everything in `apps/`
Four interactive app servers, each with their own Express API and client-side HTML.

### New: Two-Pass LLM Architecture (`server/src/chat/openrouter.ts`)
The biggest innovation. Instead of streaming text and tool calls simultaneously:
- **Pass 1** (non-streaming): LLM proposes tool calls. No text sent to user.
- **Destructive tools** (calendar delete/update): Queued for confirmation. Response ends. User sees ONLY the confirmation card.
- **Safe tools**: Executed immediately.
- **Pass 2** (streaming): LLM generates user-facing text based on actual tool results.

This eliminates the "Done! I've deleted your event" problem where the LLM claims success before the action is confirmed.

### New: Reliability Stack
- **Dynamic tool scoping** — Only expose tools matching user intent (chess keywords = chess tools only)
- **Code-level guardrails** — Block wrong tool calls even if the LLM proposes them
- **Tool history summarization** — Collapse old tool call/result pairs into plain text so the LLM doesn't pattern-match on stale tool names
- **App context cleaning** — When switching apps, replace stale state with a switching instruction
- **Confirmation UI** — Destructive calendar operations require explicit confirm/cancel

### Modified: Frontend (`src/renderer/`)
- `ChatBridgeChat.tsx` — New chat component with SSE streaming, tool call badges, confirmation cards, suggestion buttons, app panel
- `AppIframe.tsx` — Iframe bridge with postMessage communication, state sync, game-over detection
- `routes/index.tsx` — TutorMeAI entry in sidebar
- `stores/appStore.ts` — Active app state management

### New: Eval Suite (`server/tests/evals/`)
69 evals across 8 categories with Langfuse scoring and a record/replay fixture system.

### New: Dockerfiles
One Dockerfile per service for deployment.

---

## How to Run

### Prerequisites
- Node.js 18+
- PostgreSQL running locally
- pnpm (`npm install -g pnpm`)

### Environment Variables

Create `server/.env`:
```bash
DATABASE_URL=postgresql://localhost:5432/chatbridge
JWT_SECRET=your-secret-here
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=anthropic/claude-sonnet-4

# Google Calendar OAuth (optional)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/apps/oauth/google/callback

# Langfuse (optional, for observability)
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

### Database Setup
```bash
cd server
pnpm install
pnpm run db:migrate
```

### Start Everything
```bash
# Kill any existing processes on our ports
kill $(lsof -ti:3000,3001,3002,3003,3004,1212) 2>/dev/null; sleep 1

# Start app servers
(cd apps/chess && npx tsx watch server/index.ts) &
(cd apps/math-practice && npx tsx watch server/index.ts) &
(cd apps/flashcards && npx tsx watch server/index.ts) &
(cd apps/google-calendar && npx tsx watch server/index.ts) &
sleep 3

# Start main server
(cd server && npx tsx watch src/index.ts) &
sleep 4

# Start frontend
npx serve ./release/app/dist/renderer -l 1212 -s &
```

Open **http://localhost:1212/chatbridge**

### Quick Start Prompts
Once the app is running, try:
- "Let's play chess"
- "Practice math"
- "Quiz me with flashcards about science"
- "Open my calendar"
- "Switch to chess" (while another app is active)

---

## How to Run Evals

### Quick Run (replay mode, $0, ~2s)
```bash
cd server
npm run eval
```

Runs all 69 evals from mocked/recorded fixtures. No API calls, no cost.

### Record Fixtures (after prompt changes, ~$1.20)
```bash
cd server
npm run eval:record
```

Hits the real OpenRouter API, records responses as JSON fixtures in `server/tests/evals/fixtures/`. Future runs replay these for free.

Requires all app servers + main server running (for multi-turn and content safety evals).

### Live Spot-Check (no recording, ~$1.20)
```bash
cd server
npm run eval:live
```

### Run a Single Category
```bash
cd server
npx vitest run tests/evals/adversarial.eval.ts
npx vitest run tests/evals/golden-set.eval.ts
npx vitest run tests/evals/dark.eval.ts
```

### Eval Categories

| Category | Tests | What It Covers |
|----------|:---:|----------------|
| **Happy Path** | 12 | Normal app launches, tool execution, text-after-tools, pure chat |
| **Golden Set** | 18 | Canonical message-to-tool mappings (routing truth table) |
| **Adversarial** | 10 | Prompt injection, jailbreaking, tool hijacking, SQL injection, XSS |
| **Dark** | 11 | Malformed LLM output, app server errors, two-pass violations, edge cases |
| **Concurrency** | 4 | Parallel users, rapid messages, confirm/cancel races |
| **Prompt Regression** | 3 | System prompt mutation detection (required sections present) |
| **Multi-Turn** | 6 | Extended conversations, context drift, app switching (need `record` mode) |
| **Content Safety** | 5 | Age-appropriate responses for kids (need `record` mode) |

### Viewing Results in Langfuse

Every eval logs traces and scores to Langfuse (if configured). Open your Langfuse dashboard to see:
- Pass/fail scores per assertion
- Token usage and latency per LLM call
- Trends across eval runs
- Filter by `tags: ['eval', 'adversarial']` etc.

---

## How to Run E2E Tests

Separate from evals — these test the full server stack with real LLM calls.

```bash
# Requires all servers running
cd server
npm run test:e2e
```

13 tests covering tool routing, state sync, and the two-pass execution flow.

---

## Project Structure

```
chatbox/
|-- apps/
|   |-- chess/                    # Chess app (port 3003)
|   |   |-- client/index.html     # Board UI with legal move dots
|   |   +-- server/              # Express API + Stockfish engine
|   |-- math-practice/           # Math app (port 3001)
|   |   |-- client/index.html    # Problem display + answer input
|   |   +-- server/             # Problem generation + scoring
|   |-- flashcards/              # Flashcards app (port 3004)
|   |   |-- client/index.html    # Flip cards + progress
|   |   +-- server/             # Deck management
|   +-- google-calendar/         # Calendar app (port 3002)
|       |-- client/index.html    # Event list + creation form
|       +-- server/             # Google Calendar API integration
|
|-- server/                      # Main backend (port 3000)
|   |-- src/
|   |   |-- auth/               # JWT auth (register, login, middleware)
|   |   |-- chat/
|   |   |   |-- openrouter.ts   # Two-pass LLM, guardrails, tool scoping
|   |   |   +-- routes.ts       # Chat endpoints, confirm/cancel actions
|   |   |-- apps/
|   |   |   |-- registry.ts     # App registration + tool schema aggregation
|   |   |   |-- tool-router.ts  # Route tool calls to apps, confirmation queue
|   |   |   |-- session.ts      # App session CRUD
|   |   |   +-- oauth-manager.ts # Google OAuth token management
|   |   |-- db/                 # PostgreSQL client + migrations
|   |   |-- lib/
|   |   |   +-- langfuse.ts     # Langfuse singleton + eval helpers
|   |   +-- shared-types/       # TypeScript types shared across apps
|   +-- tests/
|       |-- e2e/                # End-to-end tests (13 tests)
|       +-- evals/              # Eval suite (69 tests)
|           |-- setup.ts        # Mode detection, mock helpers
|           |-- mock-llm.ts     # Hand-crafted LLM response mocks
|           |-- recorder.ts     # Record real LLM responses
|           |-- replayer.ts     # Replay recorded fixtures
|           |-- fixtures/       # Recorded JSON fixtures
|           |-- happy-path.eval.ts
|           |-- golden-set.eval.ts
|           |-- adversarial.eval.ts
|           |-- dark.eval.ts
|           |-- concurrency.eval.ts
|           |-- prompt-regression.eval.ts
|           |-- multi-turn.eval.ts
|           +-- content-safety.eval.ts
|
|-- src/renderer/               # Frontend (React + Mantine, modified from fork)
|   |-- components/
|   |   |-- chatbridge/
|   |   |   |-- ChatBridgeChat.tsx  # Main chat with SSE, tools, confirmation
|   |   |   +-- ChatBridgeAuth.tsx  # Login/register
|   |   +-- app-blocks/
|   |       +-- AppIframe.tsx       # Iframe bridge with postMessage
|   |-- stores/
|   |   +-- appStore.ts            # Active app state
|   +-- routes/index.tsx           # TutorMeAI sidebar entry
|
|-- docs/superpowers/
|   |-- specs/                  # Design specs
|   +-- plans/                  # Implementation plans
|
+-- Dockerfile.*                # One per service
```

---

## Key Technical Decisions

**Why two-pass LLM?** Single-pass streaming sends text + tool calls simultaneously. When we intercept a destructive tool for confirmation, the "Done!" text has already streamed. Two-pass separates tool selection (silent) from text generation (after results are known).

**Why dynamic tool scoping?** If you show the LLM all 15+ tools, it sometimes calls the wrong one ("let's play chess" -> `flashcards_start_deck`). By only exposing tools matching the user's intent keywords, the error rate drops to near zero.

**Why record/replay evals?** LLM evals are expensive (~$1.20/run) and non-deterministic. Recording real responses and replaying them gives deterministic, free tests that catch regressions in our middleware/routing code. Re-record when the prompt changes.

**Why iframes?** Each app has complex UI (chess board, math input, flashcard animations). Iframes isolate their CSS/JS and let them communicate via postMessage. The parent manages state sync to the server.
