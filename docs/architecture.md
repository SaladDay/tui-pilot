# Architecture

## Overview

`tui-pilot` keeps control, rendering, and screenshot capture separate.

- Control plane: `tmux`
- Render plane: supported terminal backend (`wezterm` or `ghostty`)
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

## Render plane: supported terminal backend

`src/controllers/wezterm.ts` owns terminal backend definitions and detached launch behavior.

Today `tui-pilot` keeps the backend list intentionally small:

- WezTerm
- Ghostty

The backend is auto-detected or overridden with `TUI_PILOT_TERMINAL_BACKEND`. The control plane still stays in `tmux`; the terminal backend only renders the live window.

## Screenshot plane: macOS helper and screencapture

`src/controllers/macos-window.ts` coordinates two macOS-specific steps:

1. build and run `native/window-helper.swift`
2. capture the discovered window with `/usr/sbin/screencapture`

The Swift helper filters the visible window list by owner name (`WezTerm` or `Ghostty`) and can narrow discovery by pid. That gives the server a concrete window id and bounds before each screenshot.

The screenshot step uses the native window id instead of re-rendering ANSI output. This is the main reason `tui-pilot` produces real visual evidence instead of an approximation.

## MCP layer

`src/server.ts` registers six tools:

- `tui_doctor`
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
- selected terminal backend
- terminal pid and window id
- last known window bounds
- snapshot sequence number

The store is process-local. Restarting the server drops all sessions.

## Snapshot assembly

`src/tools/tui-snapshot.ts` performs the Phase 1 snapshot flow:

1. reserve the next per-session sequence number
2. refresh the window metadata when a terminal pid is known
3. capture plain text and ANSI text from tmux
4. capture a PNG screenshot of the current terminal window
5. read the PNG size from the file
6. assemble one MCP payload with text, image path, bounds, hashes, and diagnostics

The response combines terminal text with a real image file path so a client can inspect both.

## Diagnostics

`src/tools/tui-doctor.ts` is the lightweight preflight layer.

It does not try to fix the machine. It only reports:

- dependency availability
- backend selection
- local GUI heuristics
- manual checks that still depend on the user, such as Screen Recording permission

`src/lib/errors.ts` adds structured error codes and hints for startup and snapshot failures so MCP clients can surface something more useful than a generic wrapped exception.

## Current limits

- macOS only
- keyboard input only, no mouse
- sessions are not persisted across server restarts
- `stable` in snapshot responses is still conservative and always `false`
- window discovery depends on a usable local GUI session and macOS permissions
