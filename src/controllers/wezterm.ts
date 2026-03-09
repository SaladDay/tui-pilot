import { execa } from 'execa'

import type { TerminalBackend } from '../lib/env.js'

export type WeztermLaunch = {
  pid: number | undefined
}

export type TerminalBackendDefinition = {
  backend: TerminalBackend
  binaryName: string
  ownerName: string
  buildArgs(tmuxSession: string): string[]
}

const TERMINAL_BACKEND_DEFINITIONS: Record<TerminalBackend, TerminalBackendDefinition> = {
  wezterm: {
    backend: 'wezterm',
    binaryName: 'wezterm',
    ownerName: 'WezTerm',
    buildArgs: tmuxSession => ['start', '--always-new-process', '--', 'tmux', 'attach', '-t', tmuxSession],
  },
  ghostty: {
    backend: 'ghostty',
    binaryName: 'ghostty',
    ownerName: 'Ghostty',
    buildArgs: tmuxSession => ['-e', 'tmux', 'attach', '-t', tmuxSession],
  },
}

export function getTerminalBackendDefinition(backend: TerminalBackend): TerminalBackendDefinition {
  return TERMINAL_BACKEND_DEFINITIONS[backend]
}

export function buildTerminalLaunchArgs(backend: TerminalBackend, tmuxSession: string) {
  return getTerminalBackendDefinition(backend).buildArgs(tmuxSession)
}

export function buildWeztermArgs(tmuxSession: string) {
  return buildTerminalLaunchArgs('wezterm', tmuxSession)
}

export function launchTerminal(
  backend: TerminalBackend,
  tmuxSession: string,
  executablePath = getTerminalBackendDefinition(backend).binaryName,
): WeztermLaunch {
  const subprocess = execa(executablePath, buildTerminalLaunchArgs(backend, tmuxSession), {
    detached: true,
    stdio: 'ignore',
  })

  void subprocess.catch(() => undefined)
  subprocess.unref()

  return { pid: subprocess.pid }
}

export function launchWezterm(tmuxSession: string) {
  return launchTerminal('wezterm', tmuxSession)
}
