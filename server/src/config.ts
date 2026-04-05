// server/src/config.ts
import 'dotenv/config'

const isProduction = process.env.NODE_ENV === 'production'

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production')
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/chatbridge',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-only-do-not-use-in-prod',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'google/gemini-3-flash-preview',

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:1212',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/apps/oauth/google/callback',
  appUrls: {
    mathPractice: process.env.MATH_APP_URL || 'http://localhost:3001',
    googleCalendar: process.env.CALENDAR_APP_URL || 'http://localhost:3002',
    chess: process.env.CHESS_APP_URL || 'http://localhost:3003',
    flashcards: process.env.FLASHCARDS_APP_URL || 'http://localhost:3004',
    whiteboard: process.env.WHITEBOARD_APP_URL || 'http://localhost:3005',
  },
  redisUrl: process.env.REDIS_URL || '',
  rateLimitPerMin: parseInt(process.env.RATE_LIMIT_PER_MIN || '15', 10),
  queueConcurrency: parseInt(process.env.QUEUE_CONCURRENCY || '10', 10),
  queueJobTimeout: parseInt(process.env.QUEUE_JOB_TIMEOUT || '120000', 10),
}
