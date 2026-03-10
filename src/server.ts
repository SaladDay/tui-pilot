import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { createSessionStore } from './state/session-store.js'
import { createTuiDoctorTool } from './tools/tui-doctor.js'
import { createTuiSendKeysTool } from './tools/tui-send-keys.js'
import { createTuiSnapshotTool } from './tools/tui-snapshot.js'
import { createTuiStartTool } from './tools/tui-start.js'
import { createTuiStopTool } from './tools/tui-stop.js'
import { createTuiTypeTool } from './tools/tui-type.js'

const sessionStore = createSessionStore()

export function buildToolList() {
  return [
    createTuiDoctorTool(),
    createTuiStartTool(sessionStore),
    createTuiSendKeysTool(sessionStore),
    createTuiTypeTool(sessionStore),
    createTuiSnapshotTool(sessionStore),
    createTuiStopTool(sessionStore),
  ]
}

export function createServer() {
  const server = new McpServer({
    name: 'tui-pilot',
    version: '0.1.0',
  })

  for (const tool of buildToolList()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      tool.handler,
    )
  }

  return server
}
