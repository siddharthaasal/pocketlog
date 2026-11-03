import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64 } from './base64'
import { DecryptionError, decryptText, encryptText } from './crypto'

// Fewer iterations keep the tests fast; the format stores the count used.
const FAST = 1_000

describe('base64', () => {
  it('round-trips large arrays', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })
})

describe('backup encryption', () => {
  const text = JSON.stringify({ hello: 'world', rupee: '₹350' })

  it('round-trips with the right passphrase', async () => {
    const payload = await encryptText(text, 'correct horse', FAST)
    expect(payload).toMatchObject({ kdf: 'PBKDF2-SHA256', iterations: FAST })
    expect(payload.ciphertext).not.toContain('world')
    expect(await decryptText(payload, 'correct horse')).toBe(text)
  })

  it('uses a fresh salt and IV every time', async () => {
    const a = await encryptText(text, 'pw', FAST)
    const b = await encryptText(text, 'pw', FAST)
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('rejects a wrong passphrase', async () => {
    const payload = await encryptText(text, 'right', FAST)
    await expect(decryptText(payload, 'wrong')).rejects.toBeInstanceOf(DecryptionError)
  })

  it('rejects a tampered file', async () => {
    const payload = await encryptText(text, 'pw', FAST)
    const bytes = base64ToBytes(payload.ciphertext)
    bytes[0] = bytes[0]! ^ 1
    await expect(
      decryptText({ ...payload, ciphertext: bytesToBase64(bytes) }, 'pw'),
    ).rejects.toBeInstanceOf(DecryptionError)
  })
})
