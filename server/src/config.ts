// server/src/config.ts
import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/chatbridge',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-20250514',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:1212',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/apps/oauth/google/callback',
  appUrls: {
    mathPractice: process.env.MATH_APP_URL || 'http://localhost:3001',
    googleCalendar: process.env.CALENDAR_APP_URL || 'http://localhost:3002',
    chess: process.env.CHESS_APP_URL || 'http://localhost:3003',
    flashcards: process.env.FLASHCARDS_APP_URL || 'http://localhost:3004',
  },
}
