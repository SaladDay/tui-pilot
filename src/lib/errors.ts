function extractErrorDetail(error: unknown) {
  const parts: string[] = []

  if (error instanceof Error) {
    parts.push(error.message)
  }

  if (typeof error === 'object' && error !== null) {
    for (const key of ['shortMessage', 'stderr', 'stdout'] as const) {
      const value = (error as Record<string, unknown>)[key]

      if (typeof value === 'string' && value.length > 0) {
        parts.push(value)
      }
    }
  }

  return [...new Set(parts)].find((part) => part.length > 0)
}

function formatErrorMessage(code: string, message: string, hint: string | undefined, cause: unknown) {
  const detail = extractErrorDetail(cause)
  const segments = [`${message} [code=${code}]`]

  if (detail && detail !== message) {
    segments.push(`cause=${detail}`)
  }

  if (hint) {
    segments.push(`hint=${hint}`)
  }

  return segments.join(' ')
}

export class TuiPilotError extends Error {
  public readonly hint: string | undefined

  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions & { hint?: string },
  ) {
    super(formatErrorMessage(code, message, options?.hint, options?.cause), options)
    this.name = 'TuiPilotError'
    this.hint = options?.hint
  }
}

export function toTuiPilotError(
  error: unknown,
  fallback: {
    code: string
    message: string
    hint?: string
  },
) {
  if (error instanceof TuiPilotError) {
    return error
  }

  return new TuiPilotError(fallback.code, fallback.message, {
    cause: error instanceof Error ? error : undefined,
    hint: fallback.hint,
  })
}
