<h1 align="center">tui-pilot</h1>

<p align="center">
  <strong>让你的 AI 代理在终端 UI 中拥有「眼睛」和「双手」。</strong>
</p>

<p align="center">
  <a href="#系统要求"><img src="https://img.shields.io/badge/macOS-only-black?logo=apple&logoColor=white" alt="macOS only" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20.19-339933?logo=nodedotjs&logoColor=white" alt="Node.js >= 20.19" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-8A2BE2" alt="MCP compatible" /></a>
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

<p align="center">
  <img src="docs/images/hero.png" alt="AI 控制终端 UI 应用" width="720" />
</p>

可以把它理解为终端应用的 [Playwright](https://playwright.dev)——Playwright 操控浏览器，tui-pilot 操控终端。

`tui-pilot` 是一个 [MCP](https://modelcontextprotocol.io) 服务器，让 AI 代理能够在 macOS 上启动、观察并操控真实的终端应用。它在 `tmux` 中运行目标程序，通过真实终端窗口渲染画面，调用 macOS 原生 API 捕获像素级 PNG 截图，并将一切能力通过一组简洁的 MCP 工具暴露出来。

不是 ANSI 重绘，不是伪终端模拟。AI 看到的，和人眼看到的完全一致。

## 架构

<p align="center">
  <img src="docs/images/architecture.png" alt="tui-pilot 架构：MCP Server → tmux / Terminal / macOS" width="720" />
</p>

三个平面在统一的 MCP 接口下协同工作：

| 平面 | 底层实现 | 职责 |
|---|---|---|
| **控制平面** | tmux | 会话生命周期、键盘派发、文本捕获 |
| **渲染平面** | WezTerm / Ghostty | GPU 加速的真实终端渲染 |
| **截图平面** | Swift + CoreGraphics | 原生窗口发现与像素级 PNG 截图 |

## 工作流

<p align="center">
  <img src="docs/images/workflow.png" alt="预检 → 启动 → 快照 ↔ 交互 → 清理" width="720" />
</p>

<p align="center">
  <img src="docs/images/workflow-real-example.png" alt="真实的 tui-pilot 会话，左侧是 agent 推理轨迹，右侧是 cc-switch 的实时终端窗口" width="900" />
</p>

<p align="center">
  一个真实会话：OpenCode 通过 <code>tui-pilot</code> 驱动 <code>cc-switch</code>，左侧是 agent 轨迹，右侧是实时终端窗口。
</p>

| 步骤 | 工具 | 动作 |
|---|---|---|
| **预检** | `tui_doctor` | 检查依赖与权限 |
| **启动** | `tui_start` | 创建 tmux 会话 + 打开终端窗口 |
| **快照** | `tui_snapshot` | 捕获纯文本 + ANSI 文本 + 真实 PNG 截图 |
| **交互** | `tui_send_keys` / `tui_type` | 发送按键或输入文本 |
| **清理** | `tui_stop` | 优雅地销毁会话 |

步骤 3–4 构成一个 **观察-行动循环**：截取当前状态、决定输入、发送操作、再次截取——循环往复，直到完成任务。

## 工具一览

| 工具 | 描述 |
|---|---|
| `tui_doctor` | 检查依赖、后端选择、GUI 探测和权限状态 |
| `tui_start` | 启动 tmux 会话并打开一个新终端窗口 |
| `tui_send_keys` | 发送命名按键——`Down`、`Up`、`Enter`、`Escape` 等 |
| `tui_type` | 通过 `tmux send-keys -l` 输入文字 |
| `tui_snapshot` | 一次调用同时捕获纯文本、ANSI 文本和 PNG 截图 |
| `tui_stop` | 停止 tmux 会话并释放所有资源 |

> [!TIP]
> 如果 `tui_start` 或 `tui_snapshot` 出错，先运行 `tui_doctor`。它会告诉你选中了哪个后端，并提醒你授予屏幕录制权限。

## 系统要求

- **macOS**（需要活跃的 GUI 会话）
- **Node.js** 20.19+
- **tmux**
- **WezTerm** 或 **Ghostty**
- **swiftc**（随 Xcode 命令行工具附带）
- 启动 `tui-pilot` 的应用需要**屏幕录制**权限

> [!NOTE]
> 如果截图因权限错误失败，请为启动服务器的应用授予屏幕录制权限——可能是 Terminal、iTerm 或你的 MCP 客户端。

## 快速开始

### 1. 直接让 AI 帮你安装（推荐）

如果你在用 Claude Code、OpenCode 或其他支持 MCP 的 agent，直接粘贴下面的 prompt。

**只安装 MCP**

```text
请把 `tui-pilot` 安装到我的 MCP 客户端里。项目路径使用 `/absolute/path/to/tui-pilot`，把需要的构建步骤都跑完，注册成一个本地 stdio MCP server，然后执行一次 `tui_doctor`。不要安装可选 skill。
```

**安装 MCP + 可选 skill**

```text
请把 `tui-pilot` 安装到我的 MCP 客户端里。项目路径使用 `/absolute/path/to/tui-pilot`，把需要的构建步骤都跑完，注册成一个本地 stdio MCP server；如果我的客户端支持 skill，再帮我安装可选的本地 skill `tui-pilot-visual-check`。安装完成后执行一次 `tui_doctor`，并告诉我还有哪些步骤需要我手动确认。
```

只有在客户端支持本地 skill 时，才需要安装可选 skill。

<details>
<summary>其他安装方式</summary>

### 构建 server

```bash
npm install
./scripts/build-window-helper.sh
npm run build
```

### 注册 MCP server

把你的 MCP 客户端指向构建后的服务：

```bash
node /absolute/path/to/tui-pilot/dist/index.js
```

如果你在开发时想自动重载，也可以把客户端指向 `npm run dev`。如果客户端把命令和参数分开存储，就写成命令 `npm`，参数 `run` 和 `dev`。

OpenCode 配置示例：

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

Claude Desktop 配置示例：

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

如果你想为这个 server 进程固定渲染后端，可以在客户端配置里设置 `TUI_PILOT_TERMINAL_BACKEND`，值可选 `wezterm` 或 `ghostty`。

### 可选 skill

仓库里自带了 `.agents/skills/tui-pilot-visual-check`。

```bash
mkdir -p ~/.config/opencode/skills
cp -R .agents/skills/tui-pilot-visual-check ~/.config/opencode/skills/
```

完成配置后，重启 MCP 客户端，或新开一个会话，让它重新加载 MCP 配置和可选 skill。

### 验证安装结果

让客户端执行一次 `tui_doctor`（不带参数）。

确认下面三点：

- `automaticChecksPassed` 为 `true`
- `backend.selected` 是你预期的终端后端
- `manualChecksRequired` 包含 `screen-recording`

`tui_doctor` 不会自动验证屏幕录制权限，所以安装后最好再跑一次带 `tui_snapshot` 的实机检查。

</details>

## 使用方式

**开发模式**（修改后自动重载）：

```bash
npm run dev
```

**生产模式**：

```bash
npm run build
node dist/index.js
```

### 后端选择

`tui-pilot` 按以下顺序自动检测渲染后端：WezTerm → Ghostty。

通过环境变量覆盖：

```bash
TUI_PILOT_TERMINAL_BACKEND=ghostty npm run dev
```

可选值：`auto`、`wezterm`、`ghostty`。

## 快速示例

仓库中包含 `fixtures/mini-tui.ts`，一个用于测试的键盘驱动菜单应用：

```
1. tui_doctor      → 确认 automaticChecksPassed 为 true
2. tui_start       → 启动 fixture 应用
3. tui_snapshot    → 读取 textView + 查看 PNG
4. tui_send_keys   → 发送 "Down"
5. tui_snapshot    → 确认选中项已移动
6. tui_stop        → 清理资源
```

截图和辅助工具二进制文件存放在 `.tui-pilot/` 目录下。

## 测试

```bash
npm test              # 运行全部测试
npm run typecheck     # 仅类型检查，不输出编译产物
```

## 路线图

- [x] macOS 支持（WezTerm / Ghostty）
- [ ] Linux 支持（X11 / Wayland 截图后端）
- [ ] Windows 支持（Windows Terminal + 原生截图）

> [!NOTE]
> Linux 和 Windows 的跨平台支持已在规划中，敬请期待！

## 更多文档

- [架构详解](docs/architecture.md)
- [手动测试指南](docs/manual-test.md)
