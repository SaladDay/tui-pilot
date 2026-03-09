# TUI Pilot Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first working version of `tui-pilot`, a Node/TypeScript MCP server that can start a TUI inside `tmux`, show it in a real WezTerm window, capture a real macOS screenshot, and return a combined snapshot to Claude Code.

**Architecture:** Keep control and rendering separate. `tmux` owns session lifecycle, key injection, text capture, and stability checks. WezTerm owns rendering. A small macOS helper resolves the target window and captures it. The MCP server assembles text plus image into one `tui_snapshot` result.

**Tech Stack:** Node.js, TypeScript, Vitest, `@modelcontextprotocol/sdk`, `zod`, `execa`, `tmux`, `wezterm`, macOS `screencapture`, Swift helper compiled with `swiftc`.

---

## Proposed repository layout

```
tui-pilot/
  package.json
  package-lock.json
  tsconfig.json
  vitest.config.ts
  .gitignore
  README.md
  docs/
    architecture.md
    manual-test.md
    plans/
      2026-03-09-tui-pilot-phase1-implementation-plan.md
  scripts/
    build-window-helper.sh
  native/
    window-helper.swift
  fixtures/
    mini-tui.ts
  src/
    index.ts
    server.ts
    lib/
      env.ts
      errors.ts
      types.ts
      unicode.ts
    state/
      session-store.ts
    controllers/
      tmux.ts
      wezterm.ts
      macos-window.ts
    services/
      stability.ts
      snapshot.ts
    tools/
      tui-start.ts
      tui-send-keys.ts
      tui-type.ts
      tui-snapshot.ts
      tui-stop.ts
  tests/
    unit/
      env.test.ts
      session-store.test.ts
      tmux.test.ts
      wezterm.test.ts
      macos-window.test.ts
      stability.test.ts
      snapshot.test.ts
      tools.test.ts
    integration/
      phase1.e2e.test.ts
```

---

### Task 1: Bootstrap the workspace and dependency checks

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/lib/env.ts`
- Create: `tests/unit/env.test.ts`

**Step 1: Initialize the repo and Node workspace**

Run:

```bash
git init
npm init -y
npm install @modelcontextprotocol/sdk zod execa
npm install -D typescript tsx vitest @types/node
```

Then replace `package.json` with scripts:

```json
{
  "name": "tui-pilot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "execa": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

Use a minimal `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "fixtures/**/*.ts"]
}
```

**Step 2: Write the failing dependency test**

In `tests/unit/env.test.ts`, add:

```ts
import { describe, expect, it } from 'vitest'
import { resolveRuntimeDependencies } from '../../src/lib/env'

describe('resolveRuntimeDependencies', () => {
  it('marks missing tools clearly', () => {
    const result = resolveRuntimeDependencies({
      tmuxPath: null,
      weztermPath: '/usr/local/bin/wezterm',
      screencapturePath: '/usr/sbin/screencapture',
      swiftcPath: '/usr/bin/swiftc',
    })

    expect(result.ok).toBe(false)
    expect(result.missing).toContain('tmux')
  })
})
```

**Step 3: Run the test to verify Red**

Run:

```bash
npm test -- tests/unit/env.test.ts
```

Expected: FAIL because `../../src/lib/env` does not exist.

**Step 4: Write the minimal implementation**

In `src/lib/env.ts`, implement:

```ts
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

  return { ok: missing.length === 0, missing }
}
```

Add `.gitignore`:

```gitignore
node_modules/
dist/
.DS_Store
.tui-pilot/
coverage/
```

**Step 5: Run tests and typecheck**

Run:

```bash
npm test -- tests/unit/env.test.ts
npm run typecheck
```

Expected: PASS.

**Step 6: Commit**

Run:

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/lib/env.ts tests/unit/env.test.ts
git commit -m "chore: bootstrap tui-pilot workspace"
```

---

### Task 2: Define shared types, errors, and session storage

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/errors.ts`
- Create: `src/state/session-store.ts`
- Test: `tests/unit/session-store.test.ts`

**Step 1: Write the failing session store test**

Add `tests/unit/session-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../../src/state/session-store'

describe('createSessionStore', () => {
  it('stores and retrieves sessions by id', () => {
    const store = createSessionStore()
    store.save({
      sessionId: 'abc',
      tmuxSession: 'abc',
      cwd: '/tmp',
      command: 'demo',
      cols: 120,
      rows: 40,
      terminalWindowId: null,
      terminalPid: null,
      seq: 0,
    })

    expect(store.get('abc')?.tmuxSession).toBe('abc')
  })
})
```

**Step 2: Run the test to verify Red**

Run:

```bash
npm test -- tests/unit/session-store.test.ts
```

Expected: FAIL because the store does not exist.

**Step 3: Implement the minimal store and shared types**

In `src/lib/types.ts`, add:

```ts
export type SessionRecord = {
  sessionId: string
  tmuxSession: string
  cwd: string
  command: string
  cols: number
  rows: number
  terminalWindowId: number | null
  terminalPid: number | null
  seq: number
}
```

In `src/state/session-store.ts`, add:

```ts
import type { SessionRecord } from '../lib/types'

export function createSessionStore() {
  const sessions = new Map<string, SessionRecord>()

  return {
    save(record: SessionRecord) {
      sessions.set(record.sessionId, record)
    },
    get(sessionId: string) {
      return sessions.get(sessionId)
    },
    delete(sessionId: string) {
      sessions.delete(sessionId)
    },
  }
}
```

In `src/lib/errors.ts`, define a small typed error helper for later tasks:

```ts
export class TuiPilotError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
```

**Step 4: Re-run tests**

Run:

```bash
npm test -- tests/unit/session-store.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add src/lib/types.ts src/lib/errors.ts src/state/session-store.ts tests/unit/session-store.test.ts
git commit -m "feat: add session store and shared types"
```

---

### Task 3: Implement the tmux controller

**Files:**
- Create: `src/controllers/tmux.ts`
- Test: `tests/unit/tmux.test.ts`

**Step 1: Write the failing tmux command test**

Add `tests/unit/tmux.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildTmuxStartArgs } from '../../src/controllers/tmux'

describe('buildTmuxStartArgs', () => {
  it('builds a detached session command with size', () => {
    expect(
      buildTmuxStartArgs({
        session: 'demo',
        cols: 120,
        rows: 40,
        command: 'bash -lc "node fixtures/mini-tui.ts"',
      }),
    ).toEqual([
      'new-session',
      '-d',
      '-s',
      'demo',
      '-x',
      '120',
      '-y',
      '40',
      'bash -lc "node fixtures/mini-tui.ts"',
    ])
  })
})
```

**Step 2: Run the test to verify Red**

Run:

```bash
npm test -- tests/unit/tmux.test.ts
```

Expected: FAIL.

**Step 3: Implement the minimal tmux controller**

In `src/controllers/tmux.ts`, add:

```ts
import { execa } from 'execa'

export function buildTmuxStartArgs(input: {
  session: string
  cols: number
  rows: number
  command: string
}) {
  return [
    'new-session',
    '-d',
    '-s',
    input.session,
    '-x',
    String(input.cols),
    '-y',
    String(input.rows),
    input.command,
  ]
}

export async function tmux(args: string[]) {
  return execa('tmux', args)
}
```

Then extend the file with these small wrappers:

- `startSession(...)`
- `sendKeys(session, keys)`
- `typeLiteral(session, text)` using `send-keys -l`
- `capturePlain(session)` using `capture-pane -p`
- `captureAnsi(session)` using `capture-pane -e -p`
- `killSession(session)`

Keep wrappers thin. Do not add retry logic yet.

**Step 4: Re-run tests**

Run:

```bash
npm test -- tests/unit/tmux.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add src/controllers/tmux.ts tests/unit/tmux.test.ts
git commit -m "feat: add tmux controller"
```

---

### Task 4: Implement the WezTerm launcher contract

**Files:**
- Create: `src/controllers/wezterm.ts`
- Test: `tests/unit/wezterm.test.ts`

**Step 1: Write the failing WezTerm args test**

Add `tests/unit/wezterm.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildWeztermArgs } from '../../src/controllers/wezterm'

describe('buildWeztermArgs', () => {
  it('opens a new window that attaches to tmux', () => {
    expect(buildWeztermArgs('demo')).toEqual([
      'start',
      '--always-new-process',
      '--',
      'tmux',
      'attach',
      '-t',
      'demo',
    ])
  })
})
```

**Step 2: Run the test to verify Red**

Run:

```bash
npm test -- tests/unit/wezterm.test.ts
```

Expected: FAIL.

**Step 3: Implement the minimal launcher**

In `src/controllers/wezterm.ts`, add:

```ts
import { execa } from 'execa'

export function buildWeztermArgs(tmuxSession: string) {
  return ['start', '--always-new-process', '--', 'tmux', 'attach', '-t', tmuxSession]
}

export async function launchWezterm(tmuxSession: string) {
  return execa('wezterm', buildWeztermArgs(tmuxSession), {
    detached: true,
    stdio: 'ignore',
  })
}
```

Do not try to discover the window id in this task. Only launch the renderer process.

**Step 4: Re-run tests**

Run:

```bash
npm test -- tests/unit/wezterm.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add src/controllers/wezterm.ts tests/unit/wezterm.test.ts
git commit -m "feat: add wezterm launcher"
```

---

### Task 5: Add the macOS window helper and screenshot controller

**Files:**
- Create: `native/window-helper.swift`
- Create: `scripts/build-window-helper.sh`
- Create: `src/controllers/macos-window.ts`
- Test: `tests/unit/macos-window.test.ts`

**Step 1: Write the failing parser test**

Add `tests/unit/macos-window.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseWindowHelperOutput } from '../../src/controllers/macos-window'

describe('parseWindowHelperOutput', () => {
  it('reads window id and bounds from helper JSON', () => {
    const output = JSON.stringify({
      windowId: 123,
      pid: 456,
      bounds: { x: 10, y: 20, width: 800, height: 600 },
    })

    expect(parseWindowHelperOutput(output).windowId).toBe(123)
  })
})
```

**Step 2: Run the test to verify Red**

Run:

```bash
npm test -- tests/unit/macos-window.test.ts
```

Expected: FAIL.

**Step 3: Implement the helper contract**

In `native/window-helper.swift`, write a tiny CLI that:

- reads `--owner WezTerm`
- lists on-screen windows via CoreGraphics
- picks the frontmost matching window
- prints JSON:

```json
{
  "windowId": 123,
  "pid": 456,
  "bounds": { "x": 10, "y": 20, "width": 800, "height": 600 }
}
```

In `scripts/build-window-helper.sh`, compile it with:

```bash
#!/usr/bin/env bash
set -euo pipefail
mkdir -p .tui-pilot/bin
swiftc native/window-helper.swift -o .tui-pilot/bin/window-helper
```

In `src/controllers/macos-window.ts`, implement:

```ts
export function parseWindowHelperOutput(raw: string) {
  return JSON.parse(raw) as {
    windowId: number
    pid: number
    bounds: { x: number; y: number; width: number; height: number }
  }
}
```

Then add thin wrappers:

- `buildWindowHelper()` -> runs `scripts/build-window-helper.sh`
- `discoverWeztermWindow()` -> runs the compiled helper
- `captureWindow(windowId, outFile)` -> runs `screencapture -x -o -l<id> <outFile>`

**Step 4: Re-run tests**

Run:

```bash
npm test -- tests/unit/macos-window.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add native/window-helper.swift scripts/build-window-helper.sh src/controllers/macos-window.ts tests/unit/macos-window.test.ts
git commit -m "feat: add macos window discovery helper"
```

---

### Task 6: Implement stability detection and snapshot assembly

**Files:**
- Create: `src/lib/unicode.ts`
- Create: `src/services/stability.ts`
- Create: `src/services/snapshot.ts`
- Test: `tests/unit/stability.test.ts`
- Test: `tests/unit/snapshot.test.ts`

**Step 1: Write the failing stability test**

Add `tests/unit/stability.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isStableSequence } from '../../src/services/stability'

describe('isStableSequence', () => {
  it('returns true when the last two captures match', () => {
    expect(isStableSequence(['a', 'b', 'b'])).toBe(true)
  })
})
```

Add `tests/unit/snapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assembleSnapshot } from '../../src/services/snapshot'

describe('assembleSnapshot', () => {
  it('returns a stable snapshot payload', () => {
    const result = assembleSnapshot({
      sessionId: 'abc',
      seq: 1,
      cols: 120,
      rows: 40,
      plainText: 'hello',
      ansiText: '\u001b[7mhello\u001b[0m',
      imageArtifactId: 'img_1',
      imageWidth: 800,
      imageHeight: 600,
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      stable: true,
    })

    expect(result.screen.stable).toBe(true)
    expect(result.visual.imageArtifactId).toBe('img_1')
  })
})
```

**Step 2: Run tests to verify Red**

Run:

```bash
npm test -- tests/unit/stability.test.ts tests/unit/snapshot.test.ts
```

Expected: FAIL.

**Step 3: Implement the minimal services**

In `src/services/stability.ts`:

```ts
export function isStableSequence(frames: string[]) {
  if (frames.length < 2) return false
  return frames[frames.length - 1] === frames[frames.length - 2]
}
```

In `src/lib/unicode.ts`, add a small helper that flags suspicious lines containing `\u200d` or `\ufe0f`.

In `src/services/snapshot.ts`, implement `assembleSnapshot(...)` that returns this shape:

```ts
{
  session: { sessionId, seq, timestamp },
  screen: { cols, rows, cursor: null, title: null, stable, screenHash },
  textView: { plainText, ansiText, lines, changedRegions: [] },
  visual: { imageArtifactId, imageWidth, imageHeight, windowBounds: bounds },
  diagnostics: { unicodeWarnings, emojiWidthSuspects, truncated: false },
}
```

Keep `screenHash` simple for now. A stable hash of `ansiText` is enough.

**Step 4: Re-run tests**

Run:

```bash
npm test -- tests/unit/stability.test.ts tests/unit/snapshot.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add src/lib/unicode.ts src/services/stability.ts src/services/snapshot.ts tests/unit/stability.test.ts tests/unit/snapshot.test.ts
git commit -m "feat: add snapshot assembly and stability checks"
```

---

### Task 7: Implement the MCP tool handlers

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`
- Create: `src/tools/tui-start.ts`
- Create: `src/tools/tui-send-keys.ts`
- Create: `src/tools/tui-type.ts`
- Create: `src/tools/tui-snapshot.ts`
- Create: `src/tools/tui-stop.ts`
- Test: `tests/unit/tools.test.ts`

**Step 1: Write the failing tools test**

Add `tests/unit/tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildToolList } from '../../src/server'

describe('buildToolList', () => {
  it('registers the phase 1 TUI tools', () => {
    expect(buildToolList().map((tool) => tool.name)).toEqual([
      'tui_start',
      'tui_send_keys',
      'tui_type',
      'tui_snapshot',
      'tui_stop',
    ])
  })
})
```

**Step 2: Run the test to verify Red**

Run:

```bash
npm test -- tests/unit/tools.test.ts
```

Expected: FAIL.

**Step 3: Implement the minimal MCP server**

In `src/server.ts`, create:

- `buildToolList()`
- `createServer()`

Register these tools only:

- `tui_start`
- `tui_send_keys`
- `tui_type`
- `tui_snapshot`
- `tui_stop`

In the tool files, keep handlers thin:

- `tui-start.ts` -> create session id, start tmux, launch WezTerm, discover window, store session
- `tui-send-keys.ts` -> send tmux keys
- `tui-type.ts` -> send literal tmux text
- `tui-snapshot.ts` -> capture plain text, ANSI text, image file, assemble snapshot
- `tui-stop.ts` -> kill tmux session and delete store entry

In `src/index.ts`, just start the MCP server on stdio.

Use `zod` schemas per tool input. Do not add `resize` or `wait_until_stable` yet.

**Step 4: Re-run tests**

Run:

```bash
npm test -- tests/unit/tools.test.ts
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add src/server.ts src/index.ts src/tools/tui-start.ts src/tools/tui-send-keys.ts src/tools/tui-type.ts src/tools/tui-snapshot.ts src/tools/tui-stop.ts tests/unit/tools.test.ts
git commit -m "feat: add phase1 mcp tools"
```

---

### Task 8: Add a small integration fixture and end-to-end test

**Files:**
- Create: `fixtures/mini-tui.ts`
- Test: `tests/integration/phase1.e2e.test.ts`

**Step 1: Write the failing end-to-end test**

Add `tests/integration/phase1.e2e.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('phase1 e2e', () => {
  it('starts the fixture, moves selection, and captures a screenshot', async () => {
    expect(true).toBe(false)
  })
})
```

**Step 2: Run the test to verify Red**

Run:

```bash
npm test -- tests/integration/phase1.e2e.test.ts
```

Expected: FAIL.

**Step 3: Build a tiny keyboard-driven fixture**

In `fixtures/mini-tui.ts`, create a very small TUI that:

- draws a title line
- shows 3 items
- highlights the selected item with reverse video
- handles `Up`, `Down`, `q`

You can implement it with raw ANSI writes and Node `readline` keypress events. Do not bring in a full TUI framework for the fixture.

Then replace the test with a real flow:

1. Start the fixture in `tmux`.
2. Launch WezTerm.
3. Send `Down`.
4. Run `tui_snapshot`.
5. Assert:
   - plain text contains the expected item labels
   - ANSI text changed after `Down`
   - screenshot file exists and has non-zero size

Skip the test automatically if `tmux`, `wezterm`, or `swiftc` is missing.

**Step 4: Re-run the integration test**

Run:

```bash
npm test -- tests/integration/phase1.e2e.test.ts
```

Expected: PASS on a macOS machine with permissions granted.

**Step 5: Commit**

Run:

```bash
git add fixtures/mini-tui.ts tests/integration/phase1.e2e.test.ts
git commit -m "test: add phase1 end-to-end fixture"
```

---

### Task 9: Documentation and manual verification

**Files:**
- Create: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/manual-test.md`

**Step 1: Write down install and permission requirements**

In `README.md`, document:

- required tools: `tmux`, `wezterm`, `swiftc`
- macOS Screen Recording permission
- how to run the MCP server locally

**Step 2: Add a short architecture doc**

In `docs/architecture.md`, summarize:

- control plane = `tmux`
- rendering plane = WezTerm
- screenshot plane = macOS helper + `screencapture`

**Step 3: Add a manual verification checklist**

In `docs/manual-test.md`, include exact commands:

```bash
npm install
./scripts/build-window-helper.sh
npm run build
npm test
```

And one live verification flow:

1. Start the MCP server.
2. Call `tui_start` on the mini fixture.
3. Call `tui_snapshot`.
4. Confirm screenshot looks like the live WezTerm window.
5. Send `Down` and confirm the highlight moved.

**Step 4: Run final verification**

Run:

```bash
./scripts/build-window-helper.sh
npm run build
npm test
```

Expected: all pass.

**Step 5: Commit**

Run:

```bash
git add README.md docs/architecture.md docs/manual-test.md
git commit -m "docs: add phase1 setup and verification guide"
```

---

## Final verification checklist

Before calling Phase 1 complete, verify all of the following:

- `npm run build` passes.
- `npm test` passes.
- `tui_start` opens a real WezTerm window.
- `tui_snapshot` returns both text and a real screenshot.
- Chinese text in the fixture or a manual target app renders correctly in the screenshot.
- Sending `Down` changes the selected row and the change is visible in both ANSI and screenshot outputs.

---

## Notes for execution

- Keep Phase 1 small. Do not add mouse support.
- Do not add adapter metadata yet.
- Do not add cross-platform abstractions yet.
- If `CGWindowID` discovery via the helper becomes flaky, stop and fix that before writing more MCP tools. The screenshot bridge is the core of the whole project.
