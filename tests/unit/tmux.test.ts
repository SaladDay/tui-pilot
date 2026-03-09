import { beforeEach, describe, expect, it, vi } from 'vitest'

const execaMock = vi.fn()

vi.mock('execa', () => ({
  execa: execaMock,
}))

describe('tmux controller', () => {
  beforeEach(() => {
    execaMock.mockReset()
    execaMock.mockResolvedValue({ stdout: '', stderr: '' })
  })

  it('builds start-session args from the provided dimensions and command', async () => {
    const { buildTmuxStartArgs } = await import('../../src/controllers/tmux.js')

    expect(
      buildTmuxStartArgs({
        session: 'pilot-1',
        cwd: '/tmp/project',
        cols: 120,
        rows: 40,
        command: 'npm test',
      }),
    ).toEqual([
      'new-session',
      '-d',
      '-s',
      'pilot-1',
      '-c',
      '/tmp/project',
      '-x',
      '120',
      '-y',
      '40',
      'npm test',
    ])
  })

  it('runs tmux commands through execa', async () => {
    const { tmux } = await import('../../src/controllers/tmux.js')
    const args = ['list-sessions']

    await tmux(args)

    expect(execaMock).toHaveBeenCalledWith('tmux', args)
  })

  it('starts a detached session with the expected args', async () => {
    const { startSession } = await import('../../src/controllers/tmux.js')

    await startSession({
      session: 'pilot-2',
      cwd: '/tmp/server',
      cols: 132,
      rows: 36,
      command: 'node server.js',
    })

    expect(execaMock).toHaveBeenCalledWith('tmux', [
      'new-session',
      '-d',
      '-s',
      'pilot-2',
      '-c',
      '/tmp/server',
      '-x',
      '132',
      '-y',
      '36',
      'node server.js',
    ])
  })

  it('sends keys to a target session', async () => {
    const { sendKeys } = await import('../../src/controllers/tmux.js')

    await sendKeys('pilot-3', ['C-c', 'Enter'])

    expect(execaMock).toHaveBeenCalledWith('tmux', [
      'send-keys',
      '-t',
      'pilot-3',
      'C-c',
      'Enter',
    ])
  })

  it('types literal text without tmux key translation', async () => {
    const { typeLiteral } = await import('../../src/controllers/tmux.js')

    await typeLiteral('pilot-4', 'npm run dev')

    expect(execaMock).toHaveBeenCalledWith('tmux', [
      'send-keys',
      '-t',
      'pilot-4',
      '-l',
      'npm run dev',
    ])
  })

  it('captures plain pane output', async () => {
    const { capturePlain } = await import('../../src/controllers/tmux.js')

    await capturePlain('pilot-5')

    expect(execaMock).toHaveBeenCalledWith('tmux', [
      'capture-pane',
      '-p',
      '-t',
      'pilot-5',
    ])
  })

  it('captures ansi pane output', async () => {
    const { captureAnsi } = await import('../../src/controllers/tmux.js')

    await captureAnsi('pilot-6')

    expect(execaMock).toHaveBeenCalledWith('tmux', [
      'capture-pane',
      '-e',
      '-p',
      '-t',
      'pilot-6',
    ])
  })

  it('kills the target session', async () => {
    const { killSession } = await import('../../src/controllers/tmux.js')

    await killSession('pilot-7')

    expect(execaMock).toHaveBeenCalledWith('tmux', [
      'kill-session',
      '-t',
      'pilot-7',
    ])
  })
})
