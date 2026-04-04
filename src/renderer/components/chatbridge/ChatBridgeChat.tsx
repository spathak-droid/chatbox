import { useRef, useState } from 'react'
import {
  ActionIcon,
  Avatar,
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
  Title,
} from '@mantine/core'
import { IconMenu2, IconMessage, IconPlus, IconSend, IconTrash, IconX } from '@tabler/icons-react'
import { AppIframe } from '@/components/app-blocks/AppIframe'
import { ThinkingCharacter, type CharacterMode } from './ThinkingCharacter'
import { MessageBubble } from './MessageBubble'
import { useChatMessages, type AppPanelState } from './hooks/useChatMessages'
import { useAppPanel } from './hooks/useAppPanel'

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
  const [characterMode, setCharacterMode] = useState<CharacterMode>('idle')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // App panel state (declared before useChatMessages because sendMessage needs these)
  const [pendingActions, setPendingActions] = useState<Array<{ id: string; description: string }>>([])
  const [isConfirming, setIsConfirming] = useState(false)
  const [activePanel, setActivePanel] = useState<AppPanelState>(null)
  const [secondaryPanel, setSecondaryPanel] = useState<AppPanelState>(null)
  const dismissedSessionsRef = useRef<Set<string>>(new Set())

  const {
    messages,
    setMessages,
    input,
    setInput,
    loading,
    conversationId,
    conversations,
    loadingConversations,
    viewportRef,
    inputRef,
    loadConversation,
    startNewChat,
    deleteConversation,
    sendMessage,
  } = useChatMessages({
    token,
    onAppStart: () => {},
    onAppRefresh: () => {},
    onPendingConfirmation: setPendingActions,
    setCharacterMode,
    dismissedSessionsRef,
    setActivePanel,
    setSecondaryPanel,
  })

  const {
    handleToolRequest,
    confirmActions,
    cancelActions,
    handleStateChange,
    handleGameEvent,
    closeApp,
    handleGameOver,
  } = useAppPanel({
    messages,
    setMessages,
    token,
    conversationId,
    activePanel,
    setActivePanel,
    secondaryPanel,
    setSecondaryPanel,
    pendingActions,
    setPendingActions,
    isConfirming,
    setIsConfirming,
    dismissedSessionsRef,
    setSidebarOpen,
    setCharacterMode,
    sendMessage,
  })

  return (
    <Flex style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <Box
        style={{
          width: sidebarOpen ? 280 : 0,
          minWidth: sidebarOpen ? 280 : 0,
          background: 'var(--mantine-color-dark-8)',
          borderRight: sidebarOpen ? '1px solid var(--mantine-color-dark-5)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          transition: 'width 0.2s ease, min-width 0.2s ease',
        }}
      >
        <Stack gap="xs" p="md" style={{ flex: '0 0 auto' }}>
          <Group justify="space-between">
            <Title order={4} c="white">
              TutorMeAI
            </Title>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setSidebarOpen(false)}>
              <IconX size={16} />
            </ActionIcon>
          </Group>
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
      <Flex ref={chatContainerRef} direction="column" style={{ flex: 1, minWidth: 0, height: '100vh', background: 'var(--mantine-color-dark-7)', position: 'relative' }}>
        {/* Hamburger to toggle sidebar */}
        {!sidebarOpen && (
          <Box px="sm" pt="sm" style={{ flex: '0 0 auto' }}>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setSidebarOpen(true)}>
              <IconMenu2 size={18} />
            </ActionIcon>
          </Box>
        )}
        {/* Messages */}
        <ScrollArea style={{ flex: 1 }} viewportRef={viewportRef} p="md">
            <Stack gap="md" maw={600} mx="auto" pb="xl">
              {messages.length === 0 && (
                <Stack align="center" justify="center" py="xl" gap="md">
                  <Title order={3} c="dimmed">
                    Start a conversation
                  </Title>
                  <Text size="sm" c="dimmed" ta="center" maw={400}>
                    Ask me anything! Try &quot;let&apos;s play chess&quot;, &quot;help me study with flashcards&quot;, or &quot;open the whiteboard&quot;
                    to launch interactive apps.
                  </Text>
                </Stack>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onToolRequest={handleToolRequest} />
              ))}
            </Stack>
        </ScrollArea>
        <ThinkingCharacter mode={characterMode} containerRef={chatContainerRef} />

        {/* Suggestion buttons */}
        <Group gap="xs" px="md" pb={4} pt="xs" wrap="wrap" className="max-w-4xl mx-auto" style={{ flex: '0 0 auto' }}>
          {[
            { label: 'Play Chess', icon: '\u265E', msg: "Let's play chess" },
            { label: 'Practice Math', icon: '\u2795', msg: "Let's practice math" },
            { label: 'Flashcards', icon: '\uD83D\uDCDD', msg: "Let's study with flashcards" },
            { label: 'Calendar', icon: '\uD83D\uDCC5', msg: "Open my calendar" },
            { label: 'Whiteboard', icon: '\uD83C\uDFA8', msg: "Open the whiteboard" },
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
            width: 600,
            minWidth: 600,
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
                  trustTier={(activePanel as any).trustTier || 'internal'}
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
                  trustTier={(secondaryPanel as any).trustTier || 'internal'}
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
