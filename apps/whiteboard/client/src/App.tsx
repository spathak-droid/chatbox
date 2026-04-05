import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'

function sendToHost(message: Record<string, unknown>) {
  window.parent.postMessage(message, '*')
}

export default function App() {
  const [initialData, setInitialData] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Send app.ready on mount
  useEffect(() => {
    sendToHost({ type: 'app.ready', appId: 'whiteboard' })
  }, [])

  // Listen for host messages
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data
      if (!msg?.type) return

      switch (msg.type) {
        case 'host.init': {
          const state = msg.state || {}
          if (state.elements && state.elements.length > 0) {
            setInitialData({
              elements: state.elements,
              appState: state.appState || {},
            })
          }
          setReady(true)
          break
        }
        case 'host.state_patch': {
          const patch = msg.patch || {}
          if (patch.elements && apiRef.current) {
            apiRef.current.updateScene({
              elements: patch.elements,
            })
          }
          break
        }
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Debounced onChange — sends state patch to host
  const handleChange = useCallback(
    (elements: readonly any[], appState: any) => {
      if (!ready) return
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        const liveElements = elements.filter((el) => !el.isDeleted)
        sendToHost({
          type: 'app.state_patch',
          state: {
            elements: liveElements,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              zoom: appState.zoom,
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
            },
          },
        })
      }, 1000)
    },
    [ready],
  )

  // Flush pending state on unload
  useEffect(() => {
    const flush = () => {
      if (debounceTimer.current && apiRef.current) {
        clearTimeout(debounceTimer.current)
        const elements = apiRef.current.getSceneElements().filter((el) => !el.isDeleted)
        const appState = apiRef.current.getAppState()
        sendToHost({
          type: 'app.state_patch',
          state: {
            elements,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              zoom: appState.zoom,
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
            },
          },
        })
      }
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
        Loading whiteboard...
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api }}
        initialData={initialData || undefined}
        onChange={handleChange}
        UIOptions={{
          canvasActions: {
            export: false,
            saveToActiveFile: false,
          },
        }}
      />
    </div>
  )
}
