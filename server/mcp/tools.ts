import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import type { ConnectedAppDetail } from '../../shared/agents'
import { pool } from '../db'

interface TodoRow extends RowDataPacket {
  id: string
  title: string
  authorId: string
  authorName: string
  createdAt: Date
  updatedAt: Date
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
      description: 'この Connected App の名前・プロバイダー・作業ディレクトリを返す。',
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              id: detail.app.id,
              name: detail.app.name,
              provider: detail.app.provider,
              workingDir: detail.app.workingDir,
            },
            null,
            2,
          ),
        },
      ],
    }),
  )

  server.registerTool(
    'list_todos',
    {
      title: 'List todos',
      description: 'デモ用 Todo の一覧を返す。カスタム画面・ツール追加のサンプル。',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ limit }) => {
      const [rows] = await pool.query<TodoRow[]>(
        `SELECT t.id, t.title, t.author_id AS authorId, u.name AS authorName,
                t.created_at AS createdAt, t.updated_at AS updatedAt
         FROM todos t
         JOIN users u ON u.id = t.author_id
         ORDER BY t.created_at DESC
         LIMIT ?`,
        [limit ?? 20],
      )

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              rows.map((row) => ({
                id: row.id,
                title: row.title,
                authorId: row.authorId,
                authorName: row.authorName,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
              })),
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  // 例:
  // server.registerTool('my_tool', { inputSchema: { value: z.string() } }, async ({ value }) => ({ ... }))
}
