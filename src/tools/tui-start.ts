import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import {
  discoverTerminalWindow,
  buildWindowHelper,
  type WindowHelperResult,
} from '../controllers/macos-window.js'
import { getTerminalBackendDefinition, launchTerminal } from '../controllers/wezterm.js'
import { killSession, startSession } from '../controllers/tmux.js'
import {
  getTerminalBackendPath,
  parseTerminalBackendPreference,
  probeRuntimeDependencies,
  resolveTerminalBackend,
} from '../lib/env.js'
import { TuiPilotError, toTuiPilotError } from '../lib/errors.js'
import type { SessionRecord } from '../lib/types.js'

const inputSchema = z.object({
  cwd: z.string().min(1),
  command: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
})

type SessionStore = {
  save(record: SessionRecord): void
}

type TuiStartArgs = z.infer<typeof inputSchema>

function jsonText(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const WINDOW_DISCOVERY_ATTEMPTS = 20
const WINDOW_DISCOVERY_DELAY_MS = 150

async function cleanupFailedStart(tmuxSession: string, terminalPid: number | undefined) {
  if (terminalPid !== undefined) {
    try {
      process.kill(terminalPid)
    }
    catch {
      // Best-effort cleanup only; tmux teardown matters most.
    }
  }

  try {
    await killSession(tmuxSession)
  }
  catch {
    // Cleanup should not hide the startup failure.
  }
}

async function discoverWindowWithRetry(ownerName: string, terminalPid: number): Promise<WindowHelperResult> {
  let lastError: unknown

  for (let attempt = 0; attempt < WINDOW_DISCOVERY_ATTEMPTS; attempt += 1) {
    try {
      return await discoverTerminalWindow({ ownerName, pid: terminalPid })
    }
    catch (error) {
      lastError = error

      if (attempt === WINDOW_DISCOVERY_ATTEMPTS - 1) {
        break
      }

      await sleep(WINDOW_DISCOVERY_DELAY_MS)
    }
  }

  throw lastError
}

export function createTuiStartTool(store: SessionStore) {
  return {
    name: 'tui_start',
    description: 'Start a tmux-backed TUI session',
    inputSchema,
    async handler(args: TuiStartArgs) {
      const sessionId = randomUUID()
      const tmuxSession = `tui-pilot-${sessionId}`
      const runtimeDependencies = await probeRuntimeDependencies()
      const requestedBackend = parseTerminalBackendPreference(process.env.TUI_PILOT_TERMINAL_BACKEND)
      const backendSelection = resolveTerminalBackend(runtimeDependencies, requestedBackend)

      if (backendSelection.selectedBackend === null) {
        if (requestedBackend === 'auto') {
          throw new TuiPilotError('terminal_backend_unavailable', 'no supported terminal backend is installed', {
            hint: 'Install WezTerm or Ghostty, or add one of them to PATH so tui-pilot can auto-detect it.',
          })
        }

        throw new TuiPilotError('terminal_backend_unavailable', `requested terminal backend is unavailable: ${requestedBackend}`, {
          hint: `Install ${requestedBackend} or unset TUI_PILOT_TERMINAL_BACKEND to fall back to auto detection.`,
        })
      }

      const terminalBackend = backendSelection.selectedBackend
      const terminalInfo = getTerminalBackendDefinition(terminalBackend)
      const terminalPath = getTerminalBackendPath(runtimeDependencies, terminalBackend)

      if (!terminalPath) {
        throw new TuiPilotError('terminal_executable_missing', `selected terminal backend has no executable path: ${terminalBackend}`, {
          hint: 'Reinstall the terminal app or make sure its executable is available on PATH.',
        })
      }

      try {
        await startSession({
          session: tmuxSession,
          cwd: args.cwd,
          cols: args.cols,
          rows: args.rows,
          command: args.command,
        })
      }
      catch (error) {
        throw new TuiPilotError('tmux_start_failed', `failed to start tmux session ${tmuxSession}`, {
          cause: error instanceof Error ? error : undefined,
          hint: 'Verify tmux is installed and the cwd/command are valid.',
        })
      }

      let terminalPid: number | undefined
      let window: WindowHelperResult

      try {
        const terminal = launchTerminal(terminalBackend, tmuxSession, terminalPath)

        if (terminal.pid === undefined) {
          throw new TuiPilotError('terminal_launch_missing_pid', `${terminalInfo.binaryName} launch did not provide a pid`, {
            hint: `Verify ${terminalInfo.binaryName} can open a macOS GUI window in the current user session.`,
          })
        }

        terminalPid = terminal.pid

        try {
          await buildWindowHelper()
        }
        catch (error) {
          throw new TuiPilotError('window_helper_unavailable', 'failed to prepare the macOS window helper', {
            cause: error instanceof Error ? error : undefined,
            hint: 'Install swiftc and keep the checkout writable so tui-pilot can build the helper binary.',
          })
        }

        try {
          window = await discoverWindowWithRetry(terminalInfo.ownerName, terminalPid)
        }
        catch (error) {
          throw new TuiPilotError('terminal_window_discovery_failed', `failed to discover the ${terminalInfo.ownerName} window for ${tmuxSession}`, {
            cause: error instanceof Error ? error : undefined,
            hint: 'Keep the terminal window open and confirm the launcher app has Screen Recording permission.',
          })
        }

        terminalPid = window.pid
      }
      catch (error) {
        await cleanupFailedStart(tmuxSession, terminalPid)
        throw toTuiPilotError(error, {
          code: 'tui_start_failed',
          message: `failed to start terminal session ${tmuxSession}`,
          hint: 'Run tui_doctor to inspect backend selection, dependencies, and GUI readiness.',
        })
      }

      const canonicalTerminalPid = terminalPid ?? window.pid

      store.save({
        sessionId,
        tmuxSession,
        cwd: args.cwd,
        command: args.command,
        cols: args.cols,
        rows: args.rows,
        terminalWindowId: window.windowId,
        terminalPid: canonicalTerminalPid,
        terminalBackend,
        windowBounds: window.bounds,
        seq: 0,
      })

      return jsonText({
        sessionId,
        tmuxSession,
        cwd: args.cwd,
        command: args.command,
        cols: args.cols,
        rows: args.rows,
        terminalWindowId: window.windowId,
        terminalPid: canonicalTerminalPid,
        terminalBackend,
        windowBounds: window.bounds,
      })
    },
  }
}
