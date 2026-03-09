import { fileURLToPath } from 'node:url'
import { constants } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const accessMock = vi.fn()
const execaMock = vi.fn()
const SCREEN_CAPTURE_PATH = '/usr/sbin/screencapture'

vi.mock('node:fs/promises', () => ({
  access: accessMock,
}))

vi.mock('execa', () => ({
  execa: execaMock,
}))

describe('macos window controller', () => {
  beforeEach(() => {
    accessMock.mockReset()
    accessMock.mockResolvedValue(undefined)
    execaMock.mockReset()
  })

  it('parses the helper JSON output into window metadata', async () => {
    const { parseWindowHelperOutput } = await import('../../src/controllers/macos-window.js')
    const raw = JSON.stringify({
      windowId: 123,
      pid: 456,
      bounds: {
        x: 10,
        y: 20,
        width: 800,
        height: 600,
      },
    })

    expect(parseWindowHelperOutput(raw)).toEqual({
      windowId: 123,
      pid: 456,
      bounds: {
        x: 10,
        y: 20,
        width: 800,
        height: 600,
      },
    })
  })

  it('rejects malformed JSON from the helper', async () => {
    const { parseWindowHelperOutput } = await import('../../src/controllers/macos-window.js')

    expect(() => parseWindowHelperOutput('not json')).toThrow(/invalid json/i)
  })

  it('rejects helper payloads that do not match the expected schema', async () => {
    const { parseWindowHelperOutput } = await import('../../src/controllers/macos-window.js')
    const raw = JSON.stringify({
      windowId: '123',
      pid: 456,
      bounds: {
        x: 10,
        y: 20,
        width: 800,
        height: 600,
      },
    })

    expect(() => parseWindowHelperOutput(raw)).toThrow(/invalid payload/i)
  })

  it('runs the build script for the native helper', async () => {
    const { buildWindowHelper } = await import('../../src/controllers/macos-window.js')
    const expectedScriptPath = fileURLToPath(
      new URL('../../scripts/build-window-helper.sh', import.meta.url),
    )
    const expectedHelperPath = fileURLToPath(
      new URL('../../.tui-pilot/bin/window-helper', import.meta.url),
    )

    accessMock.mockRejectedValueOnce(new Error('missing binary'))
    execaMock.mockResolvedValue({})

    await buildWindowHelper()

    expect(accessMock).toHaveBeenCalledWith(expectedHelperPath, constants.X_OK)
    expect(execaMock).toHaveBeenCalledWith(expectedScriptPath)
  })

  it('skips rebuilding the native helper when the compiled binary already exists', async () => {
    const { buildWindowHelper } = await import('../../src/controllers/macos-window.js')
    const expectedHelperPath = fileURLToPath(
      new URL('../../.tui-pilot/bin/window-helper', import.meta.url),
    )

    await buildWindowHelper()

    expect(accessMock).toHaveBeenCalledWith(expectedHelperPath, constants.X_OK)
    expect(execaMock).not.toHaveBeenCalled()
  })

  it('rebuilds the native helper when the compiled binary is not executable', async () => {
    const { buildWindowHelper } = await import('../../src/controllers/macos-window.js')
    const expectedScriptPath = fileURLToPath(
      new URL('../../scripts/build-window-helper.sh', import.meta.url),
    )

    accessMock.mockRejectedValueOnce(new Error('not executable'))
    execaMock.mockResolvedValue({})

    await buildWindowHelper()

    expect(execaMock).toHaveBeenCalledWith(expectedScriptPath)
  })

  it('discovers the frontmost WezTerm window through the helper binary', async () => {
    const { discoverWeztermWindow } = await import('../../src/controllers/macos-window.js')
    const expectedHelperPath = fileURLToPath(
      new URL('../../.tui-pilot/bin/window-helper', import.meta.url),
    )
    const helperOutput = JSON.stringify({
      windowId: 789,
      pid: 999,
      bounds: {
        x: 30,
        y: 40,
        width: 1200,
        height: 700,
      },
    })

    execaMock.mockResolvedValue({ stdout: helperOutput })

    await expect(discoverWeztermWindow()).resolves.toEqual({
      windowId: 789,
      pid: 999,
      bounds: {
        x: 30,
        y: 40,
        width: 1200,
        height: 700,
      },
    })

    expect(execaMock).toHaveBeenCalledWith(expectedHelperPath, ['--owner', 'WezTerm'])
  })

  it('passes the launched terminal pid to the helper when discovering a window', async () => {
    const { discoverWeztermWindow } = await import('../../src/controllers/macos-window.js')
    const expectedHelperPath = fileURLToPath(
      new URL('../../.tui-pilot/bin/window-helper', import.meta.url),
    )
    const helperOutput = JSON.stringify({
      windowId: 789,
      pid: 999,
      bounds: {
        x: 30,
        y: 40,
        width: 1200,
        height: 700,
      },
    })

    execaMock.mockResolvedValue({ stdout: helperOutput })

    await discoverWeztermWindow({ pid: 999 })

    expect(execaMock).toHaveBeenCalledWith(expectedHelperPath, ['--owner', 'WezTerm', '--pid', '999'])
  })

  it('captures a single window to the requested output path', async () => {
    const { captureWindow } = await import('../../src/controllers/macos-window.js')

    execaMock.mockResolvedValue({})

    await captureWindow(321, 'artifacts/window.png')

    expect(execaMock).toHaveBeenCalledWith(SCREEN_CAPTURE_PATH, [
      '-x',
      '-o',
      '-l321',
      'artifacts/window.png',
    ])
  })

  it('passes absolute output paths through unchanged when capturing a window', async () => {
    const { captureWindow } = await import('../../src/controllers/macos-window.js')

    execaMock.mockResolvedValue({})

    await captureWindow(654, '/tmp/tui-pilot/window.png')

    expect(execaMock).toHaveBeenCalledWith(SCREEN_CAPTURE_PATH, [
      '-x',
      '-o',
      '-l654',
      '/tmp/tui-pilot/window.png',
    ])
  })
})
