import { vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getGitSha, getSystemPromptHash } from './setup.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES_DIR = path.join(__dirname, 'fixtures')

interface Exchange {
  request: { model?: string; messages?: unknown[]; tools?: unknown[]; stream?: boolean }
  response: Record<string, unknown>
}

interface Fixture {
  testId: string
  category: string
  recordedAt: string
  gitSha: string
  promptHash: string
  exchanges: Exchange[]
}

let currentFixture: Fixture | null = null
let currentExchanges: Exchange[] = []

export function startRecording(category: string, testId: string) {
  currentExchanges = []
  currentFixture = {
    testId,
    category,
    recordedAt: new Date().toISOString(),
    gitSha: getGitSha(),
    promptHash: getSystemPromptHash(),
    exchanges: currentExchanges,
  }

  const originalFetch = globalThis.fetch

  const recordingFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

    if (url.includes('openrouter.ai')) {
      const body = init?.body ? JSON.parse(init.body as string) : {}
      const requestData = {
        model: body.model,
        messages: body.messages,
        tools: body.tools,
        stream: body.stream,
      }

      const response = await originalFetch(input, init)
      const clonedResponse = response.clone()

      let responseData: Record<string, unknown>
      if (body.stream === false) {
        responseData = await clonedResponse.json() as Record<string, unknown>
      } else {
        const text = await clonedResponse.text()
        const chunks: unknown[] = []
        for (const line of text.split('\n')) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try { chunks.push(JSON.parse(line.slice(6))) } catch {}
          }
        }
        responseData = { chunks, rawText: text }
      }

      currentExchanges.push({ request: requestData, response: responseData })

      return response
    }

    return originalFetch(input, init)
  }) as unknown as typeof fetch

  vi.stubGlobal('fetch', recordingFetch)
}

export function stopRecording() {
  if (!currentFixture) return
  currentFixture.exchanges = currentExchanges

  const categoryDir = path.join(FIXTURES_DIR, currentFixture.category)
  fs.mkdirSync(categoryDir, { recursive: true })

  const filePath = path.join(categoryDir, `${currentFixture.testId}.json`)
  fs.writeFileSync(filePath, JSON.stringify(currentFixture, null, 2))

  currentFixture = null
  currentExchanges = []
  vi.unstubAllGlobals()
}
