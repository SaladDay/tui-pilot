import { describe, expect, it } from 'vitest'

describe('isStableSequence', () => {
  it('returns true when the last two frames match', async () => {
    const { isStableSequence } = await import('../../src/services/stability.js')

    expect(isStableSequence(['frame-1', 'frame-2', 'frame-2'])).toBe(true)
  })

  it('returns false when there are fewer than two frames', async () => {
    const { isStableSequence } = await import('../../src/services/stability.js')

    expect(isStableSequence([])).toBe(false)
    expect(isStableSequence(['frame-1'])).toBe(false)
  })

  it('returns false when the last two frames differ', async () => {
    const { isStableSequence } = await import('../../src/services/stability.js')

    expect(isStableSequence(['frame-1', 'frame-2'])).toBe(false)
    expect(isStableSequence(['frame-1', 'frame-2', 'frame-3'])).toBe(false)
  })
})
