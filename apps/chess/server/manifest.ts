const baseUrl = process.env.CHESS_BASE_URL || 'http://localhost:3003'

export const manifest = {
  id: 'chess',
  name: 'Chess',
  description: 'Play chess against the AI. Interactive board with full rule enforcement.',
  category: 'game' as const,
  authType: 'none' as const,
  baseUrl,
  iframeUrl: `${baseUrl}/app`,
  permissions: [],
  activationKeywords: ['chess', 'play a game', 'play$'],
  tools: [
    {
      name: 'chess_start_game',
      description: 'Start a new chess game. ONLY call this when the user wants to play chess. Do NOT call for math, flashcards, or any other app.',
      parameters: [
        { name: 'playerColor', type: 'string' as const, description: 'Color the player wants to play as. Defaults to white.', required: false, enum: ['white', 'black'] },
        { name: 'difficulty', type: 'string' as const, description: 'AI difficulty level. Defaults to medium.', required: false, enum: ['easy', 'medium', 'hard'] },
      ],
    },
    {
      name: 'chess_submit_move',
      description: 'Submit a chess move. Accepts SAN (e.g., "e4", "Nf3", "O-O") or UCI (e.g., "e2e4") format.',
      parameters: [
        { name: 'move', type: 'string' as const, description: 'The move in SAN or UCI format.', required: true },
      ],
    },
    {
      name: 'chess_get_hint',
      description: 'Get the current board state and legal moves for AI analysis.',
      parameters: [],
    },
    {
      name: 'chess_end_game',
      description: 'End the current chess game. Call this when the user wants to stop playing chess or switch to a different app.',
      parameters: [],
    },
  ],
}
