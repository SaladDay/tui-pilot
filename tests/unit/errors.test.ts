import { describe, expect, it } from 'vitest'

import { TuiPilotError } from '../../src/lib/errors.js'

describe('TuiPilotError', () => {
  it('preserves the wrapped cause', () => {
    const cause = new Error('root cause')
    const error = new TuiPilotError('session_failed', 'unable to start session', {
      cause,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('TuiPilotError')
    expect(error.code).toBe('session_failed')
    expect(error.cause).toBe(cause)
  })
})
