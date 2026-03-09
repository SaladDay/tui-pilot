import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  randomUUIDMock: vi.fn(() => 'session-123'),
  probeRuntimeDependenciesMock: vi.fn(),
  resolveTerminalBackendMock: vi.fn(),
  parseTerminalBackendPreferenceMock: vi.fn(),
  getTerminalBackendPathMock: vi.fn(),
  mkdirMock: vi.fn(async () => undefined),
  startSessionMock: vi.fn(async () => undefined),
  killSessionMock: vi.fn(async () => undefined),
  sendKeysMock: vi.fn(async () => undefined),
  typeLiteralMock: vi.fn(async () => undefined),
  capturePlainMock: vi.fn(async () => ({ stdout: 'plain output' })),
  captureAnsiMock: vi.fn(async () => ({ stdout: '\u001b[32mplain output\u001b[39m' })),
  buildWindowHelperMock: vi.fn(async () => undefined),
  discoverTerminalWindowMock: vi.fn(async () => ({
    windowId: 789,
    pid: 4242,
    bounds: {
      x: 10,
      y: 20,
      width: 120,
      height: 40,
    },
  })),
  captureWindowMock: vi.fn(async () => undefined),
  readPngSizeMock: vi.fn(async () => ({ width: 240, height: 80 })),
  launchTerminalMock: vi.fn<() => { pid: number | undefined }>(() => ({ pid: 4242 })),
  getTerminalBackendDefinitionMock: vi.fn((backend: 'wezterm' | 'ghostty') => backend === 'ghostty'
    ? {
        backend: 'ghostty',
        binaryName: 'ghostty',
        ownerName: 'Ghostty',
      }
    : {
        backend: 'wezterm',
        binaryName: 'wezterm',
        ownerName: 'WezTerm',
      }),
}))

function createDependencyProbe(overrides: Partial<{
  tmuxPath: string | null
  weztermPath: string | null
  ghosttyPath: string | null
  screencapturePath: string | null
  swiftcPath: string | null
}> = {}) {
  return {
    tmuxPath: '/opt/homebrew/bin/tmux',
    weztermPath: '/Applications/WezTerm.app/Contents/MacOS/wezterm',
    ghosttyPath: null,
    screencapturePath: '/usr/sbin/screencapture',
    swiftcPath: '/usr/bin/swiftc',
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {
    promise,
    resolve,
    reject,
  }
}

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()

  return {
    ...actual,
    randomUUID: mocks.randomUUIDMock,
  }
})

vi.mock('node:fs/promises', () => ({
  mkdir: mocks.mkdirMock,
}))

vi.mock('../../src/lib/env.js', () => ({
  probeRuntimeDependencies: mocks.probeRuntimeDependenciesMock,
  resolveTerminalBackend: mocks.resolveTerminalBackendMock,
  parseTerminalBackendPreference: mocks.parseTerminalBackendPreferenceMock,
  getTerminalBackendPath: mocks.getTerminalBackendPathMock,
}))

vi.mock('../../src/controllers/tmux.js', () => ({
  startSession: mocks.startSessionMock,
  killSession: mocks.killSessionMock,
  sendKeys: mocks.sendKeysMock,
  typeLiteral: mocks.typeLiteralMock,
  capturePlain: mocks.capturePlainMock,
  captureAnsi: mocks.captureAnsiMock,
}))

vi.mock('../../src/controllers/macos-window.js', () => ({
  buildWindowHelper: mocks.buildWindowHelperMock,
  discoverTerminalWindow: mocks.discoverTerminalWindowMock,
  captureWindow: mocks.captureWindowMock,
}))

vi.mock('../../src/controllers/wezterm.js', () => ({
  launchTerminal: mocks.launchTerminalMock,
  getTerminalBackendDefinition: mocks.getTerminalBackendDefinitionMock,
}))

vi.mock('../../src/lib/png.js', () => ({
  readPngSize: mocks.readPngSizeMock,
}))

function parseToolResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0]?.text ?? '{}')
}

async function importTools() {
  const { buildToolList } = await import('../../src/server.js')
  return buildToolList()
}

function getTool(tools: Awaited<ReturnType<typeof importTools>>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name)

  if (!tool) {
    throw new Error(`missing tool: ${name}`)
  }

  return tool as {
    name: string
    handler(args: Record<string, unknown>): Promise<{ content: Array<{ text: string }> }>
  }
}

describe('buildToolList', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.spyOn(process, 'kill').mockImplementation(() => true)
    delete process.env.TUI_PILOT_TERMINAL_BACKEND

    mocks.probeRuntimeDependenciesMock.mockReset()
    mocks.probeRuntimeDependenciesMock.mockResolvedValue(createDependencyProbe())
    mocks.resolveTerminalBackendMock.mockReset()
    mocks.resolveTerminalBackendMock.mockImplementation((probe: ReturnType<typeof createDependencyProbe>, requestedBackend: 'auto' | 'wezterm' | 'ghostty' = 'auto') => {
      const availableTerminalBackends: Array<'wezterm' | 'ghostty'> = []

      if (probe.weztermPath) {
        availableTerminalBackends.push('wezterm')
      }

      if (probe.ghosttyPath) {
        availableTerminalBackends.push('ghostty')
      }

      return {
        requestedBackend,
        selectedBackend: requestedBackend === 'auto'
          ? availableTerminalBackends[0] ?? null
          : availableTerminalBackends.includes(requestedBackend)
            ? requestedBackend
            : null,
        availableTerminalBackends,
      }
    })
    mocks.parseTerminalBackendPreferenceMock.mockReset()
    mocks.parseTerminalBackendPreferenceMock.mockImplementation((value: string | null | undefined) => value === 'wezterm' || value === 'ghostty' ? value : 'auto')
    mocks.getTerminalBackendPathMock.mockReset()
    mocks.getTerminalBackendPathMock.mockImplementation((probe: ReturnType<typeof createDependencyProbe>, backend: 'wezterm' | 'ghostty') => {
      if (backend === 'ghostty') {
        return probe.ghosttyPath
      }

      return probe.weztermPath
    })

    mocks.randomUUIDMock.mockReset()
    mocks.randomUUIDMock.mockReturnValue('session-123')
    mocks.mkdirMock.mockReset()
    mocks.mkdirMock.mockResolvedValue(undefined)
    mocks.startSessionMock.mockReset()
    mocks.startSessionMock.mockResolvedValue(undefined)
    mocks.killSessionMock.mockReset()
    mocks.killSessionMock.mockResolvedValue(undefined)
    mocks.sendKeysMock.mockReset()
    mocks.sendKeysMock.mockResolvedValue(undefined)
    mocks.typeLiteralMock.mockReset()
    mocks.typeLiteralMock.mockResolvedValue(undefined)
    mocks.capturePlainMock.mockReset()
    mocks.capturePlainMock.mockResolvedValue({ stdout: 'plain output' })
    mocks.captureAnsiMock.mockReset()
    mocks.captureAnsiMock.mockResolvedValue({ stdout: '\u001b[32mplain output\u001b[39m' })
    mocks.buildWindowHelperMock.mockReset()
    mocks.buildWindowHelperMock.mockResolvedValue(undefined)
    mocks.discoverTerminalWindowMock.mockReset()
    mocks.discoverTerminalWindowMock.mockResolvedValue({
      windowId: 789,
      pid: 4242,
      bounds: {
        x: 10,
        y: 20,
        width: 120,
        height: 40,
      },
    })
    mocks.captureWindowMock.mockReset()
    mocks.captureWindowMock.mockResolvedValue(undefined)
    mocks.readPngSizeMock.mockReset()
    mocks.readPngSizeMock.mockResolvedValue({ width: 240, height: 80 })
    mocks.launchTerminalMock.mockReset()
    mocks.launchTerminalMock.mockReturnValue({ pid: 4242 })
    mocks.getTerminalBackendDefinitionMock.mockReset()
    mocks.getTerminalBackendDefinitionMock.mockImplementation((backend: 'wezterm' | 'ghostty') => backend === 'ghostty'
      ? {
          backend: 'ghostty',
          binaryName: 'ghostty',
          ownerName: 'Ghostty',
        }
      : {
          backend: 'wezterm',
          binaryName: 'wezterm',
          ownerName: 'WezTerm',
        })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the Phase 1 TUI tool names in order', async () => {
    const tools = await importTools()

    expect(tools.map((tool) => tool.name)).toEqual([
      'tui_start',
      'tui_send_keys',
      'tui_type',
      'tui_snapshot',
      'tui_stop',
    ])
  })

  it('starts a session with the requested dimensions and stores discovered window metadata', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')
    const snapshotTool = getTool(tools, 'tui_snapshot')

    const startResult = await startTool!.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    })
    const started = parseToolResult(startResult)

    expect(mocks.startSessionMock).toHaveBeenCalledWith({
      session: 'tui-pilot-session-123',
      cwd: '/tmp/project',
      cols: 132,
      rows: 36,
      command: 'npm run dev',
    })
    expect(mocks.launchTerminalMock).toHaveBeenCalledWith(
      'wezterm',
      'tui-pilot-session-123',
      '/Applications/WezTerm.app/Contents/MacOS/wezterm',
    )
    expect(mocks.discoverTerminalWindowMock).toHaveBeenCalledWith({ ownerName: 'WezTerm', pid: 4242 })
    expect(started).toMatchObject({
      sessionId: 'session-123',
      tmuxSession: 'tui-pilot-session-123',
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
      terminalWindowId: 789,
      terminalPid: 4242,
      terminalBackend: 'wezterm',
      windowBounds: {
        x: 10,
        y: 20,
        width: 120,
        height: 40,
      },
    })

    const snapshotResult = await snapshotTool!.handler({ sessionId: started.sessionId })
    const snapshot = parseToolResult(snapshotResult)

    expect(mocks.captureWindowMock).toHaveBeenCalledWith(
      789,
      expect.stringContaining('/.tui-pilot/artifacts/session-123/snapshot-1.png'),
    )
    expect(snapshot).toMatchObject({
      session: {
        sessionId: 'session-123',
        seq: 1,
      },
      screen: {
        stable: false,
      },
      visual: {
        imageWidth: 240,
        imageHeight: 80,
        windowBounds: {
          x: 10,
          y: 20,
          width: 120,
          height: 40,
        },
      },
    })
  })

  it('stores the discovered terminal pid as the canonical session pid', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')
    const snapshotTool = getTool(tools, 'tui_snapshot')

    mocks.launchTerminalMock.mockReturnValue({ pid: 4242 })
    mocks.discoverTerminalWindowMock
      .mockResolvedValueOnce({
        windowId: 789,
        pid: 5252,
        bounds: {
          x: 10,
          y: 20,
          width: 120,
          height: 40,
        },
      })
      .mockResolvedValueOnce({
        windowId: 790,
        pid: 5252,
        bounds: {
          x: 30,
          y: 40,
          width: 140,
          height: 50,
        },
      })

    const started = parseToolResult(await startTool!.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    }))

    expect(started).toMatchObject({
      terminalWindowId: 789,
      terminalPid: 5252,
    })

    await snapshotTool!.handler({ sessionId: started.sessionId })

    expect(mocks.discoverTerminalWindowMock).toHaveBeenNthCalledWith(1, { ownerName: 'WezTerm', pid: 4242 })
    expect(mocks.discoverTerminalWindowMock).toHaveBeenNthCalledWith(2, { ownerName: 'WezTerm', pid: 5252 })
  })

  it('cleans up the tmux session when startup fails after the session launches', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')

    mocks.discoverTerminalWindowMock.mockRejectedValue(new Error('window not found'))

    await expect(startTool!.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    })).rejects.toThrow('window not found')

    expect(mocks.killSessionMock).toHaveBeenCalledWith('tui-pilot-session-123')
  })

  it('fails fast when terminal launch does not provide a pid', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')

    mocks.launchTerminalMock.mockReturnValue({ pid: undefined })

    await expect(startTool!.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    })).rejects.toThrow('did not provide a pid')

    expect(mocks.buildWindowHelperMock).not.toHaveBeenCalled()
    expect(mocks.discoverTerminalWindowMock).not.toHaveBeenCalled()
    expect(mocks.killSessionMock).toHaveBeenCalledWith('tui-pilot-session-123')
  })

  it('uses the requested Ghostty backend when configured through the environment', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')

    process.env.TUI_PILOT_TERMINAL_BACKEND = 'ghostty'
    mocks.probeRuntimeDependenciesMock.mockResolvedValue(createDependencyProbe({
      ghosttyPath: '/Applications/Ghostty.app/Contents/MacOS/ghostty',
    }))

    const started = parseToolResult(await startTool.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    }))

    expect(mocks.launchTerminalMock).toHaveBeenCalledWith(
      'ghostty',
      'tui-pilot-session-123',
      '/Applications/Ghostty.app/Contents/MacOS/ghostty',
    )
    expect(mocks.discoverTerminalWindowMock).toHaveBeenCalledWith({ ownerName: 'Ghostty', pid: 4242 })
    expect(started.terminalBackend).toBe('ghostty')
  })

  it('retries window discovery across a short startup polling window before succeeding', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')

    for (let attempt = 0; attempt < 6; attempt += 1) {
      mocks.discoverTerminalWindowMock.mockRejectedValueOnce(new Error(`not ready ${attempt + 1}`))
    }

    mocks.discoverTerminalWindowMock.mockResolvedValueOnce({
      windowId: 790,
      pid: 4242,
      bounds: {
        x: 30,
        y: 40,
        width: 140,
        height: 50,
      },
    })

    const result = await startTool!.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    })

    expect(mocks.discoverTerminalWindowMock).toHaveBeenCalledTimes(7)
    expect(parseToolResult(result)).toMatchObject({
      terminalWindowId: 790,
      terminalPid: 4242,
    })
  })

  it('raises an unknown-session error when sending keys to a missing session', async () => {
    const tools = await importTools()
    const sendKeysTool = getTool(tools, 'tui_send_keys')

    await expect(sendKeysTool!.handler({
      sessionId: 'missing-session',
      keys: ['Enter'],
    })).rejects.toThrow('unknown session: missing-session')
  })

  it('increments the stored snapshot sequence on each capture', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')
    const snapshotTool = getTool(tools, 'tui_snapshot')

    const startResult = await startTool!.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    })
    const started = parseToolResult(startResult)
    const firstSnapshot = parseToolResult(await snapshotTool!.handler({ sessionId: started.sessionId }))
    const secondSnapshot = parseToolResult(await snapshotTool!.handler({ sessionId: started.sessionId }))

    expect(firstSnapshot.session.seq).toBe(1)
    expect(secondSnapshot.session.seq).toBe(2)
    expect(mocks.captureWindowMock).toHaveBeenNthCalledWith(
      2,
      789,
      expect.stringContaining('/.tui-pilot/artifacts/session-123/snapshot-2.png'),
    )
  })

  it('keeps the stored session when tmux stop fails for a non-missing reason', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')
    const stopTool = getTool(tools, 'tui_stop')
    const snapshotTool = getTool(tools, 'tui_snapshot')

    const startResult = await startTool!.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    })
    const started = parseToolResult(startResult)

    mocks.killSessionMock.mockRejectedValueOnce(new Error('tmux kill failed'))

    await expect(stopTool!.handler({ sessionId: started.sessionId })).rejects.toThrow('tmux kill failed')

    const snapshot = parseToolResult(await snapshotTool!.handler({ sessionId: started.sessionId }))

    expect(snapshot.session.sessionId).toBe(started.sessionId)
  })

  it('removes the stored session when tmux stop reports the session is already gone', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')
    const stopTool = getTool(tools, 'tui_stop')
    const snapshotTool = getTool(tools, 'tui_snapshot')

    const started = parseToolResult(await startTool!.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    }))

    const missingSessionError = Object.assign(new Error('can\'t find session: already gone'), {
      stderr: 'can\'t find session: already gone',
    })
    mocks.killSessionMock.mockRejectedValueOnce(missingSessionError)

    await expect(stopTool!.handler({ sessionId: started.sessionId })).resolves.toMatchObject({
      content: [
        {
          text: JSON.stringify({
            sessionId: started.sessionId,
            tmuxSession: started.tmuxSession,
            stopped: true,
          }),
        },
      ],
    })

    await expect(snapshotTool!.handler({ sessionId: started.sessionId })).rejects.toThrow(
      `unknown session: ${started.sessionId}`,
    )
  })

  it('allocates distinct snapshot sequence numbers under concurrent captures', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')
    const snapshotTool = getTool(tools, 'tui_snapshot')

    const startResult = await startTool!.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    })
    const started = parseToolResult(startResult)

    const snapshots = await Promise.all([
      snapshotTool!.handler({ sessionId: started.sessionId }),
      snapshotTool!.handler({ sessionId: started.sessionId }),
    ])

    const parsedSnapshots = snapshots.map(parseToolResult)
    const seqs = parsedSnapshots
      .map((snapshot) => snapshot.session.seq)
      .sort((left, right) => left - right)

    expect(seqs).toEqual([1, 2])
    expect(parsedSnapshots.map((snapshot) => snapshot.visual.imageArtifactId)).toEqual(expect.arrayContaining([
      expect.stringContaining('/.tui-pilot/artifacts/session-123/snapshot-1.png'),
      expect.stringContaining('/.tui-pilot/artifacts/session-123/snapshot-2.png'),
    ]))
  })

  it('does not let an older snapshot completion overwrite newer window metadata', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')
    const snapshotTool = getTool(tools, 'tui_snapshot')

    const started = parseToolResult(await startTool!.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    }))

    const olderDiscovery = createDeferred<{
      windowId: number
      pid: number
      bounds: { x: number, y: number, width: number, height: number }
    }>()
    const newerDiscovery = createDeferred<{
      windowId: number
      pid: number
      bounds: { x: number, y: number, width: number, height: number }
    }>()

    mocks.discoverTerminalWindowMock.mockReset()
    mocks.discoverTerminalWindowMock
      .mockImplementationOnce(() => olderDiscovery.promise)
      .mockImplementationOnce(() => newerDiscovery.promise)
      .mockResolvedValueOnce({
        windowId: 903,
        pid: 6100,
        bounds: {
          x: 50,
          y: 60,
          width: 180,
          height: 70,
        },
      })

    const firstSnapshotPromise = snapshotTool!.handler({ sessionId: started.sessionId })
    const secondSnapshotPromise = snapshotTool!.handler({ sessionId: started.sessionId })

    newerDiscovery.resolve({
      windowId: 902,
      pid: 6100,
      bounds: {
        x: 30,
        y: 40,
        width: 160,
        height: 60,
      },
    })

    await secondSnapshotPromise

    olderDiscovery.resolve({
      windowId: 901,
      pid: 5100,
      bounds: {
        x: 10,
        y: 20,
        width: 140,
        height: 50,
      },
    })

    await firstSnapshotPromise
    await snapshotTool!.handler({ sessionId: started.sessionId })

    expect(mocks.discoverTerminalWindowMock).toHaveBeenNthCalledWith(1, { ownerName: 'WezTerm', pid: 4242 })
    expect(mocks.discoverTerminalWindowMock).toHaveBeenNthCalledWith(2, { ownerName: 'WezTerm', pid: 4242 })
    expect(mocks.discoverTerminalWindowMock).toHaveBeenNthCalledWith(3, { ownerName: 'WezTerm', pid: 6100 })
  })

  it('refreshes window metadata before capturing a snapshot', async () => {
    const tools = await importTools()
    const startTool = getTool(tools, 'tui_start')
    const snapshotTool = getTool(tools, 'tui_snapshot')

    const startResult = await startTool!.handler({
      cwd: '/tmp/project',
      command: 'npm run dev',
      cols: 132,
      rows: 36,
    })
    const started = parseToolResult(startResult)

    mocks.discoverTerminalWindowMock.mockResolvedValueOnce({
      windowId: 790,
      pid: 4242,
      bounds: {
        x: 30,
        y: 40,
        width: 140,
        height: 50,
      },
    })

    const snapshot = parseToolResult(await snapshotTool!.handler({ sessionId: started.sessionId }))

    expect(mocks.discoverTerminalWindowMock).toHaveBeenLastCalledWith({ ownerName: 'WezTerm', pid: 4242 })
    expect(mocks.captureWindowMock).toHaveBeenCalledWith(
      790,
      expect.stringContaining('/.tui-pilot/artifacts/session-123/snapshot-1.png'),
    )
    expect(snapshot).toMatchObject({
      visual: {
        imageWidth: 240,
        imageHeight: 80,
        windowBounds: {
          x: 30,
          y: 40,
          width: 140,
          height: 50,
        },
      },
    })
  })
})
