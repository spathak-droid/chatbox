import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, decrypt, isEncrypted } from '../../src/security/crypto.js'

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret'
})

describe('encrypt', () => {
  it('produces output different from the input', () => {
    const plaintext = 'hello world'
    const encrypted = encrypt(plaintext)
    expect(encrypted).not.toBe(plaintext)
  })

  it('produces different ciphertexts for different plaintexts', () => {
    const a = encrypt('message-one')
    const b = encrypt('message-two')
    expect(a).not.toBe(b)
  })

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encrypt('same-input')
    const b = encrypt('same-input')
    expect(a).not.toBe(b)
  })
})

describe('decrypt', () => {
  it('round-trips: decrypt(encrypt(x)) === x', () => {
    const cases = [
      'hello world',
      '',
      'a',
      '🎉 unicode emoji test',
      'line1\nline2\ttab',
      'special chars: !@#$%^&*()_+-=[]{}|;:,.<>?',
      'a'.repeat(10000),
    ]
    for (const plaintext of cases) {
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    }
  })

  it('returns plain text as-is when input is not encrypted (legacy)', () => {
    const legacy = 'just some plain text with no colons'
    expect(decrypt(legacy)).toBe(legacy)
  })

  it('throws when input has 3 colon-separated parts but is not valid ciphertext', () => {
    const notEncrypted = 'not:valid:base64'
    // 3 colon-separated parts pass the length check, but decryption fails
    // because the auth tag and IV are wrong sizes
    expect(() => decrypt(notEncrypted)).toThrow()
  })
})

describe('isEncrypted', () => {
  it('returns true for encrypted values', () => {
    const encrypted = encrypt('test value')
    expect(isEncrypted(encrypted)).toBe(true)
  })

  it('returns false for plain text', () => {
    expect(isEncrypted('hello world')).toBe(false)
  })

  it('returns false for text with fewer than 3 colon-separated parts', () => {
    expect(isEncrypted('only:two')).toBe(false)
    expect(isEncrypted('nodelimiter')).toBe(false)
  })

  it('returns false for text with more than 3 colon-separated parts', () => {
    expect(isEncrypted('a:b:c:d')).toBe(false)
  })

  it('returns true for any 3-part base64 string', () => {
    // This matches the format check: 3 base64 parts separated by colons
    const fakeEncrypted = `${Buffer.from('iv').toString('base64')}:${Buffer.from('tag').toString('base64')}:${Buffer.from('data').toString('base64')}`
    expect(isEncrypted(fakeEncrypted)).toBe(true)
  })
})
