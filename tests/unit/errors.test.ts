import { describe, expect, it } from 'vitest'

import { toTuiPilotError, TuiPilotError } from '../../src/lib/errors.js'

describe('TuiPilotError', () => {
  it('preserves the wrapped cause', () => {
    const cause = new Error('root cause')
    const error = new TuiPilotError('session_failed', 'unable to start session', {
      cause,
      hint: 'retry from a local GUI session',
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('TuiPilotError')
    expect(error.code).toBe('session_failed')
    expect(error.cause).toBe(cause)
    expect(error.hint).toBe('retry from a local GUI session')
    expect(error.message).toContain('session_failed')
    expect(error.message).toContain('retry from a local GUI session')
  })

  it('wraps unknown errors with a fallback code and hint', () => {
    const wrapped = toTuiPilotError(new Error('boom'), {
      code: 'window_capture_failed',
      message: 'failed to capture the terminal window',
      hint: 'grant Screen Recording permission to the launcher app',
    })

    expect(wrapped).toBeInstanceOf(TuiPilotError)
    expect(wrapped).toMatchObject({
      code: 'window_capture_failed',
      hint: 'grant Screen Recording permission to the launcher app',
    })
    expect(wrapped.cause).toBeInstanceOf(Error)
    expect(wrapped.message).toContain('boom')
  })

  it('returns the original TuiPilotError unchanged', () => {
    const original = new TuiPilotError('session_not_found', 'unknown session: missing')

    expect(toTuiPilotError(original, {
      code: 'fallback_code',
      message: 'fallback message',
    })).toBe(original)
  })
})
