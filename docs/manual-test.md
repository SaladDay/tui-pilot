# Manual test

## Prerequisites

- macOS desktop session
- `tmux`, `swiftc`, and at least one supported terminal backend installed (`wezterm` or `ghostty`)
- Screen Recording permission granted to the app that launches the server process

## Setup commands

Run these from the project root:

```bash
npm install
./scripts/build-window-helper.sh
npm run build
npm test
```

## Start the server

`tui-pilot` uses stdio transport. For a real MCP check, configure your MCP client to spawn one of these commands as the server process:

```bash
npm run dev
```

or:

```bash
node dist/index.js
```

Do not launch the server in a separate terminal and then try to connect to it later. The MCP client needs to own the stdio pipes.

## Live verification flow

Use any MCP client that can spawn a stdio server process. Then run this sequence.

### 0. Run preflight first

Call `tui_doctor` with no arguments.

Confirm:

- `automaticChecksPassed` is `true`
- `backend.selected` is the terminal you expect to use
- `manualChecksRequired` includes `screen-recording`

If you want to force Ghostty or WezTerm for this session, launch the server with `TUI_PILOT_TERMINAL_BACKEND=ghostty` or `TUI_PILOT_TERMINAL_BACKEND=wezterm`.

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

- a new terminal window opens
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
- `visual.imageArtifactId` is a local PNG path under `.tui-pilot/artifacts/`
- the PNG looks the same as the live terminal window

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

- the live terminal window now highlights `Bravo`
- the second snapshot text also shows `Bravo` selected
- the second PNG differs from the first one

### 4. Stop the session

Call `tui_stop` with:

```json
{
  "sessionId": "<sessionId>"
}
```

Confirm the tmux session is gone and the terminal window closes or becomes detached from the target session.

## Troubleshooting

- `missing required tools`: install `tmux`, `swiftc`, or one supported backend (`wezterm` / `ghostty`)
- `operation not permitted` / `screen recording`: grant Screen Recording permission to the app that launched the server process
- `unable to read window list`: make sure the test is running inside a real macOS GUI session
- `no matching window found`: check that the selected terminal backend launched and stayed open long enough to be discovered
- `requested terminal backend is unavailable`: install that backend or unset `TUI_PILOT_TERMINAL_BACKEND`
