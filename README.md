# tui-pilot

`tui-pilot` is a small MCP server for driving terminal UIs through a real macOS terminal window.

It starts the target app inside `tmux`, opens a detached WezTerm window for real rendering, captures a real PNG with macOS `screencapture`, and returns text plus image data through MCP tools.

## Current scope

- macOS only
- keyboard interaction only
- one in-memory session store per server process
- real screenshots, not ANSI re-rendering

## Requirements

- Node.js 20.19 or newer
- `tmux`
- `wezterm`
- `swiftc`
- macOS with an active GUI session
- Screen Recording permission for the terminal app that runs `tui-pilot`

If screenshots fail with permission errors, grant Screen Recording to Terminal, iTerm, or whichever app is launching `npm run dev` / `node dist/index.js`.

## Install

```bash
npm install
./scripts/build-window-helper.sh
```

## Build and test

```bash
npm run build
npm run typecheck
npm test
```

## Run the MCP server locally

For local development:

```bash
npm run dev
```

For a compiled build:

```bash
npm run build
node dist/index.js
```

The server uses stdio transport, so start it from an MCP client rather than opening it in a browser.

## Phase 1 tools

- `tui_start`: start a tmux-backed session and attach a new WezTerm window
- `tui_send_keys`: send named key presses such as `Down`, `Up`, `Enter`
- `tui_type`: send literal text with `tmux send-keys -l`
- `tui_snapshot`: capture plain text, ANSI text, and a PNG screenshot
- `tui_stop`: stop the tmux session and forget it from the in-memory store

## Example fixture flow

The repo includes `fixtures/mini-tui.ts`, a small keyboard-driven menu used by the integration test.

Typical MCP flow:

1. Call `tui_start` with `cwd`, `command`, `cols`, and `rows`.
2. Call `tui_snapshot` and inspect `textView` plus `visual.imageArtifactId`.
3. Call `tui_send_keys` with `Down`.
4. Call `tui_snapshot` again and confirm the selection moved.
5. Call `tui_stop` when done.

Screenshots and helper binaries are written under `.tui-pilot/`.

## More docs

- `docs/architecture.md`
- `docs/manual-test.md`
