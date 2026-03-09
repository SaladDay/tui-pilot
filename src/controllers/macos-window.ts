import path from 'node:path'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { z } from 'zod'

const controllerDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(controllerDir, '../..')
const buildWindowHelperScriptPath = path.resolve(projectRoot, 'scripts/build-window-helper.sh')
const windowHelperBinaryPath = path.resolve(projectRoot, '.tui-pilot/bin/window-helper')
const screenCaptureBinaryPath = '/usr/sbin/screencapture'

const WindowBoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
})

const WindowHelperResultSchema = z.object({
  windowId: z.number().int(),
  pid: z.number().int(),
  bounds: WindowBoundsSchema,
})

export type WindowBounds = z.infer<typeof WindowBoundsSchema>
export type WindowHelperResult = z.infer<typeof WindowHelperResultSchema>
export type DiscoverTerminalWindowOptions = {
  ownerName: string
  pid?: number
}

export function parseWindowHelperOutput(raw: string): WindowHelperResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`window helper returned invalid JSON: ${message}`)
  }

  const result = WindowHelperResultSchema.safeParse(parsed)

  if (!result.success) {
    throw new Error(`window helper returned invalid payload: ${result.error.message}`)
  }

  return result.data
}

export async function buildWindowHelper(): Promise<void> {
  try {
    await access(windowHelperBinaryPath, constants.X_OK)
    return
  }
  catch {
    // Build on demand when the compiled helper is missing.
  }

  await execa(buildWindowHelperScriptPath)
}

export async function discoverTerminalWindow(options: DiscoverTerminalWindowOptions): Promise<WindowHelperResult> {
  const args = ['--owner', options.ownerName]

  if (options.pid !== undefined) {
    args.push('--pid', String(options.pid))
  }

  const { stdout } = await execa(windowHelperBinaryPath, args)

  return parseWindowHelperOutput(stdout)
}

export async function discoverWeztermWindow(options: { pid?: number } = {}): Promise<WindowHelperResult> {
  return discoverTerminalWindow({
    ownerName: 'WezTerm',
    pid: options.pid,
  })
}

export async function captureWindow(windowId: number, outFile: string): Promise<void> {
  await execa(screenCaptureBinaryPath, ['-x', '-o', `-l${windowId}`, outFile])
}
