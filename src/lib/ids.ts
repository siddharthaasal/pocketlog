export function newId(): string {
  return crypto.randomUUID()
}

export function nowISO(): string {
  return new Date().toISOString()
}
