import { describe, expect, it } from 'vitest'

function createRecord(overrides: Partial<{
  sessionId: string
  tmuxSession: string
  cwd: string
  command: string
  cols: number
  rows: number
  terminalWindowId: number | null
  terminalPid: number | null
  terminalBackend: 'wezterm' | 'ghostty'
  seq: number
}> = {}) {
  return {
    sessionId: 'session-1',
    tmuxSession: 'tmux-1',
    cwd: '/tmp/project',
    command: 'npm test',
    cols: 120,
    rows: 40,
    terminalWindowId: 11,
    terminalPid: 4242,
    terminalBackend: 'wezterm' as const,
    seq: 1,
    ...overrides,
  }
}

describe('createSessionStore', () => {
  it('retrieves a saved record by session id', async () => {
    const { createSessionStore } = await import('../../src/state/session-store.js')

    const store = createSessionStore()
    const record = createRecord()

    store.save(record)

    expect(store.get(record.sessionId)).toEqual(record)
  })

  it('returns undefined for a missing session id', async () => {
    const { createSessionStore } = await import('../../src/state/session-store.js')

    const store = createSessionStore()

    expect(store.get('missing-session')).toBeUndefined()
  })

  it('deletes a saved record and reports whether it existed', async () => {
    const { createSessionStore } = await import('../../src/state/session-store.js')

    const store = createSessionStore()
    const record = createRecord()

    store.save(record)

    expect(store.delete(record.sessionId)).toBe(true)
    expect(store.get(record.sessionId)).toBeUndefined()
    expect(store.delete(record.sessionId)).toBe(false)
  })

  it('keeps an internal copy when the saved record is mutated later', async () => {
    const { createSessionStore } = await import('../../src/state/session-store.js')

    const store = createSessionStore()
    const record = createRecord()

    store.save(record)
    record.tmuxSession = 'tmux-mutated'
    record.cwd = '/tmp/mutated'

    expect(store.get(record.sessionId)).toEqual(createRecord())
  })

  it('returns a copy so callers cannot mutate stored state through get', async () => {
    const { createSessionStore } = await import('../../src/state/session-store.js')

    const store = createSessionStore()
    const record = createRecord()

    store.save(record)

    const stored = store.get(record.sessionId)
    expect(stored).toEqual(record)
    expect(stored).not.toBe(record)

    if (!stored) {
      throw new Error('expected stored session record')
    }

    stored.seq = 99
    stored.command = 'npm run mutated'

    expect(store.get(record.sessionId)).toEqual(record)
  })
})
