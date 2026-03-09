import { describe, expect, it } from 'vitest'

describe('assembleSnapshot', () => {
  it('assembles the expected snapshot shape and diagnostics', async () => {
    const { assembleSnapshot } = await import('../../src/services/snapshot.js')

    const snapshot = assembleSnapshot({
      sessionId: 'session-1',
      seq: 7,
      timestamp: '2026-03-10T12:00:00.000Z',
      cols: 120,
      rows: 40,
      stable: true,
      ansiText: 'plain\nwarn\ufe0f',
      plainText: 'plain\nwarn\ufe0f',
      lines: ['plain', 'warn\ufe0f'],
      imageArtifactId: 'artifact-1',
      imageWidth: 1440,
      imageHeight: 900,
      bounds: {
        x: 10,
        y: 20,
        width: 1440,
        height: 900,
      },
    })

    expect(snapshot).toEqual({
      session: {
        sessionId: 'session-1',
        seq: 7,
        timestamp: '2026-03-10T12:00:00.000Z',
      },
      screen: {
        cols: 120,
        rows: 40,
        cursor: null,
        title: null,
        stable: true,
        screenHash: '654b684ea5e392a892415073936cabb9277dd94408cc08b2f3f6a3ffec5491c0',
      },
      textView: {
        plainText: 'plain\nwarn\ufe0f',
        ansiText: 'plain\nwarn\ufe0f',
        lines: ['plain', 'warn\ufe0f'],
        changedRegions: [],
      },
      visual: {
        imageArtifactId: 'artifact-1',
        imageWidth: 1440,
        imageHeight: 900,
        windowBounds: {
          x: 10,
          y: 20,
          width: 1440,
          height: 900,
        },
      },
      diagnostics: {
        unicodeWarnings: ['Line 2 contains suspicious unicode: variation selector'],
        emojiWidthSuspects: [2],
        truncated: false,
      },
    })
  })

  it('produces empty unicode diagnostics when lines are plain ascii', async () => {
    const { assembleSnapshot } = await import('../../src/services/snapshot.js')

    const snapshot = assembleSnapshot({
      sessionId: 'session-2',
      seq: 8,
      timestamp: '2026-03-10T12:01:00.000Z',
      cols: 80,
      rows: 24,
      stable: false,
      ansiText: 'plain text',
      plainText: 'plain text',
      lines: ['plain text'],
      imageArtifactId: 'artifact-2',
      imageWidth: 800,
      imageHeight: 600,
      bounds: {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      },
    })

    expect(snapshot.screen.screenHash).toBe('c9ecf5e54c7b3f2640ecca21f96d4c3625a2b7935104f41c5ede29935a9e52c9')
    expect(snapshot.diagnostics).toEqual({
      unicodeWarnings: [],
      emojiWidthSuspects: [],
      truncated: false,
    })
  })
})
