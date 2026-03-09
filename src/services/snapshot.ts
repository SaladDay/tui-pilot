import { createHash } from 'node:crypto'

import type { WindowBounds } from '../lib/types.js'
import { findSuspiciousUnicodeLines } from '../lib/unicode.js'

export type AssembleSnapshotInput = {
  sessionId: string
  seq: number
  timestamp: string
  cols: number
  rows: number
  stable: boolean
  ansiText: string
  plainText: string
  lines: string[]
  imageArtifactId: string
  imageWidth: number
  imageHeight: number
  bounds: WindowBounds
}

export function assembleSnapshot(input: AssembleSnapshotInput) {
  const unicodeWarnings = findSuspiciousUnicodeLines(input.lines)

  return {
    session: {
      sessionId: input.sessionId,
      seq: input.seq,
      timestamp: input.timestamp,
    },
    screen: {
      cols: input.cols,
      rows: input.rows,
      cursor: null,
      title: null,
      stable: input.stable,
      screenHash: createHash('sha256').update(input.ansiText).digest('hex'),
    },
    textView: {
      plainText: input.plainText,
      ansiText: input.ansiText,
      lines: input.lines,
      changedRegions: [],
    },
    visual: {
      imageArtifactId: input.imageArtifactId,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      windowBounds: input.bounds,
    },
    diagnostics: {
      unicodeWarnings: unicodeWarnings.map((warning) => warning.message),
      emojiWidthSuspects: unicodeWarnings.map((warning) => warning.line),
      truncated: false,
    },
  }
}
