<h1 align="center">tui-pilot</h1>

<p align="center">
  <strong>Give your AI agent eyes and hands inside any terminal UI.</strong>
</p>

<p align="center">
  <a href="#requirements"><img src="https://img.shields.io/badge/macOS-only-black?logo=apple&logoColor=white" alt="macOS only" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20.19-339933?logo=nodedotjs&logoColor=white" alt="Node.js >= 20.19" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-8A2BE2" alt="MCP compatible" /></a>
</p>

<p align="center">
  <a href="./README_CN.md">中文文档</a>
</p>

<p align="center">
  <img src="docs/images/hero.png" alt="AI controlling a terminal UI application" width="720" />
</p>

Think [Playwright](https://playwright.dev), but for terminal apps instead of browsers.

`tui-pilot` is an [MCP](https://modelcontextprotocol.io) server that lets AI agents launch, observe, and interact with real terminal applications on macOS. It runs the target app inside `tmux`, renders it in a real terminal window, captures pixel-perfect PNG screenshots via macOS native APIs, and exposes everything through a clean set of MCP tools.

No ANSI re-rendering. No fake terminal emulation. What your agent sees is exactly what a human would see.

## Architecture

<p align="center">
  <img src="docs/images/architecture.png" alt="tui-pilot architecture: MCP Server → tmux / Terminal / macOS" width="720" />
</p>

Three planes work together under a unified MCP interface:

| Plane | Backed by | Responsibility |
|---|---|---|
| **Control** | tmux | Session lifecycle, key dispatch, text capture |
| **Render** | WezTerm / Ghostty | Real terminal rendering with GPU acceleration |
| **Screenshot** | Swift + CoreGraphics | Native window discovery and pixel-perfect PNG capture |

## Workflow

<p align="center">
  <img src="docs/images/workflow.png" alt="Preflight → Launch → Snapshot ↔ Interact → Cleanup" width="720" />
</p>

| Step | Tool | What happens |
|---|---|---|
| **Preflight** | `tui_doctor` | Verify dependencies & permissions |
| **Launch** | `tui_start` | Create a tmux session + attach a terminal window |
| **Snapshot** | `tui_snapshot` | Capture plain text + ANSI text + real PNG screenshot |
| **Interact** | `tui_send_keys` / `tui_type` | Send keystrokes or type text |
| **Cleanup** | `tui_stop` | Graceful session teardown |

Steps 3–4 form an **observe-act loop**: snapshot the current state, decide on input, send it, then snapshot again — as many times as needed.

## Tools

| Tool | Description |
|---|---|
| `tui_doctor` | Inspect dependencies, backend selection, GUI heuristics, and permission checks |
| `tui_start` | Start a tmux-backed session and attach a new terminal window |
| `tui_send_keys` | Send named key presses — `Down`, `Up`, `Enter`, `Escape`, etc. |
| `tui_type` | Send literal text via `tmux send-keys -l` |
| `tui_snapshot` | Capture plain text, ANSI text, and a PNG screenshot in one call |
| `tui_stop` | Stop the tmux session and release all resources |

> [!TIP]
> Run `tui_doctor` first if `tui_start` or `tui_snapshot` fails. It will tell you which backend was selected and remind you to grant Screen Recording permission.

## Requirements

- **macOS** with an active GUI session
- **Node.js** 20.19+
- **tmux**
- **WezTerm** or **Ghostty**
- **swiftc** (ships with Xcode Command Line Tools)
- **Screen Recording** permission for the app that launches `tui-pilot`

> [!NOTE]
> If screenshots fail with permission errors, grant Screen Recording to whichever app is spawning the server — Terminal, iTerm, or your MCP client.

## Getting started

```bash
# Install dependencies
npm install

# Build the native window helper
./scripts/build-window-helper.sh

# Build the project
npm run build
```

## Install in your MCP client

You can use `tui-pilot` in two ways:

- **MCP only**: enough to call `tui_doctor`, `tui_start`, `tui_snapshot`, and the rest of the toolset
- **MCP + optional skill**: recommended when your agent supports local skills and you want it to follow the visual-check workflow automatically

If your client does not support skills, stop after the MCP setup. The server works fine without the skill.

### 1. Register the MCP server

`tui-pilot` uses stdio transport. Point your MCP client at the built server:

```bash
node /absolute/path/to/tui-pilot/dist/index.js
```

Use this instead during development if you want auto-reload:

```bash
npm run dev
```

If your client stores commands as separate fields, enter that as `npm` with args `run` and `dev` instead of one shell string.

Example OpenCode config:

```json
{
  "mcp": {
    "tui-pilot": {
      "type": "local",
      "enabled": true,
      "command": ["node", "/absolute/path/to/tui-pilot/dist/index.js"],
      "timeout": 30000
    }
  }
}
```

Example Claude Desktop config:

```json
{
  "mcpServers": {
    "tui-pilot": {
      "command": "node",
      "args": ["/absolute/path/to/tui-pilot/dist/index.js"]
    }
  }
}
```

If you want to force a specific render backend for this server process, set `TUI_PILOT_TERMINAL_BACKEND` to `wezterm` or `ghostty` in your client config.

### 2. Optional: install the bundled skill

The repo includes a local skill at `.agents/skills/tui-pilot-visual-check`. It tells the agent to treat the live terminal window and PNG screenshot as the visual source of truth, run `tui_doctor` first, and compare snapshots before and after key presses.

If your agent supports local skills, copy that folder into the client's skill directory. Example for OpenCode:

```bash
mkdir -p ~/.config/opencode/skills
cp -R .agents/skills/tui-pilot-visual-check ~/.config/opencode/skills/
```

After you add the MCP server and optional skill, restart the MCP client or open a new session so it reloads both.

### 3. Verify the installation

Ask your MCP client to run `tui_doctor` with no arguments.

Confirm:

- `automaticChecksPassed` is `true`
- `backend.selected` is the terminal backend you expect
- `manualChecksRequired` includes `screen-recording`

If that works, your MCP wiring is in place. `tui_doctor` does not verify Screen Recording permission automatically, so run your first live check with `tui_snapshot` as well. If you also installed the skill, ask the agent to use `tui-pilot-visual-check` for that first pass.

## Usage

**Development mode** (auto-reloads on save):

```bash
npm run dev
```

**Production mode**:

```bash
npm run build
node dist/index.js
```

The server uses **stdio transport**. Point your MCP client at `npm run dev` or `node dist/index.js` as the server command — no sockets, no ports.

### Backend selection

`tui-pilot` auto-detects a render backend in this order: WezTerm → Ghostty.

Override with an environment variable:

```bash
TUI_PILOT_TERMINAL_BACKEND=ghostty npm run dev
```

Supported values: `auto`, `wezterm`, `ghostty`.

## Quick example

The repo includes `fixtures/mini-tui.ts`, a keyboard-driven menu for testing:

```
1. tui_doctor      → confirm automaticChecksPassed is true
2. tui_start       → launch the fixture app
3. tui_snapshot    → read textView + inspect the PNG
4. tui_send_keys   → send "Down"
5. tui_snapshot    → confirm the selection moved
6. tui_stop        → clean up
```

Screenshots and helper binaries live under `.tui-pilot/`.

## Testing

```bash
npm test              # run all tests
npm run typecheck     # type-check without emitting
```

## Roadmap

- [x] macOS support (WezTerm / Ghostty)
- [ ] Linux support (X11 / Wayland screenshot backends)
- [ ] Windows support (Windows Terminal + native capture)

> [!NOTE]
> Cross-platform support for Linux and Windows is planned. Stay tuned!

## Further reading

- [Architecture deep-dive](docs/architecture.md)
- [Manual testing guide](docs/manual-test.md)
