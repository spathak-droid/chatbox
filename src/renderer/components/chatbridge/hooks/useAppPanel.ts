import { useCallback, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import type { ChatMessage, AppPanelState } from './useChatMessages'
import type { CharacterMode } from '../ThinkingCharacter'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:3000/api'

interface UseAppPanelParams {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  token: string
  conversationId: string | null
  activePanel: AppPanelState
  setActivePanel: React.Dispatch<React.SetStateAction<AppPanelState>>
  secondaryPanel: AppPanelState
  setSecondaryPanel: React.Dispatch<React.SetStateAction<AppPanelState>>
  pendingActions: Array<{ id: string; description: string }>
  setPendingActions: React.Dispatch<React.SetStateAction<Array<{ id: string; description: string }>>>
  isConfirming: boolean
  setIsConfirming: React.Dispatch<React.SetStateAction<boolean>>
  dismissedSessionsRef: React.MutableRefObject<Set<string>>
  setSidebarOpen: (open: boolean) => void
  setCharacterMode: (mode: CharacterMode) => void
  sendMessage: (overrideText?: string) => void
}

export function useAppPanel({
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
}: UseAppPanelParams) {
  // Track latest app state for close-button summary
  const latestAppStateRef = useRef<Record<string, unknown>>({})

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
        // Mark sessions as dismissed so handleGameOver doesn't re-close
        if (activePanel) dismissedSessionsRef.current.add(activePanel.appSessionId)
        if (secondaryPanel) dismissedSessionsRef.current.add(secondaryPanel.appSessionId)
        setActivePanel(null)
        setSecondaryPanel(null)
        return
      }
    }

    // No active iframes found at all
    setActivePanel(null)
    setSecondaryPanel(null)
  }, [messages])

  // Auto-collapse sidebar when an app panel opens, re-open when all panels close
  useEffect(() => {
    if (activePanel || secondaryPanel) {
      setSidebarOpen(false)
    } else {
      setSidebarOpen(true)
    }
  }, [activePanel, secondaryPanel, setSidebarOpen])

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
        signal: AbortSignal.timeout(30_000),
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

        // Merge tool result data into panel state so iframe updates immediately
        // Also include _refreshTrigger so the iframe re-fetches from Google
        const resultData: Record<string, unknown> = {}
        for (const r of (data.results || [])) {
          if (r.data) Object.assign(resultData, r.data)
        }
        const trigger = Date.now()
        const mergedPatch = { ...resultData, _refreshTrigger: trigger }
        setActivePanel((prev) =>
          prev ? { ...prev, sessionState: { ...prev.sessionState, ...mergedPatch } } : prev
        )
        setSecondaryPanel((prev) =>
          prev ? { ...prev, sessionState: { ...prev.sessionState, ...mergedPatch } } : prev
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

    setIsConfirming(false)
  }, [conversationId, token, pendingActions, setMessages, setIsConfirming, setPendingActions, setActivePanel, setSecondaryPanel])

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
      content: 'Cancelled \u2014 no changes were made.',
    }
    setMessages((prev) => [...prev, cancelMsg])
  }, [conversationId, token, setMessages, setPendingActions])

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
        setCharacterMode('celebrating')
        setTimeout(() => setCharacterMode('idle'), 3000)
      }
    },
    [fireConfetti, setCharacterMode]
  )

  const closeApp = useCallback(
    (panel: { appId: string; appSessionId: string; sessionState: Record<string, unknown> }) => {
      // Guard: don't close the same session twice
      if (dismissedSessionsRef.current.has(panel.appSessionId)) return

      const appLabel = panel.appId.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

      // 1. Close panel immediately and clear from split mode
      dismissedSessionsRef.current.add(panel.appSessionId)
      if (activePanel?.appSessionId === panel.appSessionId) {
        setActivePanel(secondaryPanel)
        setSecondaryPanel(null)
      } else if (secondaryPanel?.appSessionId === panel.appSessionId) {
        setSecondaryPanel(null)
      }

      // 2. Show instant close note
      setMessages((prev) => [
        ...prev,
        {
          id: `close-${Date.now()}`,
          role: 'assistant',
          content: `\u{1F4CB} ${appLabel} closed.`,
        },
      ])

      // 3. Fire async LLM farewell via /close-app endpoint — but only if the LLM
      //    didn't already call an end tool (which means it already streamed a farewell)
      const llmAlreadyClosed = messages.some(
        (m) => m.toolCalls?.some((tc) => /end_game|end_session|finish/.test(tc.name))
      )

      if (!llmAlreadyClosed && conversationId) {
        const trackedState = latestAppStateRef.current
        const appState = Object.keys(trackedState).length > 0 ? trackedState : panel.sessionState
        latestAppStateRef.current = {}
        console.log('[closeApp] Requesting farewell for', panel.appId, 'state keys:', Object.keys(appState))
        fetch(`${API_BASE}/chat/conversations/${conversationId}/close-app`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ appId: panel.appId, appState }),
        })
          .then((r) => r.json())
          .then((data) => {
            console.log('[closeApp] Response:', data)
            if (data.farewell) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `farewell-${Date.now()}`,
                  role: 'assistant',
                  content: data.farewell,
                },
              ])
            }
          })
          .catch((err) => console.error('[closeApp] Request failed:', err))
      } else {
        latestAppStateRef.current = {}
      }
    },
    [activePanel, secondaryPanel, conversationId, token, messages, setMessages, setActivePanel, setSecondaryPanel]
  )

  const handleGameOver = useCallback(
    (result: { won: boolean; result?: string }) => {
      if (result.won) {
        fireConfetti()
        setCharacterMode('celebrating')
        setTimeout(() => setCharacterMode('idle'), 3000)
      }
      // Close the panel after a delay so the user sees the final state
      setTimeout(() => {
        if (activePanel) {
          closeApp(activePanel)
        }
      }, 3000)
    },
    [fireConfetti, activePanel, closeApp, setCharacterMode]
  )

  return {
    handleToolRequest,
    fireConfetti,
    confirmActions,
    cancelActions,
    handleStateChange,
    handleGameEvent,
    closeApp,
    handleGameOver,
  }
}
