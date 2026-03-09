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
          throw new Error('no supported terminal backend is installed')
        }

        throw new Error(`requested terminal backend is unavailable: ${requestedBackend}`)
      }

      const terminalBackend = backendSelection.selectedBackend
      const terminalInfo = getTerminalBackendDefinition(terminalBackend)
      const terminalPath = getTerminalBackendPath(runtimeDependencies, terminalBackend)

      if (!terminalPath) {
        throw new Error(`selected terminal backend has no executable path: ${terminalBackend}`)
      }

      await startSession({
        session: tmuxSession,
        cwd: args.cwd,
        cols: args.cols,
        rows: args.rows,
        command: args.command,
      })

      let terminalPid: number | undefined
      let window: WindowHelperResult

      try {
        const terminal = launchTerminal(terminalBackend, tmuxSession, terminalPath)

        if (terminal.pid === undefined) {
          throw new Error(`${terminalInfo.binaryName} launch did not provide a pid`)
        }

        terminalPid = terminal.pid
        await buildWindowHelper()
        window = await discoverWindowWithRetry(terminalInfo.ownerName, terminalPid)
        terminalPid = window.pid
      }
      catch (error) {
        await cleanupFailedStart(tmuxSession, terminalPid)
        throw error
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
