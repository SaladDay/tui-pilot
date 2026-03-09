# Manual test

## Prerequisites

- macOS desktop session
- `tmux`, `wezterm`, and `swiftc` installed
- Screen Recording permission granted to the terminal app that runs the server

## Setup commands

Run these from the project root:

```bash
npm install
./scripts/build-window-helper.sh
npm run build
npm test
```

## Start the server

In one terminal:

```bash
npm run dev
```

Leave that process running. It speaks MCP over stdio.

## Live verification flow

Use any MCP client that can talk to a stdio server. Then run this sequence.

### 1. Start the fixture

Call `tui_start` with:

```json
{
  "cwd": "/absolute/path/to/tui-pilot",
  "command": "node --import tsx fixtures/mini-tui.ts",
  "cols": 60,
  "rows": 12
}
```

Expected result:

- a new WezTerm window opens
- the window shows `Mini TUI Pilot`
- `Alpha` starts selected
- the tool returns a `sessionId`

### 2. Capture the first snapshot

Call `tui_snapshot` with:

```json
{
  "sessionId": "<sessionId>"
}
```

Confirm:

- `textView.plainText` contains `Alpha`, `Bravo`, and `Charlie`
- `textView.ansiText` shows reverse-video selection for `Alpha`
- `visual.imageArtifactId` points to a PNG under `.tui-pilot/artifacts/`
- the PNG looks the same as the live WezTerm window

### 3. Move the selection

Call `tui_send_keys` with:

```json
{
  "sessionId": "<sessionId>",
  "keys": ["Down"]
}
```

Then call `tui_snapshot` again.

Confirm:

- the live WezTerm window now highlights `Bravo`
- the second snapshot text also shows `Bravo` selected
- the second PNG differs from the first one

### 4. Stop the session

Call `tui_stop` with:

```json
{
  "sessionId": "<sessionId>"
}
```

Confirm the tmux session is gone and the WezTerm window closes or becomes detached from the target session.

## Troubleshooting

- `missing required tools`: install `tmux`, `wezterm`, or `swiftc`
- `operation not permitted` / `screen recording`: grant Screen Recording permission to the terminal app running the server
- `unable to read window list`: make sure the test is running inside a real macOS GUI session
- `no matching window found`: check that WezTerm launched and stayed open long enough to be discovered
