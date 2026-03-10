import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

import { z } from 'zod'

import { captureWindow, discoverTerminalWindow } from '../controllers/macos-window.js'
import { getTerminalBackendDefinition } from '../controllers/wezterm.js'
import { TuiPilotError, toTuiPilotError } from '../lib/errors.js'
import { readPngSize } from '../lib/png.js'
import { captureAnsi, capturePlain } from '../controllers/tmux.js'
import type { SessionRecord, WindowBounds } from '../lib/types.js'
import { assembleSnapshot } from '../services/snapshot.js'

const inputSchema = z.object({
  sessionId: z.string().min(1),
})

const toolsDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(toolsDir, '../..')

type SessionStore = {
  get(sessionId: string): SessionRecord | undefined
  save(record: SessionRecord): void
  update<T>(sessionId: string, updater: (record: SessionRecord) => { record: SessionRecord, value: T }): T | undefined
}

type TuiSnapshotArgs = z.infer<typeof inputSchema>

function jsonText(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  }
}

function resolveWindowBounds(session: SessionRecord): WindowBounds {
  return session.windowBounds ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  }
}

export function createTuiSnapshotTool(store: SessionStore) {
  return {
    name: 'tui_snapshot',
    description: 'Capture text and image state for a session',
    inputSchema,
    async handler(args: TuiSnapshotArgs) {
      try {
        const session = store.update(args.sessionId, (current) => {
          if (current.terminalWindowId === null) {
            throw new TuiPilotError('session_missing_window', `session has no terminal window: ${args.sessionId}`, {
              hint: 'Call tui_start again to recreate the terminal window.',
            })
          }

          const next = {
            ...current,
            seq: current.seq + 1,
          }

          return {
            record: next,
            value: next,
          }
        })

        if (!session) {
          throw new TuiPilotError('session_not_found', `unknown session: ${args.sessionId}`, {
            hint: 'Call tui_start before requesting snapshots.',
          })
        }

        if (session.terminalWindowId === null) {
          throw new TuiPilotError('session_missing_window', `session has no terminal window: ${args.sessionId}`, {
            hint: 'Call tui_start again to recreate the terminal window.',
          })
        }

        const seq = session.seq
        const artifactDir = path.resolve(projectRoot, '.tui-pilot/artifacts', session.sessionId)
        const imageFile = path.resolve(artifactDir, `snapshot-${seq}.png`)

        await mkdir(artifactDir, { recursive: true })

        let terminalWindowId = session.terminalWindowId
        let terminalPid = session.terminalPid
        let bounds = resolveWindowBounds(session)

        if (terminalPid !== null) {
          const terminalInfo = getTerminalBackendDefinition(session.terminalBackend)

          try {
            const refreshedWindow = await discoverTerminalWindow({
              ownerName: terminalInfo.ownerName,
              pid: terminalPid,
            })

            terminalWindowId = refreshedWindow.windowId
            terminalPid = refreshedWindow.pid
            bounds = refreshedWindow.bounds
          }
          catch (error) {
            throw new TuiPilotError('terminal_window_refresh_failed', `failed to refresh the ${terminalInfo.ownerName} window for session ${session.sessionId}`, {
              cause: error instanceof Error ? error : undefined,
              hint: 'The terminal window may have closed; rerun tui_start if you need a fresh session.',
            })
          }
        }

        let plainText: string
        let ansiText: string

        try {
          const [plainResult, ansiResult] = await Promise.all([
            capturePlain(session.tmuxSession),
            captureAnsi(session.tmuxSession),
          ])

          plainText = plainResult.stdout
          ansiText = ansiResult.stdout
        }
        catch (error) {
          throw new TuiPilotError('tmux_capture_failed', `failed to capture tmux pane for session ${session.sessionId}`, {
            cause: error instanceof Error ? error : undefined,
            hint: 'Confirm the tmux session is still running before taking another snapshot.',
          })
        }

        let imageSize: { width: number, height: number }

        try {
          await captureWindow(terminalWindowId, imageFile)
        }
        catch (error) {
          throw new TuiPilotError('window_capture_failed', `failed to capture window ${terminalWindowId} for session ${session.sessionId}`, {
            cause: error instanceof Error ? error : undefined,
            hint: 'Grant Screen Recording permission to the launcher app and keep the terminal window visible.',
          })
        }

        try {
          imageSize = await readPngSize(imageFile)
        }
        catch (error) {
          throw new TuiPilotError('png_metadata_read_failed', `failed to read PNG metadata for session ${session.sessionId}`, {
            cause: error instanceof Error ? error : undefined,
            hint: 'The screenshot file may be incomplete or corrupted; inspect the saved PNG artifact directly.',
          })
        }

        const lines = plainText.split(/\r?\n/)
        const snapshot = assembleSnapshot({
          sessionId: session.sessionId,
          seq,
          timestamp: new Date().toISOString(),
          cols: session.cols,
          rows: session.rows,
          stable: false,
          ansiText,
          plainText,
          lines,
          imageArtifactId: imageFile,
          imageWidth: imageSize.width,
          imageHeight: imageSize.height,
          bounds,
        })

        store.update(session.sessionId, (current) => ({
          record: current.seq > seq
            ? current
            : {
                ...current,
                terminalWindowId,
                terminalPid,
                windowBounds: bounds,
                seq,
              },
          value: undefined,
        }))

        return jsonText(snapshot)
      }
      catch (error) {
        throw toTuiPilotError(error, {
          code: 'tui_snapshot_failed',
          message: `failed to capture snapshot for session ${args.sessionId}`,
          hint: 'Run tui_doctor if the environment changed or the GUI session is unavailable.',
        })
      }
    },
  }
}
