export function isStableSequence(frames: string[]): boolean {
  if (frames.length < 2) {
    return false
  }

  const lastFrame = frames.at(-1)
  const previousFrame = frames.at(-2)

  return lastFrame === previousFrame
}
