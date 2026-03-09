import { z } from 'zod'

import { killSession } from '../controllers/tmux.js'
import type { SessionRecord } from '../lib/types.js'

const inputSchema = z.object({
  sessionId: z.string().min(1),
})

type SessionStore = {
  get(sessionId: string): SessionRecord | undefined
  delete(sessionId: string): boolean
}

type TuiStopArgs = z.infer<typeof inputSchema>

function jsonText(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  }
}

function isMissingTmuxSessionError(error: unknown) {
  const candidates: string[] = []

  if (error instanceof Error) {
    candidates.push(error.message)
  }

  if (typeof error === 'object' && error !== null) {
    const stderr = 'stderr' in error ? error.stderr : undefined
    const shortMessage = 'shortMessage' in error ? error.shortMessage : undefined

    if (typeof stderr === 'string') {
      candidates.push(stderr)
    }

    if (typeof shortMessage === 'string') {
      candidates.push(shortMessage)
    }
  }

  const haystack = candidates.join('\n').toLowerCase()

  return haystack.includes("can't find session")
    || haystack.includes('no such session')
    || haystack.includes('session not found')
}

export function createTuiStopTool(store: SessionStore) {
  return {
    name: 'tui_stop',
    description: 'Stop a tmux-backed session',
    inputSchema,
    async handler(args: TuiStopArgs) {
      const session = store.get(args.sessionId)

      if (!session) {
        throw new Error(`unknown session: ${args.sessionId}`)
      }

      try {
        await killSession(session.tmuxSession)
      }
      catch (error) {
        if (!isMissingTmuxSessionError(error)) {
          throw error
        }
      }

      store.delete(session.sessionId)

      return jsonText({
        sessionId: session.sessionId,
        tmuxSession: session.tmuxSession,
        stopped: true,
      })
    },
  }
}
