import { z } from 'zod'

import { sendKeys } from '../controllers/tmux.js'
import type { SessionRecord } from '../lib/types.js'

const inputSchema = z.object({
  sessionId: z.string().min(1),
  keys: z.array(z.string().min(1)).min(1),
})

type SessionStore = {
  get(sessionId: string): SessionRecord | undefined
}

type TuiSendKeysArgs = z.infer<typeof inputSchema>

function jsonText(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  }
}

export function createTuiSendKeysTool(store: SessionStore) {
  return {
    name: 'tui_send_keys',
    description: 'Send tmux key presses to a session',
    inputSchema,
    async handler(args: TuiSendKeysArgs) {
      const session = store.get(args.sessionId)

      if (!session) {
        throw new Error(`unknown session: ${args.sessionId}`)
      }

      await sendKeys(session.tmuxSession, args.keys)

      return jsonText({
        sessionId: session.sessionId,
        tmuxSession: session.tmuxSession,
        sentKeys: args.keys,
      })
    },
  }
}
