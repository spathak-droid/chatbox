import { useEffect, useRef, useState } from 'react'
import { Box, Loader, Paper, Text } from '@mantine/core'

interface AppIframeProps {
  appId: string
  iframeUrl: string
  sessionState: Record<string, unknown>
  appSessionId: string
  onComplete?: (result: Record<string, unknown>) => void
  onToolRequest?: (request: { tool: string; args: Record<string, unknown> }) => void
}

export function AppIframe({
  appId,
  iframeUrl,
  sessionState,
  appSessionId,
  onComplete,
  onToolRequest,
}: AppIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loading, setLoading] = useState(true)
  const [iframeHeight, setIframeHeight] = useState(450)
  const [error, setError] = useState<string | null>(null)
  const sentInit = useRef(false)
  const stateRef = useRef(sessionState)
  stateRef.current = sessionState

  // Single stable message handler — no deps that cause re-creation
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handler = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return
      const msg = e.data
      if (!msg?.type) return

      switch (msg.type) {
        case 'app.ready': {
          // Send init with current state
          iframe.contentWindow?.postMessage({
            type: 'host.init',
            appSessionId,
            state: stateRef.current,
          }, '*')
          sentInit.current = true
          setLoading(false)
          break
        }
        case 'app.resize': {
          if (typeof msg.height === 'number' && msg.height > 50) {
            setIframeHeight(Math.min(msg.height, 600))
          }
          break
        }
        case 'app.complete': {
          onComplete?.(msg.result ?? { summary: msg.summary })
          break
        }
        case 'app.tool_request': {
          const toolName = msg.toolName || msg.tool
          if (toolName) {
            onToolRequest?.({ tool: toolName, args: msg.args ?? {} })
          }
          break
        }
        case 'app.state_patch': {
          // App sent a state update
          break
        }
        case 'app.error': {
          setError(msg.error ?? 'Unknown app error')
          break
        }
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [appSessionId]) // Only recreate if session changes, NOT on every state change

  // If state updates after init was sent, push a patch
  useEffect(() => {
    if (sentInit.current && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'host.state_patch',
        patch: sessionState,
      }, '*')
    }
  }, [sessionState])

  return (
    <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden', position: 'relative' }}>
      {loading && (
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
            background: 'var(--mantine-color-body)',
          }}
        >
          <Loader size="sm" />
        </Box>
      )}
      {error && (
        <Box p="sm">
          <Text c="red" size="sm">
            App error: {error}
          </Text>
        </Box>
      )}
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        sandbox="allow-scripts allow-popups allow-same-origin"
        style={{
          width: '100%',
          height: iframeHeight,
          border: 'none',
          display: 'block',
        }}
        title={`App: ${appId}`}
      />
    </Paper>
  )
}
