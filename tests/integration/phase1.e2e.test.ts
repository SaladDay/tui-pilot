import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const fixturePath = path.resolve(projectRoot, 'fixtures/mini-tui.ts')

type ToolResult = {
  content: Array<{ text: string }>
}

type ToolHandler = (args: any) => Promise<ToolResult>

type SnapshotPayload = {
  screen: {
    screenHash: string
  }
  textView: {
    plainText: string
    ansiText: string
  }
  visual: {
    imageArtifactId: string
    imageWidth: number
    imageHeight: number
    windowBounds: {
      x: number
      y: number
      width: number
      height: number
    }
  }
}

function commandExists(command: string, args: readonly string[]) {
  const result = spawnSync(command, [...args], {
    stdio: 'ignore',
  })

  return result.status === 0
}

function getEnvironmentSkipReason() {
  if (process.platform !== 'darwin') {
    return 'phase1 e2e requires macOS'
  }

  const requiredCommands: Array<readonly [string, readonly string[]]> = [
    ['tmux', ['-V']],
    ['wezterm', ['--version']],
    ['swiftc', ['--version']],
  ]
  const missingCommands = requiredCommands.flatMap(([command, args]) => commandExists(command, args) ? [] : [command])

  if (missingCommands.length > 0) {
    return `missing required tools: ${missingCommands.join(', ')}`
  }

  return null
}

function parseToolResult<T>(result: ToolResult) {
  return JSON.parse(result.content[0]?.text ?? '{}') as T
}

function getTool(tools: Array<{ name: string, handler: ToolHandler }>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name)

  if (!tool) {
    throw new Error(`missing Phase 1 tool handler: ${name}`)
  }

  return tool
}

function formatErrorMessage(error: unknown) {
  const parts: string[] = []

  if (error instanceof Error) {
    parts.push(error.message)
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>

    for (const key of ['shortMessage', 'stderr', 'stdout'] as const) {
      const value = record[key]

      if (typeof value === 'string' && value.length > 0) {
        parts.push(value)
      }
    }
  }

  return parts.join('\n') || String(error)
}

function shouldSkipEnvironmentFailure(error: unknown) {
  const message = formatErrorMessage(error).toLowerCase()

  const permissionFailure = [
    'operation not permitted',
    'not authorized',
    'permission denied',
  ].some(token => message.includes(token))

  const captureContext = [
    'screen recording',
    'screen capture',
    'screencapture',
    'could not create image',
    'window image',
  ].some(token => message.includes(token))

  const helperContext = [
    'window helper',
    'window-helper',
    '.tui-pilot/bin/window-helper',
    '--owner',
    'wezterm',
  ].some(token => message.includes(token))

  return [
    'screen recording',
    'could not create image',
    'unable to read window list',
  ].some(token => message.includes(token))
    || (permissionFailure && (captureContext || helperContext))
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatObservedValue(value: unknown) {
  if (value === undefined) {
    return 'undefined'
  }

  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

function getSelectedLabel(ansiText: string) {
  const match = ansiText.match(/\x1b\[7m([^\x1b]+)\x1b\[0m/)

  return match?.[1] ?? null
}

async function pollUntil<T>(
  readValue: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: {
    description: string
    timeoutMs: number
    intervalMs: number
  },
) {
  const startedAt = Date.now()
  let lastValue: T | undefined
  let lastError: unknown

  while (Date.now() - startedAt <= options.timeoutMs) {
    try {
      lastValue = await readValue()
      lastError = undefined
    }
    catch (error) {
      lastError = error
      await sleep(options.intervalMs)
      continue
    }

    if (predicate(lastValue)) {
      return lastValue
    }

    await sleep(options.intervalMs)
  }

  const details = [
    `timed out waiting for ${options.description}`,
    `last value: ${formatObservedValue(lastValue)}`,
  ]

  if (lastError !== undefined) {
    details.push(`last error: ${formatErrorMessage(lastError)}`)
  }

  throw new Error(details.join('\n'))
}

function hasFixtureItems(snapshot: SnapshotPayload) {
  return ['Alpha', 'Bravo', 'Charlie'].every(label => snapshot.textView.plainText.includes(label))
}

async function hashFile(filePath: string) {
  const contents = await readFile(filePath)
  return createHash('sha256').update(contents).digest('hex')
}

describe('phase1 e2e helpers', () => {
  it('extracts the reverse-video selected label from ansi text', () => {
    expect(getSelectedLabel('Mini TUI\n\n\x1b[7mAlpha\x1b[0m\nBravo\nCharlie')).toBe('Alpha')
  })

  it('polls until the predicate matches', async () => {
    let attempts = 0

    const result = await pollUntil(
      async () => ++attempts,
      value => value === 3,
      {
        description: 'counter to reach three',
        timeoutMs: 100,
        intervalMs: 0,
      },
    )

    expect(result).toBe(3)
    expect(attempts).toBe(3)
  })

  it('retries transient read errors until a later attempt succeeds', async () => {
    let attempts = 0

    const result = await pollUntil(
      async () => {
        attempts += 1

        if (attempts < 3) {
          throw new Error(`temporary failure ${attempts}`)
        }

        return attempts
      },
      value => value === 3,
      {
        description: 'counter to recover after a transient failure',
        timeoutMs: 100,
        intervalMs: 0,
      },
    )

    expect(result).toBe(3)
    expect(attempts).toBe(3)
  })

  it('includes the last observed value and error when polling times out', async () => {
    let attempts = 0
    let timeoutError: Error | undefined

    try {
      await pollUntil(
        async () => {
          attempts += 1

          if (attempts === 1) {
            return 'warming up'
          }

          throw new Error('still starting')
        },
        value => value === 'ready',
        {
          description: 'fixture readiness',
          timeoutMs: 20,
          intervalMs: 0,
        },
      )
    }
    catch (error) {
      timeoutError = error as Error
    }

    expect(timeoutError).toBeInstanceOf(Error)
    expect(timeoutError?.message).toMatch(/last value: "warming up"/i)
    expect(timeoutError?.message).toMatch(/last error: still starting/i)
  })

  it('only skips specific window-capture environment failures', () => {
    expect(shouldSkipEnvironmentFailure(new Error('permission denied while capturing window image'))).toBe(true)
    expect(
      shouldSkipEnvironmentFailure(new Error('Command failed: /tmp/.tui-pilot/bin/window-helper --owner WezTerm\nunable to read window list')),
    ).toBe(true)
    expect(shouldSkipEnvironmentFailure(new Error('wezterm launch did not provide a pid'))).toBe(false)
    expect(
      shouldSkipEnvironmentFailure(new Error('Command failed: /tmp/.tui-pilot/bin/window-helper --owner WezTerm\nno matching window found')),
    ).toBe(false)
    expect(shouldSkipEnvironmentFailure(new Error('window not found'))).toBe(false)
  })
})

describe('phase1 e2e', () => {
  it('starts the fixture, moves selection, and captures a screenshot', async (context) => {
    const environmentSkipReason = getEnvironmentSkipReason()

    if (environmentSkipReason) {
      context.skip(environmentSkipReason)
      return
    }

    const { buildToolList } = await import('../../src/server.js')
    const tools = buildToolList() as Array<{ name: string, handler: ToolHandler }>
    const startTool = getTool(tools, 'tui_start')
    const sendKeysTool = getTool(tools, 'tui_send_keys')
    const snapshotTool = getTool(tools, 'tui_snapshot')
    const stopTool = getTool(tools, 'tui_stop')

    const command = `${JSON.stringify(process.execPath)} --import tsx ${JSON.stringify(fixturePath)}`
    let sessionId: string | undefined
    let deferredError: unknown
    let skipReason: string | null = null

    try {
      const started = parseToolResult<{ sessionId: string }>(await startTool.handler({
        cwd: projectRoot,
        command,
        cols: 60,
        rows: 12,
      }))

      sessionId = started.sessionId

      const before = await pollUntil(
        async () => parseToolResult<SnapshotPayload>(await snapshotTool.handler({ sessionId })),
        snapshot => hasFixtureItems(snapshot) && getSelectedLabel(snapshot.textView.ansiText) === 'Alpha',
        {
          description: 'fixture menu to render with Alpha selected',
          timeoutMs: 3000,
          intervalMs: 100,
        },
      )

      await sendKeysTool.handler({
        sessionId,
        keys: ['Down'],
      })

      const after = await pollUntil(
        async () => parseToolResult<SnapshotPayload>(await snapshotTool.handler({ sessionId })),
        snapshot => getSelectedLabel(snapshot.textView.ansiText) === 'Bravo' && snapshot.screen.screenHash !== before.screen.screenHash,
        {
          description: 'selection to move to Bravo',
          timeoutMs: 3000,
          intervalMs: 100,
        },
      )

      const confirmed = parseToolResult<SnapshotPayload>(await snapshotTool.handler({ sessionId }))

      const [beforeImageStats, afterImageStats, beforeImageHash, afterImageHash] = await Promise.all([
        stat(before.visual.imageArtifactId),
        stat(after.visual.imageArtifactId),
        hashFile(before.visual.imageArtifactId),
        hashFile(after.visual.imageArtifactId),
      ])

      expect(getSelectedLabel(before.textView.ansiText)).toBe('Alpha')
      expect(after.textView.plainText).toContain('Alpha')
      expect(after.textView.plainText).toContain('Bravo')
      expect(after.textView.plainText).toContain('Charlie')
      expect(getSelectedLabel(after.textView.ansiText)).toBe('Bravo')
      expect(getSelectedLabel(confirmed.textView.ansiText)).toBe('Bravo')
      expect(before.visual.windowBounds.width).toBeGreaterThan(0)
      expect(before.visual.windowBounds.height).toBeGreaterThan(0)
      expect(after.visual.windowBounds).toEqual(before.visual.windowBounds)
      expect(confirmed.visual.windowBounds).toEqual(after.visual.windowBounds)
      expect(before.visual.imageWidth).toBeGreaterThan(0)
      expect(before.visual.imageHeight).toBeGreaterThan(0)
      expect(after.visual.imageWidth).toBeGreaterThan(0)
      expect(after.visual.imageHeight).toBeGreaterThan(0)
      expect(after.visual.imageWidth).toBeGreaterThanOrEqual(after.visual.windowBounds.width)
      expect(after.visual.imageHeight).toBeGreaterThanOrEqual(after.visual.windowBounds.height)
      expect(beforeImageStats.size).toBeGreaterThan(0)
      expect(afterImageStats.size).toBeGreaterThan(0)
      expect(after.screen.screenHash).not.toBe(before.screen.screenHash)
      expect(after.visual.imageArtifactId).not.toBe(before.visual.imageArtifactId)
      expect(afterImageHash).not.toBe(beforeImageHash)
    }
    catch (error) {
      if (shouldSkipEnvironmentFailure(error)) {
        skipReason = `phase1 e2e skipped: ${formatErrorMessage(error)}`
      }
      else {
        deferredError = error
      }
    }
    finally {
      if (sessionId) {
        try {
          await stopTool.handler({ sessionId })
        }
        catch {
          // Best-effort cleanup for environment-sensitive e2e runs.
        }
      }
    }

    if (skipReason) {
      context.skip(skipReason)
      return
    }

    if (deferredError) {
      throw deferredError
    }
  })
})
