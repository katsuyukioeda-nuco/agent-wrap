import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ConnectedAppDetail } from '../../shared/agents'
import { connectCodexAppServer } from '../agents/connection'
import { errorMessage } from '../agents/types'
import { mcpOrigin } from '../agents/utils'
import {
  listPendingComments,
  markCommentDone,
} from '../repositories/comments'
import {
  listSessionProcesses,
  readProcessLog,
  registerProcessDefinition,
  runProcessDefinition,
  stopProcess,
} from '../processes'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function codexThreadIdFromMeta(
  meta: Record<string, unknown> | undefined,
): string | undefined {
  const turn = asRecord(meta?.['x-codex-turn-metadata'])

  return (
    stringValue(meta?.threadId) ??
    stringValue(turn?.thread_id) ??
    stringValue(meta?.sessionId) ??
    stringValue(turn?.session_id)
  )
}

function opencodeSessionIdFromMeta(
  meta: Record<string, unknown> | undefined,
): string | undefined {
  return stringValue(meta?.['ai.opencode/sessionID'])
}

function sessionIdFromMeta(
  meta: Record<string, unknown> | undefined,
): string | undefined {
  return codexThreadIdFromMeta(meta) ?? opencodeSessionIdFromMeta(meta)
}

function missingSessionResult() {
  return {
    content: [
      {
        type: 'text' as const,
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

/**
 * 呼び出し元セッションの URL を返す。
 * Codex / OpenCode は MCP のメタ情報を優先し、無い場合だけ引数の sessionId を使う。
 * Claude はメタ情報が無いため sessionId を必須にする。
 */
function registerReflectTool(
  server: McpServer,
  detail: ConnectedAppDetail,
  requireExplicitSession: boolean,
): void {
  const sessionIdSchema = z.string().min(1).max(255)

  server.registerTool(
    'reflect',
    {
      title: 'Reflect current session',
      description: requireExplicitSession
        ? '自分のセッション ID を渡すと、agent-wrap のセッション画面 URL を返す。Claude Code では CLAUDE_CODE_SESSION_ID を使う。'
        : '現在のセッション（自分自身）の情報と、agent-wrap のセッション画面 URL を返す。MCP のメタ情報が無い場合だけ sessionId を指定する。',
      inputSchema: requireExplicitSession
        ? {
            sessionId: sessionIdSchema.describe(
              '自分のセッション ID（Claude Code の CLAUDE_CODE_SESSION_ID）',
            ),
          }
        : {
            sessionId: sessionIdSchema
              .optional()
              .describe(
                'MCP のメタ情報からセッションを特定できない場合に使う ID',
              ),
          },
    },
    async (
      { sessionId: explicitSessionId }: { sessionId?: string },
      extra: { _meta?: Record<string, unknown> },
    ) => {
      const meta = extra._meta
      const turn = asRecord(meta?.['x-codex-turn-metadata'])
      const codexThreadId = codexThreadIdFromMeta(meta)
      const opencodeSessionId = opencodeSessionIdFromMeta(meta)
      const sessionId =
        codexThreadId ?? opencodeSessionId ?? explicitSessionId

      if (!sessionId) {
        return requireExplicitSession
          ? {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    {
                      supported: false,
                      reason:
                        'sessionId が必要です。Claude Code のセッション ID を渡してください。',
                    },
                    null,
                    2,
                  ),
                },
              ],
            }
          : missingSessionResult()
      }

      const url = `${mcpOrigin()}/${detail.app.id}/sessions/${encodeURIComponent(sessionId)}`
      const source = codexThreadId
        ? 'codex'
        : opencodeSessionId
          ? 'opencode'
          : detail.app.appType

      return {
        content: [
          {
            type: 'text' as const,
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
                      id: sessionId,
                      url,
                      sessionId,
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

  registerReflectTool(server, detail, detail.app.appType === 'claude')

  if (detail.app.appType === 'codex' || detail.app.appType === 'opencode') {
    server.registerTool(
      'list_comments',
      {
        title: 'List pending comments',
        description:
          'このセッションの未対応コメントを一覧する。ユーザーが「コメントを確認して」と言ったときにも使う。まずこれを呼び、各コメントの id を確認する。対応したら done_comment で id を指定して完了にする。',
        inputSchema: {},
      },
      async (_args, extra) => {
        const meta = extra._meta
        const sessionId =
          codexThreadIdFromMeta(meta) ?? opencodeSessionIdFromMeta(meta)

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

        try {
          const comments = await listPendingComments(
            detail.app.id,
            sessionId,
            50,
          )

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    sessionId,
                    comments: comments.map((comment) => ({
                      id: comment.id,
                      path:
                        comment.repoPath === '.'
                          ? comment.path
                          : `${comment.repoPath}/${comment.path}`,
                      kind: comment.kind,
                      startLine: comment.startLine,
                      endLine: comment.endLine,
                      side: comment.side,
                      comment: comment.comment,
                      selection: comment.selection,
                      attachmentPath: comment.attachmentPath,
                      createdAt: comment.createdAt,
                    })),
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: errorMessage(error),
              },
            ],
          }
        }
      },
    )

    server.registerTool(
      'done_comment',
      {
        title: 'Mark a comment as done',
        description:
          'list_comments で返されたコメント ID を指定し、そのコメントを対応済みにする。',
        inputSchema: {
          id: z.string().describe('list_comments で返されたコメント ID'),
        },
      },
      async ({ id }, extra) => {
        const meta = extra._meta
        const sessionId =
          codexThreadIdFromMeta(meta) ?? opencodeSessionIdFromMeta(meta)

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

        try {
          const comment = await markCommentDone(
            detail.app.id,
            sessionId,
            id,
          )

          if (!comment) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Comment not found or already done: ${id}`,
                },
              ],
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    ok: true,
                    comment: {
                      id: comment.id,
                      doneAt: comment.doneAt,
                    },
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: errorMessage(error),
              },
            ],
          }
        }
      },
    )

    server.registerTool(
      'run_process',
      {
        title: 'Run a managed process',
        description:
          '開発サーバーやビルドなどのプロセスを登録して実行し、agent-wrap の管理対象にする。起動したプロセスは list_processes・get_process・stop_process で扱う。シェル経由で実行される。',
        inputSchema: {
          command: z
            .string()
            .trim()
            .min(1)
            .max(4000)
            .describe('実行するコマンド（例: npm run dev）'),
          cwd: z
            .string()
            .trim()
            .min(1)
            .max(2048)
            .optional()
            .describe('作業ディレクトリ。省略時はワークスペースのルート'),
          name: z
            .string()
            .trim()
            .min(1)
            .max(255)
            .optional()
            .describe('一覧に表示する名前。省略時はコマンドから作る'),
        },
      },
      async ({ command, cwd, name }, extra) => {
        const sessionId = sessionIdFromMeta(extra._meta)

        if (!sessionId) {
          return missingSessionResult()
        }

        try {
          const definition = await registerProcessDefinition({
            detail,
            sessionId,
            command,
            cwd,
            name,
          })

          const process = await runProcessDefinition(
            detail.app.id,
            definition.id,
          )

          if (!process) {
            throw new Error('Failed to run the registered process')
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    id: process.id,
                    pid: process.pid,
                    status: process.status,
                    name: process.name,
                    cwd: process.cwd,
                    command: process.command,
                    logPath: process.logPath,
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: errorMessage(error),
              },
            ],
          }
        }
      },
    )

    server.registerTool(
      'list_processes',
      {
        title: 'List managed processes',
        description:
          'このセッションで起動したプロセスの一覧を返す。status が running のものは稼働中。',
        inputSchema: {},
      },
      async (_args, extra) => {
        const sessionId = sessionIdFromMeta(extra._meta)

        if (!sessionId) {
          return missingSessionResult()
        }

        try {
          const processes = await listSessionProcesses(
            detail.app.id,
            sessionId,
          )

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    sessionId,
                    processes: processes.map((process) => ({
                      id: process.id,
                      name: process.name,
                      command: process.command,
                      cwd: process.cwd,
                      pid: process.pid,
                      status: process.status,
                      exitCode: process.exitCode,
                      signal: process.signal,
                      startedAt: process.startedAt,
                      endedAt: process.endedAt,
                    })),
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: errorMessage(error),
              },
            ],
          }
        }
      },
    )

    server.registerTool(
      'get_process',
      {
        title: 'Get a process with logs',
        description:
          'プロセスの状態とログの末尾を返す。開発サーバーの起動確認やエラー調査に使う。',
        inputSchema: {
          id: z.string().describe('run_process または list_processes の id'),
          tail: z
            .number()
            .int()
            .min(1)
            .max(2000)
            .optional()
            .describe('返すログ行数。デフォルト 100'),
        },
      },
      async ({ id, tail }, extra) => {
        const sessionId = sessionIdFromMeta(extra._meta)

        if (!sessionId) {
          return missingSessionResult()
        }

        try {
          const result = await readProcessLog(
            detail.app.id,
            id,
            tail ?? 100,
          )

          if (!result || result.process.sessionId !== sessionId) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Process not found: ${id}`,
                },
              ],
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    process: result.process,
                    log: result.log,
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: errorMessage(error),
              },
            ],
          }
        }
      },
    )

    server.registerTool(
      'stop_process',
      {
        title: 'Stop a managed process',
        description:
          'プロセスを停止する。SIGTERM を送り、5秒後に残っていれば SIGKILL する。',
        inputSchema: {
          id: z.string().describe('停止するプロセスの id'),
          signal: z
            .enum(['SIGTERM', 'SIGKILL'])
            .optional()
            .describe('送るシグナル。デフォルト SIGTERM'),
        },
      },
      async ({ id, signal }, extra) => {
        const sessionId = sessionIdFromMeta(extra._meta)

        if (!sessionId) {
          return missingSessionResult()
        }

        try {
          const process = await stopProcess(
            detail.app.id,
            id,
            signal ?? 'SIGTERM',
          )

          if (!process || process.sessionId !== sessionId) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Process not found: ${id}`,
                },
              ],
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    id: process.id,
                    status: process.status,
                    exitCode: process.exitCode,
                    signal: process.signal,
                    endedAt: process.endedAt,
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: errorMessage(error),
              },
            ],
          }
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
