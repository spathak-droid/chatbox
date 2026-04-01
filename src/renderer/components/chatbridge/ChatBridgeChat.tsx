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
import { IconMessage, IconPlus, IconSend } from '@tabler/icons-react'
import { AppIframe } from '@/components/app-blocks/AppIframe'
import { useAppStore } from '@/stores/appStore'

const API_BASE = 'http://localhost:3000/api'

const APP_PREFIX_MAP: Record<string, string> = {
  math_: 'http://localhost:3001/app',
  calendar_: 'http://localhost:3002/app',
  chess_: 'http://localhost:3003/app',
  flashcards_: 'http://localhost:3004/app',
}

function getAppIframeUrl(toolName: string): string | null {
  for (const [prefix, url] of Object.entries(APP_PREFIX_MAP)) {
    if (toolName.startsWith(prefix)) return url
  }
  return null
}

function getAppIdFromToolName(toolName: string): string | null {
  for (const prefix of Object.keys(APP_PREFIX_MAP)) {
    if (toolName.startsWith(prefix)) return prefix.replace('_', '')
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
}

interface ChatBridgeChatProps {
  token: string
  user: { id: string; email: string; displayName: string; role: string }
  onLogout: () => void
}

export function ChatBridgeChat({ token, user, onLogout }: ChatBridgeChatProps) {
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
          const loaded: ChatMessage[] = (data.messages || [])
            .filter((m: any) => m.role === 'user' || m.role === 'assistant')
            .map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content || '',
            }))
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

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

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
                const iframeUrl = getAppIframeUrl(toolName)
                const appId = getAppIdFromToolName(toolName)

                if (iframeUrl && appId && event.result) {
                  const appSessionId = event.result.appSessionId || event.result.sessionId || `session-${Date.now()}`
                  const sessionState = event.result.state || event.result || {}

                  const iframe = {
                    appId,
                    iframeUrl,
                    sessionState,
                    appSessionId,
                  }
                  currentAppIframes.push(iframe)
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

  const handleToolRequest = useCallback(
    (request: { tool: string; args: Record<string, unknown> }) => {
      // Send tool request as a chat message
      const toolMessage = `[Tool request: ${request.tool}] ${JSON.stringify(request.args)}`
      setInput(toolMessage)
    },
    []
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
              label={conv.title || 'Untitled Chat'}
              description={new Date(conv.created_at).toLocaleDateString()}
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
      <Flex direction="column" style={{ flex: 1, height: '100vh', background: 'var(--mantine-color-dark-7)' }}>
        {/* Messages */}
        <ScrollArea style={{ flex: 1 }} viewportRef={viewportRef} p="md">
          <Stack gap="md" maw={800} mx="auto" pb="xl">
            {messages.length === 0 && (
              <Stack align="center" justify="center" py="xl" gap="md">
                <Title order={3} c="dimmed">
                  Start a conversation
                </Title>
                <Text size="sm" c="dimmed" ta="center" maw={400}>
                  Ask me anything! Try &quot;let&apos;s practice math&quot; or &quot;help me study with flashcards&quot;
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

        {/* Input */}
        <Box
          p="md"
          style={{
            borderTop: '1px solid var(--mantine-color-dark-5)',
            flex: '0 0 auto',
          }}
        >
          <Flex gap="sm" maw={800} mx="auto">
            <TextInput
              ref={inputRef}
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              style={{ flex: 1 }}
              disabled={loading}
              size="md"
            />
            <ActionIcon
              size="lg"
              variant="filled"
              color="blue"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              h={42}
              w={42}
            >
              <IconSend size={18} />
            </ActionIcon>
          </Flex>
        </Box>
      </Flex>
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

  return (
    <Stack gap="xs">
      <Flex justify={isUser ? 'flex-end' : 'flex-start'} gap="sm" align="flex-start">
        {!isUser && (
          <Avatar size="sm" radius="xl" color="violet" mt={4}>
            AI
          </Avatar>
        )}
        <Paper
          shadow="xs"
          p="sm"
          radius="md"
          maw="75%"
          style={{
            background: isUser ? 'var(--mantine-color-blue-7)' : 'var(--mantine-color-dark-6)',
          }}
        >
          <Text
            size="sm"
            c="white"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {message.content || (message.toolCalls?.length ? '' : '...')}
          </Text>

          {/* Tool call indicators */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <Stack gap={4} mt="xs">
              {message.toolCalls.map((tc) => (
                <Badge key={tc.id} size="sm" variant="outline" color="cyan">
                  Calling {tc.name}...
                </Badge>
              ))}
            </Stack>
          )}
        </Paper>
        {isUser && (
          <Avatar size="sm" radius="xl" color="blue" mt={4}>
            U
          </Avatar>
        )}
      </Flex>

      {/* App iframes */}
      {message.appIframes && message.appIframes.length > 0 && (
        <Stack gap="sm" ml={40}>
          {message.appIframes.map((iframe, idx) => (
            <AppIframe
              key={`${iframe.appSessionId}-${idx}`}
              appId={iframe.appId}
              iframeUrl={iframe.iframeUrl}
              sessionState={iframe.sessionState}
              appSessionId={iframe.appSessionId}
              onToolRequest={onToolRequest}
            />
          ))}
        </Stack>
      )}
    </Stack>
  )
}
