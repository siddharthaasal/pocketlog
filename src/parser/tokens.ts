export interface Token {
  /** Original spelling, used for the description. */
  text: string
  lower: string
  /** Consumed by an earlier rule (amount, date, account…). */
  used: boolean
}

/** Splits dictated text into words, normalising currency and number formats first. */
export function tokenize(input: string): Token[] {
  const normalized = input
    .replace(/(\d),(?=\d)/g, '$1') // 1,200 → 1200
    .replace(/₹\s*/g, ' rs ') // ₹350 → rs 350
    .replace(/\brs\.?(?=\d)/gi, 'rs ') // rs.350 / rs350 → rs 350
    .replace(/(\d)(rs|inr|rupees?)\b/gi, '$1 $2') // 350rs → 350 rs
    .replace(/[“”"!?]/g, ' ')

  return normalized
    .split(/\s+/)
    .map((raw) => raw.replace(/^[(,'‘]+|[),.;:'’]+$/g, ''))
    .filter(Boolean)
    .map((text) => ({ text, lower: text.toLowerCase(), used: false }))
}

/** Index of the first unused occurrence of a multi-word phrase at or after `from`, or -1. */
export function findPhrase(tokens: readonly Token[], phrase: readonly string[], from = 0): number {
  outer: for (let i = from; i <= tokens.length - phrase.length; i++) {
    for (let j = 0; j < phrase.length; j++) {
      const t = tokens[i + j]
      if (!t || t.used || t.lower !== phrase[j]) continue outer
    }
    return i
  }
  return -1
}

export function markUsed(tokens: Token[], start: number, length: number): void {
  for (let i = start; i < start + length; i++) {
    const t = tokens[i]
    if (t) t.used = true
  }
}

/** Marks the word just before `index` as used when it is one of `words`; returns that word. */
export function consumePreceding(
  tokens: Token[],
  index: number,
  words: ReadonlySet<string>,
): string | undefined {
  const prev = tokens[index - 1]
  if (prev && !prev.used && words.has(prev.lower)) {
    prev.used = true
    return prev.lower
  }
  return undefined
}
