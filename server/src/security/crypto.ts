import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

// Derive a 32-byte key from the JWT secret (reuse existing secret to avoid another env var)
function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || ''
  return createHash('sha256').update(secret).digest()
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey()
  const parts = encryptedText.split(':')
  if (parts.length !== 3) {
    // Not encrypted (legacy plain text) — return as-is
    return encryptedText
  }
  const iv = Buffer.from(parts[0], 'base64')
  const authTag = Buffer.from(parts[1], 'base64')
  const encrypted = Buffer.from(parts[2], 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted) + decipher.final('utf8')
}

export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  if (parts.length !== 3) return false
  try {
    Buffer.from(parts[0], 'base64')
    Buffer.from(parts[1], 'base64')
    Buffer.from(parts[2], 'base64')
    return true
  } catch {
    return false
  }
}
