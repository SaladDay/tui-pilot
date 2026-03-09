export type RuntimeDependencyProbe = {
  tmuxPath: string | null
  weztermPath: string | null
  screencapturePath: string | null
  swiftcPath: string | null
}

export function resolveRuntimeDependencies(probe: RuntimeDependencyProbe) {
  const missing = [
    ['tmux', probe.tmuxPath],
    ['wezterm', probe.weztermPath],
    ['screencapture', probe.screencapturePath],
    ['swiftc', probe.swiftcPath],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  return {
    ok: missing.length === 0,
    missing,
  }
}
