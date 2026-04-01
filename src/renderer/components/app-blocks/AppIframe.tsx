import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Loader, Paper, Text } from '@mantine/core'
import { IframeBridge } from '@/packages/apps/iframe-bridge'

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
  const bridgeRef = useRef<IframeBridge | null>(null)
  const [loading, setLoading] = useState(true)
  const [iframeHeight, setIframeHeight] = useState(400)
  const [error, setError] = useState<string | null>(null)

  const handleReady = useCallback(() => {
    bridgeRef.current?.send({
      type: 'host.init',
      appId,
      appSessionId,
      state: sessionState,
    })
    setLoading(false)
  }, [appId, appSessionId, sessionState])

  const handleResize = useCallback((msg: { height?: number }) => {
    if (typeof msg.height === 'number' && msg.height > 0) {
      setIframeHeight(msg.height)
    }
  }, [])

  const handleComplete = useCallback((msg: { result?: Record<string, unknown> }) => {
    onComplete?.(msg.result ?? {})
  }, [onComplete])

  const handleToolRequest = useCallback((msg: { tool?: string; args?: Record<string, unknown> }) => {
    if (msg.tool) {
      onToolRequest?.({ tool: msg.tool, args: msg.args ?? {} })
    }
  }, [onToolRequest])

  const handleError = useCallback((msg: { error?: string }) => {
    setError(msg.error ?? 'Unknown app error')
  }, [])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const bridge = new IframeBridge(iframe)
    bridgeRef.current = bridge

    bridge.on('app.ready', handleReady)
    bridge.on('app.resize', handleResize)
    bridge.on('app.complete', handleComplete)
    bridge.on('app.tool_request', handleToolRequest)
    bridge.on('app.error', handleError)

    return () => {
      bridge.destroy()
      bridgeRef.current = null
    }
  }, [handleReady, handleResize, handleComplete, handleToolRequest, handleError])

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
