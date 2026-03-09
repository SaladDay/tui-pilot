import { execa } from 'execa'

export type TmuxStartInput = {
  session: string
  cwd: string
  cols: number
  rows: number
  command: string
}

export function buildTmuxStartArgs(input: TmuxStartInput) {
  return [
    'new-session',
    '-d',
    '-s',
    input.session,
    '-c',
    input.cwd,
    '-x',
    String(input.cols),
    '-y',
    String(input.rows),
    input.command,
  ]
}

export function tmux(args: readonly string[]) {
  return execa('tmux', [...args])
}

export function startSession(input: TmuxStartInput) {
  return tmux(buildTmuxStartArgs(input))
}

export function sendKeys(session: string, keys: readonly string[]) {
  return tmux(['send-keys', '-t', session, ...keys])
}

export function typeLiteral(session: string, text: string) {
  return tmux(['send-keys', '-t', session, '-l', text])
}

export function capturePlain(session: string) {
  return tmux(['capture-pane', '-p', '-t', session])
}

export function captureAnsi(session: string) {
  return tmux(['capture-pane', '-e', '-p', '-t', session])
}

export function killSession(session: string) {
  return tmux(['kill-session', '-t', session])
}
