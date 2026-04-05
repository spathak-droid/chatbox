import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'

function sendToHost(message: Record<string, unknown>) {
  window.parent.postMessage(message, '*')
}

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialDataRef = useRef<any>(null)
  const readyRef = useRef(false)

  // Send app.ready on mount + listen for host messages
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data
      if (!msg?.type) return

      if (msg.type === 'host.init') {
        const state = msg.state || {}
        if (state.elements && state.elements.length > 0 && apiRef.current) {
          apiRef.current.updateScene({
            elements: state.elements,
            appState: state.appState || {},
          })
        }
        readyRef.current = true
      }

      if (msg.type === 'host.state_patch') {
        const patch = msg.patch || {}
        if (patch.elements && apiRef.current) {
          apiRef.current.updateScene({ elements: patch.elements })
        }
      }
    }

    window.addEventListener('message', handler)
    sendToHost({ type: 'app.ready', appId: 'whiteboard' })
    return () => window.removeEventListener('message', handler)
  }, [])

  // Debounced onChange — sends state patch to host
  const handleChange = useCallback((elements: readonly any[], appState: any) => {
    if (!readyRef.current) return
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
  }, [])

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

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api }}
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
