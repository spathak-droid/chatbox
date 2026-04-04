import { query } from '../db/client.js'

const UNSAFE_PATTERNS: Array<{ pattern: RegExp; category: string; reason: string }> = [
  { pattern: /\b(kill\s+yourself|suicide|self-harm|cut yourself)\b/i, category: 'self_harm', reason: 'Contains self-harm content' },
  { pattern: /\b(sex|porn|nude|naked|intercourse|masturbat)/i, category: 'sexual', reason: 'Contains sexual content' },
  { pattern: /\b(cocaine|heroin|meth|fentanyl)\b/i, category: 'drugs', reason: 'Contains hard drug references' },
  { pattern: /\b(fuck|shit|bitch|asshole|bastard)\b/i, category: 'profanity', reason: 'Contains profanity' },
]

interface ModerationResult {
  safe: boolean
  category?: string
  reason?: string
}

export function moderateContent(text: string): ModerationResult {
  for (const { pattern, category, reason } of UNSAFE_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, category, reason }
    }
  }
  return { safe: true }
}

/** Stream moderator — checks accumulated text periodically */
export class StreamModerator {
  private buffer = ''
  private flagged = false
  private flagCategory = ''

  addChunk(chunk: string): { safe: boolean; category?: string } {
    if (this.flagged) return { safe: false, category: this.flagCategory }
    this.buffer += chunk
    // Check every ~100 chars to avoid per-token overhead
    if (this.buffer.length % 100 < chunk.length) {
      const result = moderateContent(this.buffer)
      if (!result.safe) {
        this.flagged = true
        this.flagCategory = result.category || 'unknown'
        return { safe: false, category: result.category }
      }
    }
    return { safe: true }
  }

  finalCheck(): ModerationResult {
    if (this.flagged) return { safe: false, category: this.flagCategory, reason: 'Previously flagged' }
    return moderateContent(this.buffer)
  }

  getBuffer(): string {
    return this.buffer
  }
}

/** Log a moderation event to the database */
export async function logModerationEvent(
  conversationId: string,
  userId: string,
  category: string,
  flaggedContent: string,
  action: 'blocked' | 'flagged',
) {
  await query(
    `INSERT INTO moderation_log (conversation_id, user_id, category, flagged_content, action, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [conversationId, userId, category, flaggedContent.slice(0, 1000), action]
  ).catch(err => console.error('[MODERATION] Failed to log event:', err))
}
