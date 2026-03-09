import { constants } from 'node:fs'
import { access } from 'node:fs/promises'

import { execa } from 'execa'

export const TERMINAL_BACKENDS = ['wezterm', 'ghostty'] as const

export type TerminalBackend = (typeof TERMINAL_BACKENDS)[number]
export type TerminalBackendPreference = TerminalBackend | 'auto'

export type RuntimeDependencyProbe = {
  tmuxPath: string | null
  weztermPath: string | null
  ghosttyPath: string | null
  screencapturePath: string | null
  swiftcPath: string | null
}

const PATH_CANDIDATES = {
  tmux: ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux'],
  wezterm: [
    '/Applications/WezTerm.app/Contents/MacOS/wezterm',
    '/opt/homebrew/bin/wezterm',
    '/usr/local/bin/wezterm',
  ],
  ghostty: [
    '/Applications/Ghostty.app/Contents/MacOS/ghostty',
    '/opt/homebrew/bin/ghostty',
    '/usr/local/bin/ghostty',
  ],
  screencapture: ['/usr/sbin/screencapture'],
  swiftc: ['/usr/bin/swiftc', '/opt/homebrew/bin/swiftc', '/usr/local/bin/swiftc'],
} as const

export function parseTerminalBackendPreference(value: string | null | undefined): TerminalBackendPreference {
  if (value === 'wezterm' || value === 'ghostty') {
    return value
  }

  return 'auto'
}

export function getAvailableTerminalBackends(probe: RuntimeDependencyProbe): TerminalBackend[] {
  return TERMINAL_BACKENDS.filter((backend) => getTerminalBackendPath(probe, backend) !== null)
}

export function getTerminalBackendPath(probe: RuntimeDependencyProbe, backend: TerminalBackend): string | null {
  switch (backend) {
    case 'wezterm':
      return probe.weztermPath
    case 'ghostty':
      return probe.ghosttyPath
  }
}

export function resolveTerminalBackend(
  probe: RuntimeDependencyProbe,
  requestedBackend: TerminalBackendPreference = 'auto',
) {
  const availableTerminalBackends = getAvailableTerminalBackends(probe)

  return {
    requestedBackend,
    selectedBackend: requestedBackend === 'auto'
      ? availableTerminalBackends[0] ?? null
      : availableTerminalBackends.includes(requestedBackend)
        ? requestedBackend
        : null,
    availableTerminalBackends,
  }
}

export function resolveRuntimeDependencies(probe: RuntimeDependencyProbe) {
  const missing = [
    ['tmux', probe.tmuxPath],
    ['screencapture', probe.screencapturePath],
    ['swiftc', probe.swiftcPath],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  const availableTerminalBackends = getAvailableTerminalBackends(probe)

  if (availableTerminalBackends.length === 0) {
    missing.push('terminal')
  }

  return {
    ok: missing.length === 0,
    availableTerminalBackends,
    missing,
  }
}

async function pathExists(filePath: string) {
  try {
    await access(filePath, constants.X_OK)
    return true
  }
  catch {
    return false
  }
}

async function resolveExecutablePath(command: string, knownPaths: readonly string[]) {
  for (const candidate of knownPaths) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }

  try {
    const { stdout } = await execa('which', [command])
    const resolvedPath = stdout.trim()

    return resolvedPath.length > 0 ? resolvedPath : null
  }
  catch {
    return null
  }
}

export async function probeRuntimeDependencies(): Promise<RuntimeDependencyProbe> {
  const [tmuxPath, weztermPath, ghosttyPath, screencapturePath, swiftcPath] = await Promise.all([
    resolveExecutablePath('tmux', PATH_CANDIDATES.tmux),
    resolveExecutablePath('wezterm', PATH_CANDIDATES.wezterm),
    resolveExecutablePath('ghostty', PATH_CANDIDATES.ghostty),
    resolveExecutablePath('screencapture', PATH_CANDIDATES.screencapture),
    resolveExecutablePath('swiftc', PATH_CANDIDATES.swiftc),
  ])

  return {
    tmuxPath,
    weztermPath,
    ghosttyPath,
    screencapturePath,
    swiftcPath,
  }
}
