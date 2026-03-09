import readline from 'node:readline'

const items = ['Alpha', 'Bravo', 'Charlie']

let selectedIndex = 0
let closed = false

function render() {
  process.stdout.write('\x1b[2J\x1b[H')
  process.stdout.write('Mini TUI Pilot\n\n')

  for (const [index, item] of items.entries()) {
    if (index === selectedIndex) {
      process.stdout.write(`\x1b[7m${item}\x1b[0m\n`)
      continue
    }

    process.stdout.write(`${item}\n`)
  }

  process.stdout.write('\nUse Up/Down to move, q to quit.\n')
}

function close() {
  if (closed) {
    return
  }

  closed = true
  process.stdout.write('\x1b[0m\x1b[2J\x1b[H')

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }

  process.stdin.pause()
  process.stdin.removeListener('keypress', onKeypress)
}

function moveSelection(direction: -1 | 1) {
  const next = selectedIndex + direction

  if (next < 0 || next >= items.length) {
    return
  }

  selectedIndex = next
  render()
}

function onKeypress(_input: string, key: { ctrl?: boolean, name?: string, sequence?: string }) {
  if (key.ctrl && key.name === 'c') {
    close()
    return
  }

  if (key.name === 'up') {
    moveSelection(-1)
    return
  }

  if (key.name === 'down') {
    moveSelection(1)
    return
  }

  if (key.name === 'q' || key.sequence === 'q') {
    close()
  }
}

readline.emitKeypressEvents(process.stdin)

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}

process.stdin.resume()
process.stdin.on('keypress', onKeypress)

render()
