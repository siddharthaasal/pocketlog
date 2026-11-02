/** Comma-separated text → unique lowercase words, used for parser keywords and account aliases. */
export function parseWordList(text: string): string[] {
  const words = text
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set(words)]
}
