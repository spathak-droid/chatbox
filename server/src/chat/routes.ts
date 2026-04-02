import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/middleware.js'
import { query } from '../db/client.js'
import { streamChatWithTools } from './openrouter.js'
import { getPendingActions, executePendingActions, clearPendingActions } from '../apps/tool-router.js'
import { getSessionsForConversation } from '../apps/session.js'
import { config } from '../config.js'

export const chatRoutes = Router()

chatRoutes.use(requireAuth)

chatRoutes.post('/send', async (req, res, next) => {
  try {
    const body = z.object({
      conversationId: z.string().uuid().optional(),
      message: z.string().min(1),
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

    const messages = historyResult.rows.map((row: any) => {
      if (row.role === 'tool' && row.tool_call_id) {
        return { role: 'tool' as const, content: row.content, tool_call_id: row.tool_call_id }
      }
      return { role: row.role as 'system' | 'user' | 'assistant', content: row.content }
    })

    // Set SSE headers and send conversationId before streaming
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    res.write(`data: ${JSON.stringify({ type: 'conversation', conversationId })}\n\n`)

    const authToken = (req.headers.authorization || '').replace('Bearer ', '')
    await streamChatWithTools(messages, conversationId, userId, res, authToken)
  } catch (err) {
    if (!res.headersSent) next(err)
  }
})

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
