import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

import { z } from 'zod'

import { captureWindow, discoverWeztermWindow } from '../controllers/macos-window.js'
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
      const session = store.update(args.sessionId, (current) => {
        if (current.terminalWindowId === null) {
          throw new Error(`session has no terminal window: ${args.sessionId}`)
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
        throw new Error(`unknown session: ${args.sessionId}`)
      }

      if (session.terminalWindowId === null) {
        throw new Error(`session has no terminal window: ${args.sessionId}`)
      }

      const seq = session.seq
      const artifactDir = path.resolve(projectRoot, '.tui-pilot/artifacts', session.sessionId)
      const imageFile = path.resolve(artifactDir, `snapshot-${seq}.png`)

      await mkdir(artifactDir, { recursive: true })

      let terminalWindowId = session.terminalWindowId
      let terminalPid = session.terminalPid
      let bounds = resolveWindowBounds(session)

      if (terminalPid !== null) {
        const refreshedWindow = await discoverWeztermWindow({ pid: terminalPid })

        terminalWindowId = refreshedWindow.windowId
        terminalPid = refreshedWindow.pid
        bounds = refreshedWindow.bounds
      }

      const [{ stdout: plainText }, { stdout: ansiText }] = await Promise.all([
        capturePlain(session.tmuxSession),
        captureAnsi(session.tmuxSession),
      ])

      await captureWindow(terminalWindowId, imageFile)
      const imageSize = await readPngSize(imageFile)

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
    },
  }
}
