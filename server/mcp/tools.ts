import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ConnectedAppDetail } from '../../shared/agents'
import { connectCodexAppServer } from '../agents/connection'

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
