import { z } from 'zod'
import { decryptText, DecryptionError, encryptText, type EncryptedPayload } from '../lib/crypto'
import {
  accountSchema,
  categorySchema,
  inboxEntrySchema,
  transactionSchema,
  type Account,
  type Category,
  type InboxEntry,
  type Transaction,
} from './types'

/** Bump when the file layout changes; older apps refuse newer files instead of guessing. */
export const BACKUP_FORMAT = 1

export interface BackupData {
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  inbox: InboxEntry[]
}

export interface BackupFile {
  app: 'pocketlog'
  format: number
  exportedAt: string
  data: BackupData
}

export type BackupTable = keyof BackupData

export interface InvalidRow {
  table: BackupTable
  id: string
  reason: string
}

export type ReadResult =
  | { status: 'ok'; backup: BackupFile; invalid: InvalidRow[] }
  | { status: 'needs-passphrase' }
  | { status: 'error'; message: string }

const ROW_SCHEMAS = {
  transactions: transactionSchema,
  categories: categorySchema,
  accounts: accountSchema,
  inbox: inboxEntrySchema,
} as const

const envelopeSchema = z.object({
  app: z.literal('pocketlog'),
  format: z.number().int().positive(),
  exportedAt: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  encrypted: z
    .object({
      kdf: z.literal('PBKDF2-SHA256'),
      iterations: z.number().int().min(1),
      salt: z.string(),
      iv: z.string(),
      ciphertext: z.string(),
    })
    .optional(),
})

export function createBackup(data: BackupData, exportedAt: string): BackupFile {
  return { app: 'pocketlog', format: BACKUP_FORMAT, exportedAt, data }
}

/** Plain JSON, or an envelope whose `encrypted` payload holds that JSON. */
export async function serializeBackup(backup: BackupFile, passphrase?: string): Promise<string> {
  const json = JSON.stringify(backup)
  if (!passphrase) return json
  const encrypted: EncryptedPayload = await encryptText(json, passphrase)
  return JSON.stringify({ app: 'pocketlog', format: BACKUP_FORMAT, encrypted })
}

function rowId(row: unknown): string {
  if (row && typeof row === 'object') {
    const r = row as { id?: unknown; key?: unknown }
    if (typeof r.id === 'string') return r.id
    if (typeof r.key === 'string') return r.key.slice(0, 12)
  }
  return '(unknown)'
}

/**
 * Parses and validates a backup. Every row is checked against the same schemas the app
 * writes with; bad rows are returned in `invalid` rather than silently dropped.
 */
export async function readBackupText(text: string, passphrase?: string): Promise<ReadResult> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { status: 'error', message: 'This file isn’t valid JSON.' }
  }
  const envelope = envelopeSchema.safeParse(raw)
  if (!envelope.success) return { status: 'error', message: 'This isn’t a PocketLog backup.' }
  if (envelope.data.format > BACKUP_FORMAT) {
    return {
      status: 'error',
      message: 'This backup was made by a newer version of PocketLog. Update the app first.',
    }
  }

  let body: unknown = raw
  if (envelope.data.encrypted) {
    if (!passphrase) return { status: 'needs-passphrase' }
    try {
      body = JSON.parse(await decryptText(envelope.data.encrypted, passphrase))
    } catch (error) {
      if (error instanceof DecryptionError) return { status: 'error', message: error.message }
      throw error
    }
  }

  const parsed = envelopeSchema.safeParse(body)
  if (!parsed.success || !parsed.data.data) {
    return { status: 'error', message: 'The backup is missing its data.' }
  }

  const invalid: InvalidRow[] = []
  const data: BackupData = { transactions: [], categories: [], accounts: [], inbox: [] }
  for (const table of Object.keys(ROW_SCHEMAS) as BackupTable[]) {
    const rows = parsed.data.data[table] ?? []
    if (!Array.isArray(rows)) {
      return { status: 'error', message: `The backup’s ${table} section is damaged.` }
    }
    for (const row of rows) {
      const result = ROW_SCHEMAS[table].safeParse(row)
      if (result.success) (data[table] as unknown[]).push(result.data)
      else
        invalid.push({
          table,
          id: rowId(row),
          reason: result.error.issues[0]?.message ?? 'Invalid',
        })
    }
  }

  return {
    status: 'ok',
    backup: {
      app: 'pocketlog',
      format: parsed.data.format,
      exportedAt: parsed.data.exportedAt ?? '',
      data,
    },
    invalid,
  }
}
