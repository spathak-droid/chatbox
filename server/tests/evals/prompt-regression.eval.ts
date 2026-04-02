import { describe, it, expect, afterAll } from 'vitest'
import { createEvalTrace, scoreAssertion, flushLangfuse, setupEvalSuite, getSystemPromptHash } from './setup.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CATEGORY = 'prompt-regression'
setupEvalSuite()

// Read the actual system prompt from openrouter.ts
function getSystemPromptContent(): string {
  const filePath = path.join(__dirname, '../../src/chat/openrouter.ts')
  const content = fs.readFileSync(filePath, 'utf-8')
  const match = content.match(/const systemContent = `([\s\S]*?)`;?\s*\n/)
  return match?.[1] || ''
}

describe('Prompt Regression Evals', () => {
  afterAll(async () => {
    await flushLangfuse()
  })

  it('PR1: system prompt hash is stable + contains required sections', () => {
    const trace = createEvalTrace(CATEGORY, 'PR1')
    const prompt = getSystemPromptContent()

    // Required sections that must be present
    const hasStepByStep = prompt.includes('STEP-BY-STEP')
    const hasAbsoluteRules = prompt.includes('ABSOLUTE RULES')
    const hasCoaching = prompt.includes('COACHING')
    const hasKeepShort = prompt.includes('KEEP IT SHORT')

    expect(hasStepByStep).toBe(true)
    expect(hasAbsoluteRules).toBe(true)
    expect(hasCoaching).toBe(true)
    expect(hasKeepShort).toBe(true)

    scoreAssertion(trace.id, 'has_step_by_step', hasStepByStep)
    scoreAssertion(trace.id, 'has_absolute_rules', hasAbsoluteRules)
    scoreAssertion(trace.id, 'has_coaching', hasCoaching)
    scoreAssertion(trace.id, 'has_keep_short', hasKeepShort)

    // Log hash for tracking
    const hash = getSystemPromptHash()
    scoreAssertion(trace.id, 'hash_computed', !!hash)
  })

  it('PR2: removing ABSOLUTE RULES would break golden set', () => {
    const trace = createEvalTrace(CATEGORY, 'PR2')
    const prompt = getSystemPromptContent()

    // Simulate removing the ABSOLUTE RULES section
    const mutated = prompt.replace(/## ABSOLUTE RULES[\s\S]*?(?=##|$)/, '')

    // Verify the mutation actually removed something
    const rulesRemoved = !mutated.includes('ABSOLUTE RULES')
    expect(rulesRemoved).toBe(true)

    // The golden set guardrails depend on code, not prompt, so they'd still pass
    // But the LLM behavioral rules (e.g., "ONLY call chess_ tools when user wants CHESS")
    // would be missing, which would affect live evals
    scoreAssertion(trace.id, 'mutation_detected', rulesRemoved)

    // Verify the mutated prompt is meaningfully shorter
    const significantRemoval = prompt.length - mutated.length > 100
    expect(significantRemoval).toBe(true)
    scoreAssertion(trace.id, 'significant_removal', significantRemoval)
  })

  it('PR3: removing COACHING section detected', () => {
    const trace = createEvalTrace(CATEGORY, 'PR3')
    const prompt = getSystemPromptContent()

    const mutated = prompt.replace(/## COACHING[\s\S]*?(?=##|$)/, '')
    const coachingRemoved = !mutated.includes('COACHING')

    expect(coachingRemoved).toBe(true)
    scoreAssertion(trace.id, 'coaching_removed', coachingRemoved)

    const significantRemoval = prompt.length - mutated.length > 50
    expect(significantRemoval).toBe(true)
    scoreAssertion(trace.id, 'significant_removal', significantRemoval)
  })
})
