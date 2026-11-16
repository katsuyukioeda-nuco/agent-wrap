import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ConnectedAppDetail } from '../../shared/agents'
import { connectCodexAppServer } from '../agents/connection'
import { mcpOrigin } from '../agents/utils'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/**
 * Connected App ごとに公開する MCP ツール。
 *
 * ここにアプリ固有のツールを追加していく。`detail.app.id` を使って
 * データをアプリ単位にスコープできる。
 */
export function registerAppTools(server: McpServer, detail: ConnectedAppDetail): void {
  server.registerTool(
    'get_app_info',
    {
      title: 'Get connected app info',
      description: 'この Connected App の ID・アプリ種別・接続状態を返す。',
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              id: detail.app.id,
              appType: detail.app.appType,
              appServerUrl: detail.codex?.appServerUrl ?? null,
            },
            null,
            2,
          ),
        },
      ],
    }),
  )

  // 例:
  // server.registerTool('my_tool', { inputSchema: { value: z.string() } }, async ({ value }) => ({ ... }))

  if (detail.app.appType === 'codex' || detail.app.appType === 'opencode') {
    server.registerTool(
      'reflect',
      {
        title: 'Reflect current session',
        description:
          '現在のセッション（自分自身）の情報と、agent-wrap のセッション画面 URL を返す。',
        inputSchema: {},
      },
      async (_args, extra) => {
        const meta = extra._meta
        const turn = asRecord(meta?.['x-codex-turn-metadata'])

        const codexThreadId =
          stringValue(meta?.threadId) ??
          stringValue(turn?.thread_id) ??
          stringValue(meta?.sessionId) ??
          stringValue(turn?.session_id)
        const opencodeSessionId = stringValue(
          meta?.['ai.opencode/sessionID'],
        )

        const sessionId = codexThreadId ?? opencodeSessionId

        if (!sessionId) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    supported: false,
                    reason:
                      'セッション情報（x-codex-turn-metadata または ai.opencode/sessionID）がありません。',
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        }

        const url = `${mcpOrigin()}/${detail.app.id}/sessions/${encodeURIComponent(sessionId)}`
        const source = codexThreadId ? 'codex' : 'opencode'

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  source,
                  app: {
                    id: detail.app.id,
                    appType: detail.app.appType,
                  },
                  session: codexThreadId
                    ? {
                        id: codexThreadId,
                        url,
                        threadId: codexThreadId,
                        turnId: stringValue(turn?.turn_id),
                        model: stringValue(turn?.model),
                        codexVersion: stringValue(turn?.codex_version),
                      }
                    : {
                        id: opencodeSessionId,
                        url,
                        sessionId: opencodeSessionId,
                      },
                },
                null,
                2,
              ),
            },
          ],
        }
      },
    )
  }

  if (detail.app.appType === 'codex') {
    server.registerTool(
      'connect_codex_app_server',
      {
        title: 'Connect Codex AppServer',
        description:
          'エージェント側で起動した Codex AppServer の WebSocket URL を登録し、wrapper から接続する。',
        inputSchema: {
          url: z.string().describe('例: ws://127.0.0.1:4500'),
        },
      },
      async ({ url }) => {
        try {
          const result = await connectCodexAppServer(detail.app.id, url)
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ connected: true, ...result }, null, 2),
              },
            ],
          }
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: error instanceof Error ? error.message : String(error),
              },
            ],
          }
        }
      },
    )
  }
}
