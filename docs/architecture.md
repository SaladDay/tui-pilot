# Architecture

## Overview

`tui-pilot` keeps control, rendering, and screenshot capture separate.

- Control plane: `tmux`
- Render plane: WezTerm
- Screenshot plane: macOS window discovery helper plus `screencapture`
- Bridge layer: Node.js MCP server

That split lets the server use `tmux` for reliable key injection and text capture while still returning a real screenshot from a real terminal window.

## Control plane: tmux

`src/controllers/tmux.ts` owns session lifecycle and text capture.

- starts detached sessions with `tmux new-session -d`
- preserves the caller's working directory with `-c`
- sends keys with `send-keys`
- types literal text with `send-keys -l`
- captures plain text and ANSI text with `capture-pane`
- stops sessions with `kill-session`

`tmux` is the stable source of interactive state. The MCP layer uses it for commands and text snapshots.

## Render plane: WezTerm

`src/controllers/wezterm.ts` launches a detached WezTerm process that attaches to the tmux session.

WezTerm is not used as the control channel. Its job is to render the TUI exactly as a user would see it in a normal terminal window.

## Screenshot plane: macOS helper and screencapture

`src/controllers/macos-window.ts` coordinates two macOS-specific steps:

1. build and run `native/window-helper.swift`
2. capture the discovered window with `/usr/sbin/screencapture`

The Swift helper filters the visible window list by owner name (`WezTerm`) and can narrow discovery by pid. That gives the server a concrete window id and bounds before each screenshot.

The screenshot step uses the native window id instead of re-rendering ANSI output. This is the main reason `tui-pilot` produces real visual evidence instead of an approximation.

## MCP layer

`src/server.ts` registers five Phase 1 tools:

- `tui_start`
- `tui_send_keys`
- `tui_type`
- `tui_snapshot`
- `tui_stop`

`src/index.ts` exposes them over stdio with `StdioServerTransport`.

## Session state

`src/state/session-store.ts` holds session records in memory.

Each record tracks:

- session id
- tmux session name
- command and cwd
- terminal pid and window id
- last known window bounds
- snapshot sequence number

The store is process-local. Restarting the server drops all sessions.

## Snapshot assembly

`src/tools/tui-snapshot.ts` performs the Phase 1 snapshot flow:

1. reserve the next per-session sequence number
2. refresh the window metadata when a terminal pid is known
3. capture plain text and ANSI text from tmux
4. capture a PNG screenshot of the current WezTerm window
5. read the PNG size from the file
6. assemble one MCP payload with text, image path, bounds, hashes, and diagnostics

The response combines terminal text with a real image file path so a client can inspect both.

## Current limits

- macOS only
- keyboard input only, no mouse
- sessions are not persisted across server restarts
- `stable` in snapshot responses is still conservative and always `false`
- window discovery depends on a usable local GUI session and macOS permissions
