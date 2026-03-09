import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import {
  discoverWeztermWindow,
  buildWindowHelper,
  type WindowHelperResult,
} from '../controllers/macos-window.js'
import { launchWezterm } from '../controllers/wezterm.js'
import { killSession, startSession } from '../controllers/tmux.js'
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

async function discoverWindowWithRetry(terminalPid: number): Promise<WindowHelperResult> {
  let lastError: unknown

  for (let attempt = 0; attempt < WINDOW_DISCOVERY_ATTEMPTS; attempt += 1) {
    try {
      return await discoverWeztermWindow({ pid: terminalPid })
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
        const terminal = launchWezterm(tmuxSession)

        if (terminal.pid === undefined) {
          throw new Error('wezterm launch did not provide a pid')
        }

        terminalPid = terminal.pid
        await buildWindowHelper()
        window = await discoverWindowWithRetry(terminalPid)
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
        windowBounds: window.bounds,
      })
    },
  }
}
