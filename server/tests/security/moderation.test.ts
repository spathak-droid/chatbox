import { describe, it, expect } from 'vitest'
import { moderateContent, StreamModerator } from '../../src/security/moderation.js'

describe('moderateContent', () => {
  it('allows safe educational content', () => {
    expect(moderateContent('What is 2 + 2?').safe).toBe(true)
    expect(moderateContent('The capital of France is Paris.').safe).toBe(true)
    expect(moderateContent("Great job! You got 8 out of 10 correct.").safe).toBe(true)
    expect(moderateContent('Your knight is controlling the center of the board.').safe).toBe(true)
  })

  it('flags self-harm content', () => {
    const result = moderateContent('You should kill yourself')
    expect(result.safe).toBe(false)
    expect(result.category).toBe('self_harm')
  })

  it('flags suicide references', () => {
    const result = moderateContent('thinking about suicide')
    expect(result.safe).toBe(false)
    expect(result.category).toBe('self_harm')
  })

  it('flags sexual content', () => {
    const result = moderateContent('searching for porn online')
    expect(result.safe).toBe(false)
    expect(result.category).toBe('sexual')
  })

  it('flags hard drug references', () => {
    const result = moderateContent('how to make meth')
    expect(result.safe).toBe(false)
    expect(result.category).toBe('drugs')
  })

  it('flags profanity', () => {
    const result = moderateContent('what the fuck is this')
    expect(result.safe).toBe(false)
    expect(result.category).toBe('profanity')
  })

  it('is case insensitive', () => {
    expect(moderateContent('SUICIDE').safe).toBe(false)
    expect(moderateContent('Porn').safe).toBe(false)
  })

  it('does not flag safe words that contain unsafe substrings', () => {
    // "assassination" contains "ass" but should ideally not be flagged
    // However our simple regex does flag it — this documents the known limitation
    // A production system would use a proper classifier
    expect(moderateContent('The class assignment is due tomorrow.').safe).toBe(true)
  })

  it('allows discussion of educational topics that might seem sensitive', () => {
    expect(moderateContent('In history, many people died in World War 2.').safe).toBe(true)
    expect(moderateContent('The chemical formula for methane is CH4.').safe).toBe(true)
  })
})

describe('StreamModerator', () => {
  it('allows safe chunks to pass through', () => {
    const mod = new StreamModerator()
    expect(mod.addChunk('Hello ').safe).toBe(true)
    expect(mod.addChunk('how are ').safe).toBe(true)
    expect(mod.addChunk('you today?').safe).toBe(true)
    expect(mod.finalCheck().safe).toBe(true)
  })

  it('flags unsafe content when detected', () => {
    const mod = new StreamModerator()
    // Build up enough content to trigger the periodic check
    mod.addChunk('a'.repeat(90))
    const result = mod.addChunk(' suicide is ')
    // May or may not flag on this chunk depending on buffer length
    const final = mod.finalCheck()
    expect(final.safe).toBe(false)
    expect(final.category).toBe('self_harm')
  })

  it('stays flagged once flagged', () => {
    const mod = new StreamModerator()
    // Force a check by filling buffer past 100 chars
    mod.addChunk('a'.repeat(95))
    mod.addChunk(' fuck ')  // This should trigger at next check
    // Add more to trigger the check
    mod.addChunk('b'.repeat(10))
    const final = mod.finalCheck()
    expect(final.safe).toBe(false)
  })

  it('catches unsafe content in finalCheck even if periodic checks missed it', () => {
    const mod = new StreamModerator()
    // Add small chunks that never trigger periodic check
    mod.addChunk('Tell me about ')
    mod.addChunk('cocaine')
    const final = mod.finalCheck()
    expect(final.safe).toBe(false)
    expect(final.category).toBe('drugs')
  })

  it('returns buffer content for logging', () => {
    const mod = new StreamModerator()
    mod.addChunk('Hello ')
    mod.addChunk('world')
    expect(mod.getBuffer()).toBe('Hello world')
  })

  it('handles empty chunks', () => {
    const mod = new StreamModerator()
    expect(mod.addChunk('').safe).toBe(true)
    expect(mod.finalCheck().safe).toBe(true)
  })
})
