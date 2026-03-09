import { beforeEach, describe, expect, it, vi } from 'vitest'

const readFileMock = vi.fn()

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
}))

describe('readPngSize', () => {
  beforeEach(() => {
    readFileMock.mockReset()
  })

  it('reads pixel dimensions from the PNG IHDR chunk', async () => {
    const { readPngSize } = await import('../../src/lib/png.js')

    readFileMock.mockResolvedValue(Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x02, 0x80,
      0x00, 0x00, 0x01, 0x68,
      0x08, 0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]))

    await expect(readPngSize('/tmp/snapshot.png')).resolves.toEqual({ width: 640, height: 360 })
  })

  it('rejects files that do not contain a PNG signature and IHDR header', async () => {
    const { readPngSize } = await import('../../src/lib/png.js')

    readFileMock.mockResolvedValue(Buffer.from('not-a-png'))

    await expect(readPngSize('/tmp/snapshot.png')).rejects.toThrow(/invalid png/i)
  })
})
