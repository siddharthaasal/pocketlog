import { z } from 'zod'

/** A user-correctable problem, keyed by form field. */
export class ValidationError extends Error {
  readonly fields: Record<string, string>

  constructor(fields: Record<string, string>) {
    super(Object.values(fields).join(' '))
    this.name = 'ValidationError'
    this.fields = fields
  }
}

/** Maps Zod/validation errors to `{ field: message }`; returns null for anything else. */
export function toFieldErrors(error: unknown): Record<string, string> | null {
  if (error instanceof ValidationError) return error.fields
  if (error instanceof z.ZodError) {
    const fields: Record<string, string> = {}
    for (const issue of error.issues) {
      const key = issue.path.join('.') || 'form'
      fields[key] ??= issue.message
    }
    return fields
  }
  return null
}
