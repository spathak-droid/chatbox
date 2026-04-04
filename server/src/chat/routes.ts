import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { query } from '../db/client.js'
import { streamChatWithTools } from './openrouter.js'
import { getPendingActions, executePendingActions, clearPendingActions } from '../apps/tool-router.js'
import { getSessionsForConversation } from '../apps/session.js'
import { config } from '../config.js'

function sanitizeStateForLLM(appId: string, state: Record<string, unknown>): string {
  const SENSITIVE_KEYS = ['accessToken', 'access_token', 'refreshToken', 'refresh_token', 'platformToken', 'userId', 'user_id', '_refreshTrigger']
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(state)) {
    if (!SENSITIVE_KEYS.includes(key)) {
      clean[key] = value
    }
  }
  switch (appId) {
    case 'chess': {
      const parts: string[] = []
      if (clean.fen) parts.push(`Position: ${clean.fen}`)
      if (clean.moves) parts.push(`Moves played: ${Array.isArray(clean.moves) ? clean.moves.length : clean.moves}`)
      if (clean.gameOver) parts.push(`Game over: ${clean.result || 'unknown'}`)
      if (clean.playerColor) parts.push(`Playing as: ${clean.playerColor}`)
      return parts.length > 0 ? parts.join('. ') : 'Chess game in progress.'
    }
    case 'math-practice': {
      const parts: string[] = []
      if (clean.correct !== undefined) parts.push(`Correct: ${clean.correct}`)
      if (clean.incorrect !== undefined) parts.push(`Incorrect: ${clean.incorrect}`)
      if (clean.topic) parts.push(`Topic: ${clean.topic}`)
      if (clean.currentIndex !== undefined) parts.push(`Problems attempted: ${clean.currentIndex}`)
      return parts.length > 0 ? parts.join('. ') : 'Math session in progress.'
    }
    case 'flashcards': {
      const parts: string[] = []
      if (clean.cardsTotal) parts.push(`Total cards: ${clean.cardsTotal}`)
      if (clean.cardsReviewed !== undefined) parts.push(`Reviewed: ${clean.cardsReviewed}`)
      if (clean.topic) parts.push(`Topic: ${clean.topic}`)
      return parts.length > 0 ? parts.join('. ') : 'Flashcard session in progress.'
    }
    case 'google-calendar': {
      const parts: string[] = []
      if (clean.events && Array.isArray(clean.events)) parts.push(`${clean.events.length} events visible`)
      if (clean.studyBlocks && Array.isArray(clean.studyBlocks)) parts.push(`${clean.studyBlocks.length} study blocks`)
      return parts.length > 0 ? parts.join('. ') : 'Calendar session.'
    }
    default:
      return JSON.stringify(clean).slice(0, 500)
  }
}

export const chatRoutes = Router()

chatRoutes.use(requireAuth)

chatRoutes.post('/send', async (req, res, next) => {
  try {
    const body = z.object({
      conversationId: z.string().uuid().optional(),
      message: z.string().min(1),
      timezone: z.string().optional(),
    }).parse(req.body)

    const userId = req.user!.id

    let conversationId: string = body.conversationId ?? ''
    if (!conversationId) {
      const result = await query(
        'INSERT INTO conversations (user_id) VALUES ($1) RETURNING id',
        [userId]
      )
      conversationId = result.rows[0].id
    }

    await query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversationId, 'user', body.message]
    )

    const historyResult = await query(
      `SELECT role, content, tool_call_id, tool_name, tool_result FROM messages
       WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 50`,
      [conversationId]
    )

    const messages: Array<any> = []
    for (const row of historyResult.rows) {
      if (row.role === 'tool' && row.tool_call_id) {
        messages.push({ role: 'tool', content: row.content, tool_call_id: row.tool_call_id })
      } else if (row.role === 'assistant' && row.tool_result) {
        // Reconstruct assistant message with tool_calls
        try {
          const raw = typeof row.tool_result === 'string' ? JSON.parse(row.tool_result) : row.tool_result
          const toolCalls = (Array.isArray(raw) ? raw : []).map((tc: any) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.args || '{}' },
          }))
          messages.push({ role: 'assistant', content: row.content || '', tool_calls: toolCalls })
        } catch {
          messages.push({ role: 'assistant', content: row.content })
        }
      } else {
        messages.push({ role: row.role, content: row.content })
      }
    }

    // Set SSE headers and send conversationId before streaming
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    res.write(`data: ${JSON.stringify({ type: 'conversation', conversationId })}\n\n`)

    const authToken = (req.headers.authorization || '').replace('Bearer ', '')
    await streamChatWithTools(messages, conversationId, userId, res, authToken, body.timezone)
  } catch (err) {
    if (!res.headersSent) next(err)
  }
})

chatRoutes.get('/conversations', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
        (SELECT content FROM messages WHERE conversation_id = c.id AND role = 'user' ORDER BY created_at DESC LIMIT 1) AS last_message,
        (SELECT COUNT(*)::int FROM messages WHERE conversation_id = c.id AND role IN ('user','assistant')) AS message_count
       FROM conversations c WHERE c.user_id = $1 ORDER BY c.updated_at DESC`,
      [req.user!.id]
    )
    res.json({ conversations: result.rows })
  } catch (err) {
    next(err)
  }
})

chatRoutes.delete('/conversations/:id', async (req, res, next) => {
  try {
    const convId = req.params.id
    const userId = req.user!.id
    // Verify ownership
    const check = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [convId, userId])
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' })
    }
    // Delete dependent rows that lack ON DELETE CASCADE
    await query('DELETE FROM tool_invocations WHERE conversation_id = $1', [convId])
    await query('DELETE FROM app_sessions WHERE conversation_id = $1', [convId])
    // Messages cascade automatically, now delete conversation
    await query('DELETE FROM conversations WHERE id = $1', [convId])
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Sync app state from frontend (when moves happen directly in iframe)
chatRoutes.post('/conversations/:id/sync-app-state', async (req, res, next) => {
  try {
    const { appId, state } = z.object({
      appId: z.string(),
      state: z.record(z.unknown()),
    }).parse(req.body)

    const userId = req.user!.id
    const conversationId = req.params.id

    // Find active session for this app in this conversation
    const sessions = await getSessionsForConversation(conversationId)
    const session = sessions.find(s => s.appId === appId && s.status === 'active')

    if (session) {
      const status = state.gameOver ? 'completed' : 'active'
      const summary = state.gameOver ? String(state.result || 'Game ended') : undefined
      await query(
        `UPDATE app_sessions SET state = $1::jsonb, status = COALESCE($2, status), summary = COALESCE($3, summary), updated_at = NOW() WHERE id = $4`,
        [JSON.stringify(state), status, summary || null, session.id]
      )
    }

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Get pending actions for a conversation
chatRoutes.get('/conversations/:id/pending-actions', requireAuth, (req, res) => {
  const actions = getPendingActions(req.params.id)
  res.json({ actions })
})

// Confirm and execute pending actions
chatRoutes.post('/conversations/:id/confirm-actions', requireAuth, async (req, res, next) => {
  try {
    const authToken = (req.headers.authorization || '').replace('Bearer ', '')
    const results = await executePendingActions(req.params.id, {
      userId: req.user!.id,
      authToken,
    })

    // Generate brief summary via LLM
    let summary = `Done! ${results.length} action(s) completed.`
    try {
      const summaryResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://chatbridge.app',
        },
        body: JSON.stringify({
          model: config.openrouterModel,
          messages: [
            { role: 'system', content: 'You are a friendly tutor assistant. Summarize what happened in 1 short sentence for a student aged 8-14. Be cheerful and brief.' },
            { role: 'user', content: `These calendar actions were completed: ${JSON.stringify(results.map(r => r.summary || r.status))}` },
          ],
          stream: false,
        }),
      })
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json()
        const llmSummary = summaryData.choices?.[0]?.message?.content
        if (llmSummary) summary = llmSummary
      }
    } catch {
      // Fallback to default summary on LLM error
    }

    // Persist the confirmation result as an assistant message
    await query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [req.params.id, 'assistant', summary]
    )

    res.json({ ok: true, results, summary })
  } catch (err) {
    next(err)
  }
})

// Cancel pending actions
chatRoutes.post('/conversations/:id/cancel-actions', requireAuth, (req, res) => {
  clearPendingActions(req.params.id)
  res.json({ ok: true })
})

// Close an app and request LLM farewell summary
chatRoutes.post('/conversations/:id/close-app', requireAuth, async (req, res, next) => {
  try {
    const { appId, appState } = z.object({
      appId: z.string(),
      appState: z.record(z.unknown()).optional(),
    }).parse(req.body)

    const conversationId = req.params.id
    const userId = req.user!.id

    // Mark the session as completed
    const sessions = await getSessionsForConversation(conversationId)
    const session = sessions.find((s: any) => s.appId === appId && s.status === 'active')
    if (session) {
      await query(
        `UPDATE app_sessions SET status = 'completed', summary = 'Closed by user', updated_at = NOW() WHERE id = $1`,
        [session.id]
      )
    }

    // Build sanitized state summary
    const sanitizedState = sanitizeStateForLLM(appId, appState || {})

    // Generate farewell via LLM
    let farewell = ''
    try {
      const farewellResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://chatbridge.app',
        },
        body: JSON.stringify({
          model: config.openrouterModel,
          messages: [
            { role: 'system', content: 'You are TutorMeAI, a friendly tutor for students ages 8-14. The user just closed an app. Give a brief, cheerful 1-2 sentence farewell summarizing what happened. No emojis unless it fits naturally.' },
            { role: 'user', content: `The user closed ${appId}. Session state: ${sanitizedState}` },
          ],
          stream: false,
        }),
      })
      if (farewellResponse.ok) {
        const data = await farewellResponse.json()
        farewell = data.choices?.[0]?.message?.content || ''
      }
    } catch {
      // Fallback — no farewell if LLM fails
    }

    if (farewell) {
      await query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [conversationId, 'assistant', farewell]
      )
    }

    res.json({ ok: true, farewell })
  } catch (err) {
    next(err)
  }
})

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
