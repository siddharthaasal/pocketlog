import { nowISO } from '../lib/ids'
import { todayISO } from '../lib/dates'
import { parseInboxFile, sha256Hex } from '../parser/inbox'
import { parseEntry } from '../parser/parse'
import { db } from './db'
import { addTransaction } from './repo'

export interface ImportSummary {
  added: number
  toReview: number
  unreadable: number
  alreadyImported: number
}

/**
 * Imports the Siri inbox file. Safe to run repeatedly on the same, growing file:
 * every line is remembered by its hash and only new lines are processed.
 */
export async function importInboxFile(content: string, today = todayISO()): Promise<ImportSummary> {
  const summary: ImportSummary = { added: 0, toReview: 0, unreadable: 0, alreadyImported: 0 }
  const lines = parseInboxFile(content)
  // Hash outside the database transactions: Web Crypto promises would end them early.
  const keys = await Promise.all(lines.map((line) => sha256Hex(line.raw)))
  const [categories, accounts] = await Promise.all([db.categories.toArray(), db.accounts.toArray()])

  for (const [i, line] of lines.entries()) {
    const key = keys[i]!
    const id = `siri-${key.slice(0, 32)}`
    const recordedAt = line.recordedAt ?? nowISO()

    await db.transaction(
      'rw',
      [db.inbox, db.transactions, db.accounts, db.categories],
      async () => {
        if ((await db.inbox.get(key)) || (await db.transactions.get(id))) {
          summary.alreadyImported++
          return
        }
        const result = parseEntry(line.text, { categories, accounts, today: line.date ?? today })
        if (result.input) {
          const needsReview = result.issues.length > 0
          await addTransaction(result.input, { id, source: 'siri', needsReview })
          await db.inbox.put({
            key,
            rawText: line.text,
            recordedAt,
            status: 'imported',
            transactionId: id,
          })
          if (needsReview) summary.toReview++
          else summary.added++
        } else {
          await db.inbox.put({ key, rawText: line.text, recordedAt, status: 'unparsed' })
          summary.unreadable++
        }
      },
    )
  }
  return summary
}

export async function dismissInboxEntry(key: string): Promise<void> {
  await db.inbox.update(key, { status: 'skipped' })
}

/** Links a line the parser couldn't read to the transaction the user created for it. */
export async function resolveInboxEntry(key: string, transactionId: string): Promise<void> {
  await db.inbox.update(key, { status: 'imported', transactionId })
}
