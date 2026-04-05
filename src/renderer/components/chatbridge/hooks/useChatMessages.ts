import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { CharacterMode } from '../ThinkingCharacter'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:3000/api'

const APP_PREFIX_MAP: Record<string, string> = {
  math_: (import.meta.env.VITE_MATH_APP_URL as string) || 'http://localhost:3001/app',
  calendar_: (import.meta.env.VITE_CALENDAR_APP_URL as string) || 'http://localhost:3002/app',
  chess_: (import.meta.env.VITE_CHESS_APP_URL as string) || 'http://localhost:3003/app',
  flashcards_: (import.meta.env.VITE_FLASHCARDS_APP_URL as string) || 'http://localhost:3004/app',
  whiteboard_: (import.meta.env.VITE_WHITEBOARD_EMBED_URL as string) || 'http://localhost:3005/app',
}

function getAppIframeUrl(toolName: string): string | null {
  for (const [prefix, url] of Object.entries(APP_PREFIX_MAP)) {
    if (toolName.startsWith(prefix)) return url
  }
  return null
}

const APP_ID_MAP: Record<string, string> = {
  math_: 'math-practice',
  calendar_: 'google-calendar',
  chess_: 'chess',
  flashcards_: 'flashcards',
  whiteboard_: 'whiteboard',
}

function getAppIdFromToolName(toolName: string): string | null {
  for (const [prefix, appId] of Object.entries(APP_ID_MAP)) {
    if (toolName.startsWith(prefix)) return appId
  }
  return null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>
  appIframes?: Array<{
    appId: string
    iframeUrl: string
    sessionState: Record<string, unknown>
    appSessionId: string
    trustTier?: string
  }>
}

export interface Conversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
  last_message?: string | null
  message_count?: number
}

export type AppPanelState = {
  appId: string
  iframeUrl: string
  sessionState: Record<string, unknown>
  appSessionId: string
} | null

interface UseChatMessagesParams {
  token: string
  onAppStart: (panel: {
    appId: string
    iframeUrl: string
    sessionState: Record<string, unknown>
    appSessionId: string
    trustTier: string
  }) => void
  onAppRefresh: (appId: string, resultState: Record<string, unknown>) => void
  onPendingConfirmation: (actions: Array<{ id: string; description: string }>) => void
  setCharacterMode: (mode: CharacterMode) => void
  dismissedSessionsRef: React.MutableRefObject<Set<string>>
  setActivePanel: React.Dispatch<React.SetStateAction<AppPanelState>>
  setSecondaryPanel: React.Dispatch<React.SetStateAction<AppPanelState>>
}

export function useChatMessages({
  token,
  onAppStart,
  onAppRefresh,
  onPendingConfirmation,
  setCharacterMode,
  dismissedSessionsRef,
  setActivePanel,
  setSecondaryPanel,
}: UseChatMessagesParams) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [toolExecuting, setToolExecuting] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingConversations, setLoadingConversations] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { setActiveApp } = useAppStore()

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' })
    }, 50)
  }, [])

  // Load conversations
  const loadConversations = useCallback(async () => {
    setLoadingConversations(true)
    try {
      const res = await fetch(`${API_BASE}/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingConversations(false)
    }
  }, [token])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (loading && !streaming && !toolExecuting) {
      setCharacterMode('thinking')
    } else if (toolExecuting) {
      setCharacterMode('tool_executing')
    } else if (streaming) {
      setCharacterMode('streaming')
    } else {
      setCharacterMode('idle')
    }
  }, [loading, streaming, toolExecuting, setCharacterMode])

  // Load messages for a conversation
  const loadConversation = useCallback(
    async (convId: string) => {
      setConversationId(convId)
      setMessages([])
      try {
        const res = await fetch(`${API_BASE}/chat/conversations/${convId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          const allMsgs = data.messages || []
          const loaded: ChatMessage[] = []
          for (const m of allMsgs) {
            if (m.role === 'user') {
              loaded.push({ id: m.id, role: 'user', content: m.content || '' })
            } else if (m.role === 'assistant') {
              // Attach any tool calls that follow this assistant message
              const toolCalls: ChatMessage['toolCalls'] = []
              for (const t of allMsgs) {
                if (t.role === 'tool' && t.tool_name && t.created_at >= m.created_at) {
                  const nextAssistant = allMsgs.find((a: any) => a.role === 'assistant' && a.created_at > m.created_at)
                  if (!nextAssistant || t.created_at < nextAssistant.created_at) {
                    toolCalls.push({ id: t.tool_call_id || t.id, name: t.tool_name, args: t.tool_args || {} })
                  }
                }
              }
              loaded.push({
                id: m.id,
                role: 'assistant',
                content: m.content || '',
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              })
            }
          }
          setMessages(loaded)
          scrollToBottom()
        }
      } catch {
        // Silently fail
      }
    },
    [token, scrollToBottom]
  )

  const startNewChat = useCallback(() => {
    setConversationId(null)
    setMessages([])
    inputRef.current?.focus()
  }, [])

  const deleteConversation = useCallback(async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(`${API_BASE}/chat/conversations/${convId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId))
        if (conversationId === convId) {
          setConversationId(null)
          setMessages([])
        }
      }
    } catch {}
  }, [token, conversationId])

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText || input).trim()
    if (!text) return
    // Only block on loading for user-typed messages, not programmatic tool requests
    if (loading && !overrideText) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    scrollToBottom()

    const assistantMsgId = `assistant-${Date.now()}`
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      appIframes: [],
    }
    setMessages((prev) => [...prev, assistantMsg])

    try {
      const response = await fetch(`${API_BASE}/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: conversationId || undefined,
          message: text,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: `Error: ${errData.error || response.statusText}` } : m
          )
        )
        setLoading(false)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: 'Error: No response body' } : m))
        )
        setLoading(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let assistantText = ''
      const currentToolCalls: ChatMessage['toolCalls'] = []
      const currentAppIframes: ChatMessage['appIframes'] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line === 'data: [DONE]') continue
          if (!line.startsWith('data: ')) continue

          try {
            const event = JSON.parse(line.slice(6))

            switch (event.type) {
              case 'conversation': {
                if (event.conversationId && !conversationId) {
                  setConversationId(event.conversationId)
                }
                break
              }
              case 'text': {
                setStreaming(true)
                setToolExecuting(false)
                assistantText += event.content
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMsgId ? { ...m, content: assistantText } : m))
                )
                scrollToBottom()
                break
              }
              case 'tool_call': {
                setToolExecuting(true)
                setStreaming(false)
                currentToolCalls.push({
                  id: event.toolCallId,
                  name: event.toolName,
                  args: event.args || {},
                })
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, toolCalls: [...currentToolCalls] } : m
                  )
                )
                scrollToBottom()
                break
              }
              case 'tool_result': {
                setToolExecuting(false)
                const toolName = event.toolName
                // Don't create iframe entries for end/finish/cleanup tools
                const isEndTool = /end_game|finish|stop|end_session/.test(toolName)

                // When an end tool fires, close the sidebar and add a close note
                if (isEndTool) {
                  const closedAppId = getAppIdFromToolName(toolName)
                  const appLabel = closedAppId
                    ? closedAppId.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                    : 'App'
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `close-${Date.now()}`,
                      role: 'assistant',
                      content: `\u{1F4CB} ${appLabel} closed.`,
                    },
                  ])
                }

                const iframeUrl = isEndTool ? null : getAppIframeUrl(toolName)
                const appId = getAppIdFromToolName(toolName)

                if (iframeUrl && appId && event.result && event.result.status !== 'error') {
                  const appSessionId = event.result.appSessionId || event.result.sessionId || `session-${Date.now()}`
                  const sessionState = event.result.data || event.result.state || event.result || {}

                  // Auto-close old panel when a different app starts (LLM didn't call end_session)
                  setActivePanel((prev) => {
                    if (prev && prev.appId !== appId) {
                      dismissedSessionsRef.current.add(prev.appSessionId)
                      return null
                    }
                    return prev
                  })
                  setSecondaryPanel(null)

                  const iframe = {
                    appId,
                    iframeUrl,
                    sessionState,
                    appSessionId,
                    trustTier: (event.result?.trustTier as string) || 'internal',
                  }
                  // Replace existing iframe for same app (avoid duplicates)
                  const existingIdx = currentAppIframes.findIndex((f) => f.appId === appId)
                  if (existingIdx >= 0) {
                    currentAppIframes[existingIdx] = iframe
                  } else {
                    currentAppIframes.push(iframe)
                  }
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, appIframes: [...currentAppIframes] } : m
                    )
                  )

                  // Also store in appStore if we have a conversationId
                  const convId = conversationId
                  if (convId) {
                    setActiveApp(convId, {
                      appId,
                      appSessionId,
                      iframeUrl,
                      state: sessionState,
                    })
                  }

                  scrollToBottom()
                }

                // Trigger refresh on active panel when a tool result modifies its app's data
                if (appId && event.result && event.result.status !== 'error') {
                  const resultState = event.result.data || event.result.state || {}
                  setTimeout(() => {
                    setActivePanel((prev) => {
                      if (prev && prev.appId === appId) {
                        return { ...prev, sessionState: { ...prev.sessionState, ...resultState, _refreshTrigger: Date.now() } }
                      }
                      return prev
                    })
                  }, 300)
                }
                break
              }
              case 'pending_confirmation': {
                const actions = event.result?.data?.actions || []
                onPendingConfirmation(actions)
                // Only remove the assistant message if it's truly empty.
                // If it has iframes or tool calls from non-destructive tools in the
                // same batch, keep it — removing it destroys the sidebar panel state.
                setMessages(prev => {
                  const msg = prev.find(m => m.id === assistantMsgId)
                  if (msg && !msg.content && (!msg.toolCalls || msg.toolCalls.length === 0) && (!msg.appIframes || msg.appIframes.length === 0)) {
                    return prev.filter(m => m.id !== assistantMsgId)
                  }
                  return prev
                })
                scrollToBottom()
                break
              }
              case 'error': {
                setCharacterMode('confused')
                setTimeout(() => setCharacterMode('idle'), 3000)
                assistantText += `\n\n**Error:** ${event.error}`
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMsgId ? { ...m, content: assistantText } : m))
                )
                break
              }
            }
          } catch {
            // Skip malformed events
          }
        }
      }

      // Refresh conversations list after sending
      loadConversations()
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: 'Error: Failed to connect to the server. Is the backend running?' }
            : m
        )
      )
    } finally {
      setLoading(false)
      setStreaming(false)
      setToolExecuting(false)
    }
  }, [input, loading, token, conversationId, scrollToBottom, setActiveApp, loadConversations, onPendingConfirmation, setCharacterMode, dismissedSessionsRef, setActivePanel, setSecondaryPanel])

  return {
    messages,
    setMessages,
    input,
    setInput,
    loading,
    streaming,
    toolExecuting,
    conversationId,
    conversations,
    loadingConversations,
    scrollRef,
    viewportRef,
    inputRef,
    scrollToBottom,
    loadConversations,
    loadConversation,
    startNewChat,
    deleteConversation,
    sendMessage,
  }
}
