import {
  Avatar,
  Badge,
  Box,
  Flex,
  Text,
} from '@mantine/core'
import { IconMessage } from '@tabler/icons-react'

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
    trustTier?: string
  }>
}

export function MessageBubble({
  message,
  onToolRequest,
}: {
  message: ChatMessage
  onToolRequest: (req: { tool: string; args: Record<string, unknown> }) => void
}) {
  const isUser = message.role === 'user'

  if (isUser) {
    // User message — blue pill, right-aligned
    return (
      <Flex gap="sm" align="flex-start" justify="flex-end" px="md" py="xs">
        <Box
          className="rounded-2xl px-4 py-2"
          style={{
            background: '#228be6',
          }}
        >
          <Text size="sm" c="white" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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
        {/* Tool call indicators — outside the box */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <Flex gap={4} mb={6} wrap="wrap">
            {message.toolCalls.map((tc) => (
              <Badge key={tc.id} size="xs" variant="light" color="gray" radius="sm">
                {tc.name}
              </Badge>
            ))}
          </Flex>
        )}

        {isThinking ? (
          <Flex gap={6} align="center" py={4}>
            <Box className="thinking-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--chatbox-tint-brand, #228be6)', animation: 'thinking-bounce 1.4s ease-in-out infinite', animationDelay: '0s' }} />
            <Box className="thinking-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--chatbox-tint-brand, #228be6)', animation: 'thinking-bounce 1.4s ease-in-out infinite', animationDelay: '0.2s' }} />
            <Box className="thinking-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--chatbox-tint-brand, #228be6)', animation: 'thinking-bounce 1.4s ease-in-out infinite', animationDelay: '0.4s' }} />
          </Flex>
        ) : message.content ? (
          <Box
            className="rounded-2xl px-4 py-2"
            style={{
              background: 'var(--chatbox-background-secondary, var(--mantine-color-dark-6))',
              display: 'inline-block',
            }}
          >
            <Text size="sm" c="chatbox-primary" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {message.content}
            </Text>
          </Box>
        ) : null}
      </Box>
    </Flex>
  )
}
