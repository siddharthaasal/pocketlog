/**
 * The Siri Shortcut appends one line per entry to inbox.txt:
 *   2026-11-02T13:45:10+05:30 Spent 350 on lunch using HDFC
 * The timestamp is optional; without it the entry is dated on import.
 */
export interface InboxLine {
  /** The whole line, used to recognise it on later imports. */
  raw: string
  text: string
  /** ISO timestamp from the Shortcut, when present. */
  recordedAt?: string
  /** Local calendar date the entry was recorded on. */
  date?: string
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/

export function parseInboxFile(content: string): InboxLine[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((raw) => {
      const [first = '', ...rest] = raw.split(/\s+/)
      if (TIMESTAMP.test(first) && !Number.isNaN(Date.parse(first)) && rest.length > 0) {
        // The Shortcut writes local time with its offset, so the date part is already local.
        return { raw, text: rest.join(' '), recordedAt: first, date: first.slice(0, 10) }
      }
      return { raw, text: raw }
    })
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
