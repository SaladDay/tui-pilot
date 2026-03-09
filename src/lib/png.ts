import { readFile } from 'node:fs/promises'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
const IHDR_CHUNK_TYPE = 'IHDR'
const MIN_PNG_HEADER_LENGTH = 24

export async function readPngSize(filePath: string) {
  const buffer = await readFile(filePath)

  if (
    buffer.length < MIN_PNG_HEADER_LENGTH
    || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    || buffer.toString('ascii', 12, 16) !== IHDR_CHUNK_TYPE
  ) {
    throw new Error(`invalid PNG: ${filePath}`)
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}
