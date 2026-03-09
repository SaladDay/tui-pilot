import { beforeEach, describe, expect, it, vi } from 'vitest'

const execaMock = vi.fn()

vi.mock('execa', () => ({
  execa: execaMock,
}))

describe('wezterm controller', () => {
  beforeEach(() => {
    execaMock.mockReset()
  })

  it('builds wezterm args that attach tmux to the target session', async () => {
    const { buildWeztermArgs } = await import('../../src/controllers/wezterm.js')

    expect(buildWeztermArgs('pilot-1')).toEqual([
      'start',
      '--always-new-process',
      '--',
      'tmux',
      'attach',
      '-t',
      'pilot-1',
    ])
  })

  it('launches wezterm in a detached process for the target session and unreferences it', async () => {
    const { launchWezterm } = await import('../../src/controllers/wezterm.js')
    const unref = vi.fn()
    const rejection = new Error('wezterm failed to launch')
    const catchMock = vi.fn((onRejected: (error: unknown) => undefined) =>
      Promise.reject(rejection).catch(onRejected),
    )

    execaMock.mockReturnValue({
      catch: catchMock,
      pid: 4242,
      unref,
    })

    expect(launchWezterm('pilot-2')).toEqual({ pid: 4242 })

    expect(execaMock).toHaveBeenCalledWith(
      'wezterm',
      ['start', '--always-new-process', '--', 'tmux', 'attach', '-t', 'pilot-2'],
      {
        detached: true,
        stdio: 'ignore',
      },
    )
    expect(catchMock).toHaveBeenCalledTimes(1)
    await expect(catchMock.mock.results[0]?.value).resolves.toBeUndefined()
    expect(unref).toHaveBeenCalledTimes(1)
  })
})
