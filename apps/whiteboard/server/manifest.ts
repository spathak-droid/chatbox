const baseUrl = process.env.WHITEBOARD_BASE_URL || 'http://localhost:3005'

export const manifest = {
  id: 'whiteboard',
  name: 'Whiteboard',
  description: 'Open a whiteboard powered by Excalidraw where students can draw, diagram, brainstorm, and sketch visually. Features an infinite canvas with drawing tools, shapes, arrows, text, colors, and more. No login required.',
  category: 'productivity' as const,
  authType: 'none' as const,
  baseUrl,
  trustTier: 'internal' as const,
  iframeUrl: `${baseUrl}/app`,
  permissions: [],
  activationKeywords: ['whiteboard', 'draw', 'diagram', 'sketch', 'brainstorm', 'collab board', 'collaborative board'],
  tools: [
    {
      name: 'whiteboard_open',
      description: 'Open the collaborative whiteboard. Use this when the student wants to draw, sketch, diagram, brainstorm visually, or use a whiteboard. The whiteboard opens in the side panel and the student can interact with it directly.',
      parameters: [],
    },
    {
      name: 'whiteboard_close',
      description: 'Close the whiteboard. Call when the student is done using the whiteboard or wants to switch to a different app.',
      parameters: [],
    },
  ],
}
