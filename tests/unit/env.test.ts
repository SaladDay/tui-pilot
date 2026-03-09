import { describe, expect, it } from 'vitest'

import { resolveRuntimeDependencies } from '../../src/lib/env.js'

describe('resolveRuntimeDependencies', () => {
  it('returns ok with an empty missing list when all tools are present', () => {
    const result = resolveRuntimeDependencies({
      tmuxPath: '/opt/homebrew/bin/tmux',
      weztermPath: '/Applications/WezTerm.app/Contents/MacOS/wezterm',
      screencapturePath: '/usr/sbin/screencapture',
      swiftcPath: '/usr/bin/swiftc',
    })

    expect(result).toEqual({
      ok: true,
      missing: [],
    })
  })

  it('marks missing tools clearly', () => {
    const result = resolveRuntimeDependencies({
      tmuxPath: null,
      weztermPath: '/usr/local/bin/wezterm',
      screencapturePath: '/usr/sbin/screencapture',
      swiftcPath: '/usr/bin/swiftc',
    })

    expect(result).toEqual({
      ok: false,
      missing: ['tmux'],
    })
  })

  it('returns every missing tool in dependency order', () => {
    const result = resolveRuntimeDependencies({
      tmuxPath: null,
      weztermPath: null,
      screencapturePath: '/usr/sbin/screencapture',
      swiftcPath: null,
    })

    expect(result).toEqual({
      ok: false,
      missing: ['tmux', 'wezterm', 'swiftc'],
    })
  })
})
