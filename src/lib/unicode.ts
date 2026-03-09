export type SuspiciousUnicodeLine = {
  line: number
  reasons: string[]
  message: string
}

const ZERO_WIDTH_JOINER = '\u200d'
const VARIATION_SELECTOR = '\ufe0f'

export function findSuspiciousUnicodeLines(lines: string[]): SuspiciousUnicodeLine[] {
  return lines.flatMap((line, index) => {
    const reasons: string[] = []

    if (line.includes(ZERO_WIDTH_JOINER)) {
      reasons.push('zero-width joiner')
    }

    if (line.includes(VARIATION_SELECTOR)) {
      reasons.push('variation selector')
    }

    if (reasons.length === 0) {
      return []
    }

    const lineNumber = index + 1

    return [{
      line: lineNumber,
      reasons,
      message: `Line ${lineNumber} contains suspicious unicode: ${reasons.join(', ')}`,
    }]
  })
}
