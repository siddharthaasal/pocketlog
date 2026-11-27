import type { StatementRow } from '../domain/reconcile'
import { hashText, parseAmountPaise } from './statement'

/**
 * The email sweep (tools/email_sweep.py) appends one line per spend it found in your mail:
 *
 *   2026-11-27 | 450.00 | Swiggy | src=email via=hdfc-upi mid=<abc@mail.example>
 *
 * Date, amount, merchant, then free `key=value` tags. `mid` is the email's Message-ID and
 * makes the row's identity stable; `via` names the template that matched and hints at the account.
 */
export interface EmailRow extends StatementRow {
  /** Which template read it, e.g. "hdfc-upi", "hdfc-card", "generic". */
  via?: string
}

export interface ParsedEmailSweep {
  rows: EmailRow[]
  from: string
  to: string
  /** Lines that looked like entries but couldn't be read. */
  skipped: number
}

export type EmailSweepResult =
  { ok: true; sweep: ParsedEmailSweep } | { ok: false; message: string }

const LINE = /^(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?\s*\|/

/** True when the text is made of sweep lines, so a dropped file can be told apart from a statement. */
export function looksLikeEmailSweep(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  if (lines.length === 0) return false
  const hits = lines.slice(0, 20).filter((l) => LINE.test(l)).length
  return hits >= Math.min(lines.length, 20) / 2
}

function tagsOf(rest: string): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const match of rest.matchAll(/([a-z_]+)=(\S+)/gi)) tags[match[1]!.toLowerCase()] = match[2]!
  return tags
}

const validDate = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date
}

export function parseEmailSweep(text: string): EmailSweepResult {
  const rows: EmailRow[] = []
  const seen = new Map<string, number>()
  let skipped = 0

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = LINE.exec(line)
    if (!m) {
      skipped++
      continue
    }
    const date = m[1]!
    const parts = line.split('|').map((p) => p.trim())
    const amount = parseAmountPaise(parts[1]?.replace(/^(?:rs\.?|inr|₹)\s*/i, ''))
    const merchant = (parts[2] ?? '').replace(/\s+/g, ' ')
    if (!validDate(date) || amount <= 0 || !merchant) {
      skipped++
      continue
    }
    const tags = tagsOf(parts.slice(3).join(' '))
    // The Message-ID identifies an email; without one, the line itself does (repeats get a suffix).
    const base = tags.mid ?? `${date}|${amount}|${merchant}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    // The same email swept twice is one spend; the same line without an id may be two.
    if (tags.mid && n > 1) continue
    rows.push({
      key: `email-${hashText(base)}${n > 1 ? `-${n}` : ''}`,
      date,
      amount,
      direction: 'out',
      narration: merchant,
      ...(tags.via && { via: tags.via }),
    })
  }

  if (rows.length === 0) {
    return {
      ok: false,
      message:
        'No spends were found in this file. It should have lines like “2026-11-27 | 450.00 | Swiggy | mid=…”.',
    }
  }
  const dates = rows.map((r) => r.date).sort()
  return { ok: true, sweep: { rows, from: dates[0]!, to: dates[dates.length - 1]!, skipped } }
}
