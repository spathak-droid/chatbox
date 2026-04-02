import { Langfuse } from 'langfuse'
import crypto from 'crypto'

const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY || '',
  publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
  baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
  enabled: !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY),
})

export { langfuse }

export function createTrace(name: string, metadata?: Record<string, unknown>) {
  return langfuse.trace({
    name,
    metadata,
    tags: metadata?.tags as string[] | undefined,
  })
}

export function scoreAssertion(traceId: string, name: string, passed: boolean) {
  langfuse.score({
    traceId,
    name,
    value: passed ? 1 : 0,
  })
}

export function hashString(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16)
}

export async function flushLangfuse() {
  await langfuse.flushAsync()
}
