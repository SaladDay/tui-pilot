import { z } from 'zod'

import { getTerminalBackendDefinition } from '../controllers/wezterm.js'
import {
  getTerminalBackendPath,
  parseTerminalBackendPreference,
  probeRuntimeDependencies,
  resolveRuntimeDependencies,
  resolveTerminalBackend,
} from '../lib/env.js'

const inputSchema = z.object({
  backend: z.enum(['auto', 'wezterm', 'ghostty']).optional(),
})

type TuiDoctorArgs = z.infer<typeof inputSchema>

function jsonText(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  }
}

function buildDependencyStatus(binaryPath: string | null) {
  return {
    available: binaryPath !== null,
    path: binaryPath,
  }
}

function isGuiSessionLikely() {
  return process.platform === 'darwin' && !process.env.SSH_CONNECTION && !process.env.SSH_TTY
}

function buildHints(
  dependencyStatus: ReturnType<typeof resolveRuntimeDependencies>,
  backendSelection: ReturnType<typeof resolveTerminalBackend>,
  backendSource: 'tool' | 'env' | 'env-invalid' | 'auto',
  configuredValue: string | null,
) {
  const hints: string[] = []

  if (process.platform !== 'darwin') {
    hints.push('tui-pilot currently supports macOS only.')
  }

  if (isGuiSessionLikely()) {
    hints.push('Keep the server running in an active local macOS GUI session so the terminal window can open.')
  }
  else {
    hints.push('A local macOS GUI session is usually required; SSH sessions often cannot open or discover terminal windows.')
  }

  hints.push('Grant Screen Recording permission to the app that launches tui-pilot; tui_doctor does not verify that permission automatically.')

  if (dependencyStatus.missing.length > 0) {
    hints.push(`Missing runtime pieces: ${dependencyStatus.missing.join(', ')}.`)
  }

  if (backendSource === 'env-invalid' && configuredValue) {
    hints.push(`Ignoring invalid TUI_PILOT_TERMINAL_BACKEND value: ${configuredValue}. Use auto, wezterm, or ghostty.`)
  }

  if (backendSelection.selectedBackend === null) {
    if (backendSelection.requestedBackend === 'auto') {
      hints.push('Install WezTerm or Ghostty, or add one of them to PATH so tui-pilot can auto-detect it.')
    }
    else {
      hints.push(`Requested backend "${backendSelection.requestedBackend}" is unavailable; install it or unset TUI_PILOT_TERMINAL_BACKEND to return to auto detection.`)
    }
  }
  else {
    const terminalInfo = getTerminalBackendDefinition(backendSelection.selectedBackend)
    hints.push(`Selected backend "${backendSelection.selectedBackend}" will discover windows owned by "${terminalInfo.ownerName}".`)
  }

  return hints
}

export function createTuiDoctorTool() {
  return {
    name: 'tui_doctor',
    description: 'Inspect dependencies, backend selection, and GUI hints',
    inputSchema,
    async handler(args: TuiDoctorArgs) {
      const configuredValue = args.backend ?? process.env.TUI_PILOT_TERMINAL_BACKEND ?? null
      const requestedBackend = parseTerminalBackendPreference(configuredValue)
      const runtimeDependencies = await probeRuntimeDependencies()
      const dependencyStatus = resolveRuntimeDependencies(runtimeDependencies)
      const backendSelection = resolveTerminalBackend(runtimeDependencies, requestedBackend)
      const selectedBackend = backendSelection.selectedBackend
      const selectedBackendInfo = selectedBackend ? getTerminalBackendDefinition(selectedBackend) : null
      const backendSource = args.backend !== undefined
        ? 'tool'
        : process.env.TUI_PILOT_TERMINAL_BACKEND
          ? requestedBackend === 'auto' && process.env.TUI_PILOT_TERMINAL_BACKEND !== 'auto'
            ? 'env-invalid'
            : 'env'
          : 'auto'
      const automaticChecksPassed = process.platform === 'darwin'
        && dependencyStatus.ok
        && selectedBackend !== null
        && isGuiSessionLikely()
      const manualChecksRequired = ['screen-recording']

      return jsonText({
        ok: automaticChecksPassed,
        automaticChecksPassed,
        platform: process.platform,
        backend: {
          requested: backendSelection.requestedBackend,
          selected: selectedBackend,
          available: backendSelection.availableTerminalBackends,
          configuredValue,
          configuredValueValid: configuredValue === null
            ? null
            : configuredValue === 'auto' || configuredValue === 'wezterm' || configuredValue === 'ghostty',
          ownerName: selectedBackendInfo?.ownerName ?? null,
          executablePath: selectedBackend ? getTerminalBackendPath(runtimeDependencies, selectedBackend) : null,
          source: backendSource,
        },
        dependencies: {
          tmux: buildDependencyStatus(runtimeDependencies.tmuxPath),
          wezterm: buildDependencyStatus(runtimeDependencies.weztermPath),
          ghostty: buildDependencyStatus(runtimeDependencies.ghosttyPath),
          screencapture: buildDependencyStatus(runtimeDependencies.screencapturePath),
          swiftc: buildDependencyStatus(runtimeDependencies.swiftcPath),
        },
        missing: dependencyStatus.missing,
        environment: {
          guiSessionLikely: isGuiSessionLikely(),
          sshDetected: Boolean(process.env.SSH_CONNECTION || process.env.SSH_TTY),
          screenRecordingCheck: 'manual',
        },
        manualChecksRequired,
        hints: buildHints(dependencyStatus, backendSelection, backendSource, configuredValue),
      })
    },
  }
}
