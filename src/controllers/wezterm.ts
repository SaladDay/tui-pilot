import { execa } from 'execa'

export type WeztermLaunch = {
  pid: number | undefined
}

export function buildWeztermArgs(tmuxSession: string) {
  return ['start', '--always-new-process', '--', 'tmux', 'attach', '-t', tmuxSession]
}

export function launchWezterm(tmuxSession: string): WeztermLaunch {
  const subprocess = execa('wezterm', buildWeztermArgs(tmuxSession), {
    detached: true,
    stdio: 'ignore',
  })

  void subprocess.catch(() => undefined)
  subprocess.unref()

  return { pid: subprocess.pid }
}
