export class IframeBridge {
  private iframe: HTMLIFrameElement
  private listeners = new Map<string, Set<(msg: any) => void>>()
  private handler: (e: MessageEvent) => void

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe
    this.handler = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return
      const msg = e.data
      if (!msg?.type) return
      const handlers = this.listeners.get(msg.type)
      if (handlers) handlers.forEach((h) => h(msg))
      const all = this.listeners.get('*')
      if (all) all.forEach((h) => h(msg))
    }
    window.addEventListener('message', this.handler)
  }

  send(msg: Record<string, unknown>) {
    this.iframe.contentWindow?.postMessage(msg, '*')
  }

  on(type: string, handler: (msg: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(handler)
  }

  off(type: string, handler: (msg: any) => void) {
    this.listeners.get(type)?.delete(handler)
  }

  destroy() {
    window.removeEventListener('message', this.handler)
    this.listeners.clear()
  }
}
