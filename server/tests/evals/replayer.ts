import { vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getSystemPromptHash } from './setup.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES_DIR = path.join(__dirname, 'fixtures')

let exchangeIndex = 0

export function startReplay(category: string, testId: string) {
  exchangeIndex = 0

  const filePath = path.join(FIXTURES_DIR, category, `${testId}.json`)

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `No fixture for "${testId}" in category "${category}". ` +
      `Run with EVAL_MODE=record to generate fixtures.\n` +
      `Expected: ${filePath}`
    )
  }

  const fixture = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  const currentHash = getSystemPromptHash()
  if (fixture.promptHash && fixture.promptHash !== currentHash) {
    console.warn(
      `[EVAL WARNING] Fixture "${testId}" was recorded with a different system prompt. ` +
      `Consider re-recording with EVAL_MODE=record.`
    )
  }

  const originalFetch = globalThis.fetch

  const replayFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

    if (url.includes('openrouter.ai')) {
      const exchange = fixture.exchanges[exchangeIndex]
      if (!exchange) {
        throw new Error(
          `Fixture "${testId}" has ${fixture.exchanges.length} exchanges ` +
          `but test made exchange #${exchangeIndex + 1}. Re-record fixture.`
        )
      }
      exchangeIndex++

      const body = init?.body ? JSON.parse(init.body as string) : {}

      if (body.stream === false) {
        return new Response(JSON.stringify(exchange.response), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } else {
        const rawText = (exchange.response as any).rawText || ''
        return new Response(rawText, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
    }

    return originalFetch(input, init)
  }) as unknown as typeof fetch

  vi.stubGlobal('fetch', replayFetch)
}

export function stopReplay() {
  vi.unstubAllGlobals()
}
