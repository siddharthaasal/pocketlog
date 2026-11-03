import { base64ToBytes, bytesToBase64 } from './base64'

/**
 * Passphrase encryption for backup files: PBKDF2-SHA256 derives an AES-256-GCM key.
 * GCM authenticates the data, so a wrong passphrase or a tampered file fails to decrypt
 * instead of producing garbage.
 */
export interface EncryptedPayload {
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

/** OWASP's 2023+ recommendation for PBKDF2-HMAC-SHA256. */
export const DEFAULT_ITERATIONS = 600_000

export class DecryptionError extends Error {
  constructor() {
    super('Wrong passphrase, or the file has been changed.')
    this.name = 'DecryptionError'
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptText(
  plaintext: string,
  passphrase: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, iterations)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return {
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

export async function decryptText(payload: EncryptedPayload, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase, base64ToBytes(payload.salt), payload.iterations)
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.ciphertext),
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new DecryptionError()
  }
}
