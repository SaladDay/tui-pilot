import type { SessionRecord } from '../lib/types.js'

function cloneSessionRecord(record: SessionRecord): SessionRecord {
  return {
    ...record,
    windowBounds: record.windowBounds ? { ...record.windowBounds } : undefined,
  }
}

export function createSessionStore() {
  const sessions = new Map<string, SessionRecord>()

  return {
    save(record: SessionRecord) {
      sessions.set(record.sessionId, cloneSessionRecord(record))
    },
    get(sessionId: string) {
      const record = sessions.get(sessionId)
      return record ? cloneSessionRecord(record) : undefined
    },
    delete(sessionId: string) {
      return sessions.delete(sessionId)
    },
    update<T>(sessionId: string, updater: (record: SessionRecord) => { record: SessionRecord, value: T }) {
      const current = sessions.get(sessionId)

      if (!current) {
        return undefined
      }

      const next = updater(cloneSessionRecord(current))

      sessions.set(sessionId, cloneSessionRecord(next.record))
      return next.value
    },
  }
}
