import { describe, expect, it } from 'vitest'

import {
  parseTerminalBackendPreference,
  resolveRuntimeDependencies,
  resolveTerminalBackend,
} from '../../src/lib/env.js'

describe('resolveRuntimeDependencies', () => {
  it('returns ok with an empty missing list when the default toolchain and WezTerm are present', () => {
    const result = resolveRuntimeDependencies({
      tmuxPath: '/opt/homebrew/bin/tmux',
      weztermPath: '/Applications/WezTerm.app/Contents/MacOS/wezterm',
      ghosttyPath: null,
      screencapturePath: '/usr/sbin/screencapture',
      swiftcPath: '/usr/bin/swiftc',
    })

    expect(result).toEqual({
      ok: true,
      availableTerminalBackends: ['wezterm'],
      missing: [],
    })
  })

  it('accepts Ghostty as the only installed terminal backend', () => {
    const result = resolveRuntimeDependencies({
      tmuxPath: '/opt/homebrew/bin/tmux',
      weztermPath: null,
      ghosttyPath: '/Applications/Ghostty.app/Contents/MacOS/ghostty',
      screencapturePath: '/usr/sbin/screencapture',
      swiftcPath: '/usr/bin/swiftc',
    })

    expect(result).toEqual({
      ok: true,
      availableTerminalBackends: ['ghostty'],
      missing: [],
    })
  })

  it('returns every missing dependency in a stable order when no terminal backend is installed', () => {
    const result = resolveRuntimeDependencies({
      tmuxPath: null,
      weztermPath: null,
      ghosttyPath: null,
      screencapturePath: '/usr/sbin/screencapture',
      swiftcPath: null,
    })

    expect(result).toEqual({
      ok: false,
      availableTerminalBackends: [],
      missing: ['tmux', 'swiftc', 'terminal'],
    })
  })
})

describe('resolveTerminalBackend', () => {
  it('prefers WezTerm first during auto detection to preserve existing behavior', () => {
    const result = resolveTerminalBackend({
      tmuxPath: '/opt/homebrew/bin/tmux',
      weztermPath: '/Applications/WezTerm.app/Contents/MacOS/wezterm',
      ghosttyPath: '/Applications/Ghostty.app/Contents/MacOS/ghostty',
      screencapturePath: '/usr/sbin/screencapture',
      swiftcPath: '/usr/bin/swiftc',
    })

    expect(result).toEqual({
      requestedBackend: 'auto',
      selectedBackend: 'wezterm',
      availableTerminalBackends: ['wezterm', 'ghostty'],
    })
  })

  it('respects an explicit Ghostty request when Ghostty is available', () => {
    const result = resolveTerminalBackend({
      tmuxPath: '/opt/homebrew/bin/tmux',
      weztermPath: '/Applications/WezTerm.app/Contents/MacOS/wezterm',
      ghosttyPath: '/Applications/Ghostty.app/Contents/MacOS/ghostty',
      screencapturePath: '/usr/sbin/screencapture',
      swiftcPath: '/usr/bin/swiftc',
    }, 'ghostty')

    expect(result).toEqual({
      requestedBackend: 'ghostty',
      selectedBackend: 'ghostty',
      availableTerminalBackends: ['wezterm', 'ghostty'],
    })
  })
})

describe('parseTerminalBackendPreference', () => {
  it('normalizes invalid configuration values back to auto', () => {
    expect(parseTerminalBackendPreference('ghostty')).toBe('ghostty')
    expect(parseTerminalBackendPreference('wezterm')).toBe('wezterm')
    expect(parseTerminalBackendPreference('something-else')).toBe('auto')
    expect(parseTerminalBackendPreference(undefined)).toBe('auto')
  })
})
