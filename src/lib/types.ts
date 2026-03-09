import type { TerminalBackend } from './env.js'

export type WindowBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type SessionRecord = {
  sessionId: string
  tmuxSession: string
  cwd: string
  command: string
  cols: number
  rows: number
  terminalWindowId: number | null
  terminalPid: number | null
  terminalBackend: TerminalBackend
  windowBounds?: WindowBounds
  seq: number
}
