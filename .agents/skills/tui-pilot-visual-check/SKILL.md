---
name: tui-pilot-visual-check
description: Use when validating a terminal UI on macOS and you need real screenshots, keyboard interaction, or window-level troubleshooting through tui-pilot instead of ANSI-only inspection.
---

# TUI Pilot Visual Check

## Overview

`tui-pilot` is for real TUI inspection, not ANSI image synthesis.

Treat the live terminal window and the local PNG file referenced by `visual.imageArtifactId` as the visual source of truth. Treat `textView.plainText` and `textView.ansiText` as supporting evidence for selection state, text content, and fast debugging.

The stack is split on purpose:

- `tmux` controls the app and captures text
- the selected terminal backend (`wezterm` or `ghostty`) renders the real terminal window
- macOS window discovery plus `screencapture` produces the PNG

## When to Use

- You need to inspect layout, colors, clipping, borders, spacing, or CJK rendering in a TUI
- You need to prove a key press changed visible state, not just terminal text
- You are debugging screenshot mismatches and want the real window, not a re-rendered ANSI artifact
- You are working inside this repo and need the shortest correct flow for `tui-pilot`

## Preconditions

- macOS GUI session, not a headless shell
- `tmux`, `swiftc`, and at least one supported terminal backend installed
- Screen Recording granted to the app that starts the MCP server
- your MCP client configured to spawn `npm run dev` or `node dist/index.js`

If screen capture fails, check permissions on the app that launched the server process first. That may be Terminal, iTerm, or a desktop MCP client. Giving permission to WezTerm alone is often not enough.

## Core Flow

1. Configure your MCP client to start the server over stdio.
2. Run `tui_doctor` first and confirm `automaticChecksPassed` is true.
3. Call `tui_start` with `cwd`, `command`, `cols`, and `rows`.
4. Confirm a real terminal window opened.
5. Call `tui_snapshot` and inspect both text and PNG.
6. Call `tui_send_keys` or `tui_type`.
7. Call `tui_snapshot` again and compare visible state.
8. Call `tui_stop` when done.

Do not skip the first snapshot. You need a baseline before sending keys.

## Mini Fixture Example

Use the built-in fixture for a quick sanity check.

`tui_start` input:

```json
{
  "cwd": "/absolute/path/to/tui-pilot",
  "command": "node --import tsx fixtures/mini-tui.ts",
  "cols": 60,
  "rows": 12
}
```

Expected first-state checks:

- the live terminal window shows `Mini TUI Pilot`
- `Alpha`, `Bravo`, and `Charlie` are visible
- `Alpha` is selected
- `visual.imageArtifactId` is a local PNG path under `.tui-pilot/artifacts/`

Then send:

```json
{
  "sessionId": "<sessionId>",
  "keys": ["Down"]
}
```

After the second snapshot, `Bravo` should be selected and the PNG should differ from the first one.

## What to Compare

- Live terminal window vs the PNG at `visual.imageArtifactId`
- Selected label in `textView.ansiText`
- Text presence in `textView.plainText`
- `screen.screenHash` before and after interaction
- screenshot file path and size under `.tui-pilot/artifacts/`

If only the text changed but the PNG did not, treat that as a visual-path problem until proven otherwise.

## Troubleshooting

- `missing required tools`: install `tmux`, `swiftc`, or one supported terminal backend
- `operation not permitted` or `screen recording`: grant Screen Recording to the app running the server process
- `unable to read window list`: run inside a real macOS desktop session
- `no matching window found`: the selected terminal backend may not have opened, may have exited early, or window discovery may be pointed at the wrong process
- `terminal launch did not provide a pid`: treat this as a startup bug or regression, not a normal environment-only skip
- `tui_doctor` should be your first stop when backend selection, dependencies, or GUI preconditions are unclear
- `session has no terminal window`: startup did not finish cleanly or the session state is stale

## Useful Files

- `README.md`
- `docs/architecture.md`
- `docs/manual-test.md`
- `src/tools/tui-start.ts`
- `src/tools/tui-snapshot.ts`
- `src/controllers/macos-window.ts`

## Current Limits

- macOS only
- keyboard only, no mouse
- session store is in-memory
- do not rely on `screen.stable`; it is currently always `false`
