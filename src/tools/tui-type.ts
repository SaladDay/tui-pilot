import { z } from 'zod'

import { typeLiteral } from '../controllers/tmux.js'
import type { SessionRecord } from '../lib/types.js'

const inputSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string(),
})

type SessionStore = {
  get(sessionId: string): SessionRecord | undefined
}

type TuiTypeArgs = z.infer<typeof inputSchema>

function jsonText(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  }
}

export function createTuiTypeTool(store: SessionStore) {
  return {
    name: 'tui_type',
    description: 'Type literal text into a session',
    inputSchema,
    async handler(args: TuiTypeArgs) {
      const session = store.get(args.sessionId)

      if (!session) {
        throw new Error(`unknown session: ${args.sessionId}`)
      }

      await typeLiteral(session.tmuxSession, args.text)

      return jsonText({
        sessionId: session.sessionId,
        tmuxSession: session.tmuxSession,
        text: args.text,
      })
    },
  }
}
