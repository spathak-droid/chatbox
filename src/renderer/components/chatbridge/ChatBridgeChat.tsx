import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Loader,
  NavLink,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconMessage, IconPlus, IconSend, IconTrash, IconX } from '@tabler/icons-react'
import { AppIframe } from '@/components/app-blocks/AppIframe'
import { useAppStore } from '@/stores/appStore'
import confetti from 'canvas-confetti'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:3000/api'

const APP_PREFIX_MAP: Record<string, string> = {
  math_: (import.meta.env.VITE_MATH_APP_URL as string) || 'http://localhost:3001/app',
  calendar_: (import.meta.env.VITE_CALENDAR_APP_URL as string) || 'http://localhost:3002/app',
  chess_: (import.meta.env.VITE_CHESS_APP_URL as string) || 'http://localhost:3003/app',
  flashcards_: (import.meta.env.VITE_FLASHCARDS_APP_URL as string) || 'http://localhost:3004/app',
  mario_: (import.meta.env.VITE_MARIO_APP_URL as string) || 'http://localhost:3005/app',
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
  mario_: 'mario',
}

function getAppIdFromToolName(toolName: string): string | null {
  for (const [prefix, appId] of Object.entries(APP_ID_MAP)) {
    if (toolName.startsWith(prefix)) return appId
  }
  return null
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>
  appIframes?: Array<{
    appId: string
    iframeUrl: string
    sessionState: Record<string, unknown>
    appSessionId: string
  }>
}

interface Conversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
  last_message?: string | null
  message_count?: number
}

interface ChatBridgeChatProps {
  token: string
  user: { id: string; email: string; displayName: string; role: string }
  onLogout: () => void
}

// Inject keyframe animations once
const ANIMATIONS_INJECTED = { done: false }
function injectAnimations() {
  if (ANIMATIONS_INJECTED.done) return
  ANIMATIONS_INJECTED.done = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes thinking-bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }
    @keyframes pulse-glow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(34, 139, 230, 0); }
      50% { box-shadow: 0 0 12px 4px rgba(34, 139, 230, 0.4); }
    }
  `
  document.head.appendChild(style)
}

export function ChatBridgeChat({ token, user, onLogout }: ChatBridgeChatProps) {
  injectAnimations()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
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
                assistantText += event.content
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMsgId ? { ...m, content: assistantText } : m))
                )
                scrollToBottom()
                break
              }
              case 'tool_call': {
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

                  const iframe = {
                    appId,
                    iframeUrl,
                    sessionState,
                    appSessionId,
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
                break
              }
              case 'pending_confirmation': {
                const actions = event.result?.data?.actions || []
                setPendingActions(actions)
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
    }
  }, [input, loading, token, conversationId, scrollToBottom, setActiveApp, loadConversations])

  // Track the active app panel (latest iframe from any message)
  const [pendingActions, setPendingActions] = useState<Array<{ id: string; description: string }>>([])
  const [isConfirming, setIsConfirming] = useState(false)

  const [activePanel, setActivePanel] = useState<{
    appId: string
    iframeUrl: string
    sessionState: Record<string, unknown>
    appSessionId: string
  } | null>(null)

  const [secondaryPanel, setSecondaryPanel] = useState<{
    appId: string
    iframeUrl: string
    sessionState: Record<string, unknown>
    appSessionId: string
  } | null>(null)

  // Track which sessions the user manually dismissed so the effect doesn't re-open them
  const dismissedSessionsRef = useRef<Set<string>>(new Set())

  // Update active panel whenever messages change with new iframes
  useEffect(() => {
    // Scan from newest message backward to find the latest active iframe
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const iframes = msg.appIframes

      if (iframes && iframes.length > 0) {
        const latest = iframes[iframes.length - 1]
        const state = latest.sessionState as Record<string, unknown>

        // If the session is finished/over, skip it
        if (state?.gameOver || state?.finished) {
          continue
        }

        // Don't re-open a session the user manually closed
        if (dismissedSessionsRef.current.has(latest.appSessionId)) {
          continue
        }

        setActivePanel((prev) => {
          // If a different app is already active, push it to secondary (split mode)
          if (prev && prev.appId !== latest.appId && !dismissedSessionsRef.current.has(prev.appSessionId)) {
            setSecondaryPanel(prev)
          }
          if (prev?.appSessionId === latest.appSessionId && prev?.sessionState === latest.sessionState) return prev
          return latest
        })
        return
      }

      // If latest message has end/finish tool calls and no iframes, clear panel
      if (msg.toolCalls?.some(tc => tc.name.includes('end_game') || tc.name.includes('finish') || tc.name.includes('end_session'))) {
        setActivePanel(null)
        setSecondaryPanel(null)
        return
      }
    }

    // No active iframes found at all
    setActivePanel(null)
    setSecondaryPanel(null)
  }, [messages])

  const handleToolRequest = useCallback(
    (request: { tool: string; args: Record<string, unknown> }) => {
      // Send tool request as a chat message directly
      const toolMessage = `[Tool request: ${request.tool}] ${JSON.stringify(request.args)}`
      sendMessage(toolMessage)
    },
    [sendMessage]
  )

  const fireConfetti = useCallback(() => {
    // Left side burst
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { x: 0.1, y: 1 },
      angle: 60,
      colors: ['#ff0', '#0f0', '#00f', '#f0f', '#0ff', '#f00'],
    })
    // Right side burst
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { x: 0.9, y: 1 },
      angle: 120,
      colors: ['#ff0', '#0f0', '#00f', '#f0f', '#0ff', '#f00'],
    })
    // Delayed second wave
    setTimeout(() => {
      confetti({ particleCount: 50, spread: 100, origin: { x: 0.1, y: 1 }, angle: 60 })
      confetti({ particleCount: 50, spread: 100, origin: { x: 0.9, y: 1 }, angle: 120 })
    }, 300)
    setTimeout(() => {
      confetti({ particleCount: 30, spread: 120, origin: { x: 0.15, y: 1 }, angle: 70 })
      confetti({ particleCount: 30, spread: 120, origin: { x: 0.85, y: 1 }, angle: 110 })
    }, 600)
  }, [])

  // Sync board state to server so the LLM can see it
  const confirmActions = useCallback(async () => {
    if (!conversationId) return
    setIsConfirming(true)

    // Build a progress message showing what's being done
    const actionLines = pendingActions.map((a) => {
      const icon = a.description.includes('Delete') ? '\u274C' : a.description.includes('Update') ? '\u270F\uFE0F' : '\u2795'
      return `${icon} ${a.description}`
    }).join('\n')
    const progressMsgId = `progress-${Date.now()}`
    const progressMsg: ChatMessage = {
      id: progressMsgId,
      role: 'assistant',
      content: `Working on it...\n${actionLines}`,
    }
    setMessages((prev) => [...prev, progressMsg])
    setPendingActions([])

    try {
      const res = await fetch(`${API_BASE}/chat/conversations/${conversationId}/confirm-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        // Replace progress message with the final summary
        setMessages((prev) =>
          prev.map((m) =>
            m.id === progressMsgId
              ? { ...m, content: data.summary || `Done! ${data.results?.length || 0} action(s) completed.` }
              : m
          )
        )
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === progressMsgId
              ? { ...m, content: 'Something went wrong while applying changes. Please try again.' }
              : m
          )
        )
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === progressMsgId
            ? { ...m, content: 'Something went wrong while applying changes. Please try again.' }
            : m
        )
      )
    }

    // Trigger sidebar iframe refresh so user doesn't have to click Refresh manually
    setActivePanel((prev) =>
      prev ? { ...prev, sessionState: { ...prev.sessionState, _refreshTrigger: Date.now() } } : prev
    )
    setIsConfirming(false)
  }, [conversationId, token, pendingActions])

  const cancelActions = useCallback(async () => {
    if (!conversationId) return
    await fetch(`${API_BASE}/chat/conversations/${conversationId}/cancel-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    }).catch(() => {})
    setPendingActions([])
    const cancelMsg: ChatMessage = {
      id: `system-${Date.now()}`,
      role: 'assistant',
      content: 'Cancelled — no changes were made.',
    }
    setMessages((prev) => [...prev, cancelMsg])
  }, [conversationId, token])

  // Track latest app state for close-button summary
  const latestAppStateRef = useRef<Record<string, unknown>>({})

  const handleStateChange = useCallback(
    (state: Record<string, unknown>) => {
      latestAppStateRef.current = { ...latestAppStateRef.current, ...state }
      if (!conversationId || !activePanel) return
      fetch(`${API_BASE}/chat/conversations/${conversationId}/sync-app-state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          appId: activePanel.appId,
          state,
        }),
      }).catch(() => {})
    },
    [conversationId, activePanel, token]
  )

  const handleGameEvent = useCallback(
    (event: { type: string; detail: Record<string, unknown> }) => {
      if (event.type === 'level_complete' || event.type === 'game_won') {
        fireConfetti()
      }
    },
    [fireConfetti]
  )

  const closeApp = useCallback(
    (panel: { appId: string; appSessionId: string; sessionState: Record<string, unknown> }) => {
      const appLabel = panel.appId.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

      // 1. Close panel immediately and clear from split mode
      dismissedSessionsRef.current.add(panel.appSessionId)
      if (activePanel?.appSessionId === panel.appSessionId) {
        setActivePanel(secondaryPanel)
        setSecondaryPanel(null)
      } else if (secondaryPanel?.appSessionId === panel.appSessionId) {
        setSecondaryPanel(null)
      }

      // 2. Use latest tracked state for farewell
      const appState = latestAppStateRef.current
      latestAppStateRef.current = {}

      // 3. Request LLM farewell if we have state, otherwise just show close note
      const stateKeys = Object.keys(appState)
      if (stateKeys.length > 0 && conversationId) {
        const stateSummary = JSON.stringify(appState, null, 0)
        sendMessage(`[The user closed the ${panel.appId} app. Here is the final game state: ${stateSummary}. Please give a brief, encouraging summary of how they did and ask if they want to play again or do something else.]`)
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `close-${Date.now()}`,
            role: 'assistant',
            content: `\u{1F4CB} ${appLabel} closed.`,
          },
        ])
      }
    },
    [activePanel, secondaryPanel, conversationId, sendMessage]
  )

  const handleGameOver = useCallback(
    (result: { won: boolean; result?: string }) => {
      if (result.won) {
        fireConfetti()
      }
      // Close the panel after a delay so the user sees the final state
      setTimeout(() => {
        if (activePanel) {
          closeApp(activePanel)
        }
      }, 3000)
    },
    [fireConfetti, activePanel, closeApp]
  )

  return (
    <Flex style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <Box
        style={{
          width: 280,
          minWidth: 280,
          background: 'var(--mantine-color-dark-8)',
          borderRight: '1px solid var(--mantine-color-dark-5)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
        }}
      >
        <Stack gap="xs" p="md" style={{ flex: '0 0 auto' }}>
          <Title order={4} c="white">
            TutorMeAI
          </Title>
          <Button
            leftSection={<IconPlus size={16} />}
            variant="light"
            fullWidth
            onClick={startNewChat}
          >
            New Chat
          </Button>
        </Stack>

        <ScrollArea style={{ flex: 1 }} p="xs">
          {loadingConversations && (
            <Flex justify="center" p="md">
              <Loader size="sm" />
            </Flex>
          )}
          {conversations.map((conv) => (
            <NavLink
              key={conv.id}
              label={
                <Group justify="space-between" wrap="nowrap" gap={4}>
                  <Text size="sm" truncate style={{ flex: 1 }}>{conv.last_message ? conv.last_message.slice(0, 40) + (conv.last_message.length > 40 ? '...' : '') : conv.title || 'New Chat'}</Text>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="gray"
                    onClick={(e) => deleteConversation(conv.id, e)}
                  >
                    <IconTrash size={12} />
                  </ActionIcon>
                </Group>
              }
              description={`${conv.message_count || 0} messages · ${new Date(conv.updated_at || conv.created_at).toLocaleDateString()}`}
              leftSection={<IconMessage size={16} />}
              active={conv.id === conversationId}
              onClick={() => loadConversation(conv.id)}
              style={{ borderRadius: 'var(--mantine-radius-sm)' }}
            />
          ))}
        </ScrollArea>

        <Stack gap="xs" p="md" style={{ flex: '0 0 auto', borderTop: '1px solid var(--mantine-color-dark-5)' }}>
          <Group gap="xs">
            <Avatar size="sm" radius="xl" color="blue">
              {user.displayName?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
            </Avatar>
            <Box style={{ flex: 1, overflow: 'hidden' }}>
              <Text size="sm" c="white" truncate>
                {user.displayName || user.email}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {user.role}
              </Text>
            </Box>
          </Group>
          <Button variant="subtle" size="xs" color="gray" onClick={onLogout}>
            Sign Out
          </Button>
        </Stack>
      </Box>

      {/* Chat area */}
      <Flex direction="column" style={{ flex: 1, minWidth: 0, height: '100vh', background: 'var(--mantine-color-dark-7)' }}>
        {/* Messages */}
        <ScrollArea style={{ flex: 1 }} viewportRef={viewportRef} p="md">
          <Stack gap="md" maw={600} mx="auto" pb="xl">
            {messages.length === 0 && (
              <Stack align="center" justify="center" py="xl" gap="md">
                <Title order={3} c="dimmed">
                  Start a conversation
                </Title>
                <Text size="sm" c="dimmed" ta="center" maw={400}>
                  Ask me anything! Try &quot;let&apos;s play Mario&quot;, &quot;let&apos;s play chess&quot;, or &quot;help me study with flashcards&quot;
                  to launch interactive apps.
                </Text>
              </Stack>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onToolRequest={handleToolRequest} />
            ))}

            {loading && (
              <Flex gap="xs" align="center" px="md">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                  Thinking...
                </Text>
              </Flex>
            )}
          </Stack>
        </ScrollArea>

        {/* Suggestion buttons */}
        <Group gap="xs" px="md" pb={4} pt="xs" className="max-w-4xl mx-auto" style={{ flex: '0 0 auto' }}>
          {[
            { label: 'Play Chess', icon: '\u265E', msg: "Let's play chess" },
            { label: 'Play Mario', icon: '\uD83C\uDF44', msg: "Let's play Mario" },
            { label: 'Practice Math', icon: '\u2795', msg: "Let's practice math" },
            { label: 'Flashcards', icon: '\uD83D\uDCDD', msg: "Let's study with flashcards" },
            { label: 'Calendar', icon: '\uD83D\uDCC5', msg: "Open my calendar" },
          ].map((s) => (
            <Button
              key={s.label}
              size="xs"
              variant="light"
              color="gray"
              radius="xl"
              onClick={() => sendMessage(s.msg)}
              disabled={loading}
              leftSection={<span style={{ fontSize: 14 }}>{s.icon}</span>}
              styles={{ root: { fontWeight: 400 } }}
            >
              {s.label}
            </Button>
          ))}
        </Group>

        {/* Pending confirmation card */}
        {pendingActions.length > 0 && (
          <Paper
            p="md"
            mx="md"
            mb="xs"
            radius="md"
            style={{
              background: 'var(--mantine-color-dark-6)',
              border: '1px solid var(--mantine-color-yellow-8)',
              flex: '0 0 auto',
            }}
          >
            <Text size="sm" fw={600} c="yellow" mb="xs">
              Confirm these changes to your calendar:
            </Text>
            <Stack gap={4} mb="sm">
              {pendingActions.map((a) => (
                <Text key={a.id} size="sm" c="dimmed">
                  {a.description.includes('Delete') ? '\u274C' : a.description.includes('Update') ? '\u270F\uFE0F' : '\u2795'}{' '}
                  {a.description}
                </Text>
              ))}
            </Stack>
            <Group gap="xs">
              <Button size="xs" color="green" onClick={confirmActions} loading={isConfirming} disabled={isConfirming}>
                Confirm
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={cancelActions} disabled={isConfirming}>
                Cancel
              </Button>
            </Group>
          </Paper>
        )}

        {/* Input — matches Chatbox InputBox styling */}
        <Box pt={0} pb="sm" px="sm" style={{ flex: '0 0 auto' }}>
          <Stack className="max-w-4xl mx-auto" gap={4}>
            <Stack
              className="rounded-md px-3 py-2"
              style={{
                background: 'var(--chatbox-background-secondary, var(--mantine-color-dark-7))',
                border: '1px solid var(--chatbox-border-primary, var(--mantine-color-dark-4))',
                minHeight: 92,
              }}
              gap="xs"
              justify="space-between"
            >
              {/* Textarea + send button */}
              <Flex align="flex-end" gap={4}>
                <textarea
                  ref={inputRef as any}
                  placeholder="Type your question here..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  disabled={loading}
                  rows={2}
                  style={{
                    flex: 1,
                    outline: 'none',
                    border: 'none',
                    padding: '4px 8px',
                    resize: 'none',
                    background: 'transparent',
                    color: 'var(--chatbox-tint-primary, var(--mantine-color-text))',
                    lineHeight: '1.5rem',
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
                <ActionIcon
                  size={32}
                  variant="filled"
                  color={loading ? 'dark' : undefined}
                  radius="xl"
                  onClick={() => loading ? null : sendMessage()}
                  disabled={!loading && !input.trim()}
                  className="shrink-0 mb-1"
                  style={!loading && !input.trim()
                    ? { backgroundColor: 'rgba(222, 226, 230, 1)' }
                    : !loading ? { backgroundColor: 'var(--chatbox-tint-brand, #228be6)' } : undefined}
                >
                  {loading ? (
                    <Loader size={16} color="white" />
                  ) : (
                    <IconSend size={16} color="white" />
                  )}
                </ActionIcon>
              </Flex>
              {/* Bottom toolbar — model indicator */}
              <Flex align="center" justify="flex-end" gap="xs" px={4}>
                <Text size="xs" c="dimmed">🎓 TutorMeAI</Text>
              </Flex>
            </Stack>
            <Text size="xs" c="dimmed" ta="center">AI-generated content may be inaccurate. Please verify important information.</Text>
          </Stack>
        </Box>
      </Flex>

      {/* Right panel — active app(s) */}
      {(activePanel || secondaryPanel) && (
        <Box
          style={{
            width: 440,
            minWidth: 440,
            height: '100vh',
            borderLeft: '1px solid var(--mantine-color-dark-5)',
            background: 'var(--mantine-color-dark-8)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Primary panel (new app) */}
          {activePanel && (
            <>
              <Group p="sm" justify="space-between" style={{ flex: '0 0 auto', borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
                <Text size="sm" fw={600} c="white" tt="capitalize">
                  {activePanel.appId.replace(/-/g, ' ')}
                </Text>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => closeApp(activePanel)}>
                  <IconX size={14} />
                </ActionIcon>
              </Group>
              <Box style={{ flex: 1, padding: 8, minHeight: 0 }}>
                <AppIframe
                  appId={activePanel.appId}
                  iframeUrl={activePanel.iframeUrl}
                  sessionState={activePanel.sessionState}
                  appSessionId={activePanel.appSessionId}
                  onToolRequest={handleToolRequest}
                  onGameOver={handleGameOver}
                  onStateChange={handleStateChange}
                  onGameEvent={handleGameEvent}
                  platformToken={token}
                  fillHeight
                />
              </Box>
            </>
          )}

          {/* Split mode warning + secondary panel (old app that wasn't closed) */}
          {secondaryPanel && (
            <>
              <Box px="sm" py={6} style={{ background: 'var(--mantine-color-yellow-9)', flex: '0 0 auto' }}>
                <Text size="xs" c="white" ta="center">
                  Two apps open — close one using the X button
                </Text>
              </Box>
              <Group p="sm" justify="space-between" style={{ flex: '0 0 auto', borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
                <Text size="sm" fw={600} c="white" tt="capitalize">
                  {secondaryPanel.appId.replace(/-/g, ' ')}
                </Text>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => closeApp(secondaryPanel)}>
                  <IconX size={14} />
                </ActionIcon>
              </Group>
              <Box style={{ flex: 1, padding: 8, minHeight: 0 }}>
                <AppIframe
                  appId={secondaryPanel.appId}
                  iframeUrl={secondaryPanel.iframeUrl}
                  sessionState={secondaryPanel.sessionState}
                  appSessionId={secondaryPanel.appSessionId}
                  onToolRequest={handleToolRequest}
                  onGameOver={handleGameOver}
                  onStateChange={handleStateChange}
                  onGameEvent={handleGameEvent}
                  platformToken={token}
                  fillHeight
                />
              </Box>
            </>
          )}
        </Box>
      )}
    </Flex>
  )
}

function MessageBubble({
  message,
  onToolRequest,
}: {
  message: ChatMessage
  onToolRequest: (req: { tool: string; args: Record<string, unknown> }) => void
}) {
  const isUser = message.role === 'user'

  if (isUser) {
    // User message — gray pill with avatar, right-aligned
    return (
      <Flex gap="sm" align="flex-start" justify="flex-end" px="md" py="xs">
        <Box
          className="rounded-2xl px-4 py-2"
          style={{
            background: 'var(--chatbox-background-secondary, var(--mantine-color-dark-6))',
          }}
        >
          <Text size="sm" c="chatbox-primary" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.content}
          </Text>
        </Box>
        <Avatar size={36} radius="xl" color="blue" className="shrink-0">
          <IconMessage size={18} />
        </Avatar>
      </Flex>
    )
  }

  // Assistant message — avatar + text, no bubble background, like Chatbox
  const isThinking = !message.content && (!message.toolCalls || message.toolCalls.length === 0)
  const isStreaming = !!message.content && message.content.length > 0 && !message.content.endsWith('\n\n')

  return (
    <Flex gap="sm" align="flex-start" px="md" py="xs">
      <Avatar
        size={36}
        radius="xl"
        color="green"
        className="shrink-0"
        style={isThinking ? {
          animation: 'pulse-glow 1.5s ease-in-out infinite',
        } : undefined}
      >
        🎓
      </Avatar>
      <Box style={{ flex: 1, wordBreak: 'break-word' }}>
        {isThinking ? (
          <Flex gap={6} align="center" py={4}>
            <Box className="thinking-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--chatbox-tint-brand, #228be6)', animation: 'thinking-bounce 1.4s ease-in-out infinite', animationDelay: '0s' }} />
            <Box className="thinking-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--chatbox-tint-brand, #228be6)', animation: 'thinking-bounce 1.4s ease-in-out infinite', animationDelay: '0.2s' }} />
            <Box className="thinking-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--chatbox-tint-brand, #228be6)', animation: 'thinking-bounce 1.4s ease-in-out infinite', animationDelay: '0.4s' }} />
          </Flex>
        ) : (
          <Text size="sm" c="chatbox-primary" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {message.content}
          </Text>
        )}

        {/* Tool call indicators */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <Flex gap={4} mt="xs" wrap="wrap">
            {message.toolCalls.map((tc) => (
              <Badge key={tc.id} size="xs" variant="light" color="gray" radius="sm">
                {tc.name}
              </Badge>
            ))}
          </Flex>
        )}
      </Box>
    </Flex>
  )
}
