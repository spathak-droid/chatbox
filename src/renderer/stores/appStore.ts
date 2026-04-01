import { create } from 'zustand'

interface ActiveApp {
  appId: string
  appSessionId: string
  iframeUrl: string
  state: Record<string, unknown>
}

interface AppStoreState {
  activeApps: Record<string, ActiveApp>
  setActiveApp: (conversationId: string, app: ActiveApp) => void
  updateAppState: (conversationId: string, patch: Record<string, unknown>) => void
  clearApp: (conversationId: string) => void
  getActiveApp: (conversationId: string) => ActiveApp | undefined
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  activeApps: {},
  setActiveApp: (conversationId, app) => set((s) => ({
    activeApps: { ...s.activeApps, [conversationId]: app },
  })),
  updateAppState: (conversationId, patch) => set((s) => {
    const existing = s.activeApps[conversationId]
    if (!existing) return s
    return { activeApps: { ...s.activeApps, [conversationId]: { ...existing, state: { ...existing.state, ...patch } } } }
  }),
  clearApp: (conversationId) => set((s) => {
    const { [conversationId]: _, ...rest } = s.activeApps
    return { activeApps: rest }
  }),
  getActiveApp: (conversationId) => get().activeApps[conversationId],
}))
