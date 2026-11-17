import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectCodexAppServer, getConnectionStatus } from '../agents/connection'
import { getRuntime, stopRuntime } from '../agents/manager'
import { errorMessage } from '../agents/types'
import { mcpOrigin } from '../agents/utils'
import { closeMcpSessionsForApp } from '../mcp/handler'
import {
  createSessionComment,
  listSessionComments,
} from '../repositories/comments'
import {
  listSessionProcesses,
  readProcessLog,
  registerProcessDefinition,
  runProcessDefinition,
  stopProcess,
} from '../processes'
import {
  listWorkspaceDirectory,
  readWorkspaceFile,
  resolveWorkspaceRoots,
  revealWorkspacePath,
  workspaceDiff,
} from '../workspace'
import {
  createApp,
  deleteApp,
  getAppDetail,
  listApps,
  updateApp,
} from '../repositories/apps'

const sandboxSchema = z.enum(['read-only', 'workspace-write', 'danger-full-access'])
const approvalPolicySchema = z.enum(['never', 'on-request', 'untrusted'])

const codexPatchSchema = z.object({
  binary: z.string().trim().min(1).max(255).optional(),
  sandbox: sandboxSchema.optional(),
  approvalPolicy: approvalPolicySchema.optional(),
})

const opencodePatchSchema = z.object({
  binary: z.string().trim().min(1).max(255).optional(),
  port: z.number().int().min(0).max(65535).optional(),
})

const claudePatchSchema = z.object({
  binary: z.string().trim().min(1).max(255).nullable().optional(),
  permissionMode: z
    .enum(['default', 'acceptEdits', 'plan', 'bypassPermissions'])
    .optional(),
  model: z.string().trim().min(1).max(128).nullable().optional(),
})

const createSchema = z.object({
  appType: z.enum(['codex', 'opencode', 'claude']),
})

const updateSchema = z.object({
  codex: codexPatchSchema.optional(),
  opencode: opencodePatchSchema.optional(),
  claude: claudePatchSchema.optional(),
})

const chatSchema = z.object({
  message: z.string().trim().min(1).max(100_000),
  sessionId: z.string().trim().min(1).max(255).optional(),
})

const interruptSchema = z.object({
  sessionId: z.string().trim().min(1).max(255),
})

const revealSchema = z.object({
  root: z.number().int().min(0).optional(),
  path: z.string().trim().min(1).max(2048),
})

const registerProcessSchema = z.object({
  command: z.string().trim().min(1).max(4000),
  cwd: z.string().trim().min(1).max(2048).optional(),
  name: z.string().trim().min(1).max(255).optional(),
})

const commentSchema = z.object({
  kind: z.enum(['file', 'diff']),
  path: z.string().trim().min(1).max(2048),
  repoPath: z.string().trim().min(1).max(2048).optional(),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  side: z.enum(['old', 'new', 'both']).optional(),
  selection: z.string().min(1).max(200_000),
  comment: z.string().trim().min(1).max(20_000),
})

function appTypeError(
  appType: 'codex' | 'opencode' | 'claude',
): string {
  switch (appType) {
    case 'codex':
      return 'This app is configured for Codex'
    case 'opencode':
      return 'This app is configured for OpenCode'
    case 'claude':
      return 'This app is configured for Claude Code'
  }
}

function selectRoot(
  roots: Awaited<ReturnType<typeof resolveWorkspaceRoots>>,
  raw: string | undefined,
) {
  const index = raw === undefined ? 0 : Number(raw)

  if (!Number.isInteger(index) || index < 0 || index >= roots.length) {
    return null
  }

  return roots[index]
}

export const apps = new Hono()

apps.get('/', async (c) => {
  return c.json(await listApps())
})

apps.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
  }

  const detail = await createApp({
    appType: parsed.data.appType,
  })

  return c.json(detail, 201)
})

apps.get('/:id', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }
  return c.json(detail)
})

apps.get('/:id/connection', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  return c.json(await getConnectionStatus(detail))
})

apps.post('/:id/connect', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = z.object({ url: z.string().trim().min(1).max(1024) }).safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
  }

  try {
    const result = await connectCodexAppServer(c.req.param('id'), parsed.data.url)
    return c.json({ connected: true, ...result })
  } catch (error) {
    return c.json({ connected: false, error: errorMessage(error) }, 502)
  }
})

apps.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const current = await getAppDetail(id)

  if (!current) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
  }

  const patches = parsed.data
  if (
    (patches.codex && current.app.appType !== 'codex') ||
    (patches.opencode && current.app.appType !== 'opencode') ||
    (patches.claude && current.app.appType !== 'claude')
  ) {
    return c.json({ error: appTypeError(current.app.appType) }, 400)
  }

  const detail = await updateApp(id, {
    ...(patches.codex ? { codex: patches.codex } : {}),
    ...(patches.opencode ? { opencode: patches.opencode } : {}),
    ...(patches.claude ? { claude: patches.claude } : {}),
  })

  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  await stopRuntime(id)
  return c.json(detail)
})

apps.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const deleted = await deleteApp(id)

  if (!deleted) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  await stopRuntime(id)
  await closeMcpSessionsForApp(id)
  return c.body(null, 204)
})

apps.post('/:id/test', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  try {
    const runtime = await getRuntime(detail)
    return c.json(await runtime.test())
  } catch (error) {
    return c.json({
      ok: false,
      appType: detail.app.appType,
      message: errorMessage(error),
    })
  }
})

apps.get('/:id/mcp-servers', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  try {
    const runtime = await getRuntime(detail)
    return c.json({
      url: `${mcpOrigin()}/${detail.app.id}/mcp`,
      servers: await runtime.mcpServers(),
    })
  } catch (error) {
    return c.json(
      {
        url: `${mcpOrigin()}/${detail.app.id}/mcp`,
        servers: [],
        error: errorMessage(error),
      },
      502,
    )
  }
})

apps.get('/:id/projects', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  if (detail.app.appType === 'claude') {
    return c.json({ supported: false, projects: [] })
  }

  try {
    const runtime = await getRuntime(detail)
    return c.json({ supported: true, projects: await runtime.projects() })
  } catch (error) {
    return c.json(
      { supported: true, projects: [], error: errorMessage(error) },
      502,
    )
  }
})

apps.get('/:id/projects/:projectId/sessions', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  if (detail.app.appType === 'claude') {
    return c.json({ supported: false, sessions: [] })
  }

  try {
    const runtime = await getRuntime(detail)
    const projects = await runtime.projects()
    const project = projects.find(
      (item) => item.id === c.req.param('projectId'),
    )

    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    return c.json({
      supported: true,
      sessions: await runtime.sessions(project),
    })
  } catch (error) {
    return c.json(
      { supported: true, sessions: [], error: errorMessage(error) },
      502,
    )
  }
})

apps.get('/:id/recent-sessions', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  if (detail.app.appType === 'claude') {
    return c.json({ supported: false, sessions: [] })
  }

  const rawLimit = Number(c.req.query('limit') ?? '5')
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 20)
    : 5

  try {
    const runtime = await getRuntime(detail)
    return c.json({
      supported: true,
      sessions: await runtime.recentSessions(limit),
    })
  } catch (error) {
    return c.json(
      { supported: true, sessions: [], error: errorMessage(error) },
      502,
    )
  }
})

apps.get('/:id/sessions/:sessionId/comments', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  if (detail.app.appType === 'claude') {
    return c.json(
      { error: 'Claude Code ではコメント保存に対応していません' },
      400,
    )
  }

  const rawLimit = Number(c.req.query('limit') ?? '100')
  const limit = Number.isFinite(rawLimit) ? rawLimit : 100

  try {
    const comments = await listSessionComments(
      detail.app.id,
      c.req.param('sessionId'),
      limit,
    )
    return c.json({ comments })
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502)
  }
})

apps.post('/:id/sessions/:sessionId/comments', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  if (detail.app.appType === 'claude') {
    return c.json(
      { error: 'Claude Code ではコメント保存に対応していません' },
      400,
    )
  }

  const body = await c.req.json().catch(() => null)
  const parsed = commentSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      400,
    )
  }

  const data = parsed.data
  const sessionId = c.req.param('sessionId')

  const relativePath =
    data.kind === 'diff' && data.repoPath && data.repoPath !== '.'
      ? `${data.repoPath}/${data.path}`
      : data.path

  const endLine = data.endLine ?? data.startLine
  const lineLabel = data.startLine
    ? `行: ${data.startLine}${
        endLine && endLine !== data.startLine ? `-${endLine}` : ''
      }`
    : null
  const sideLabel =
    data.side === 'old'
      ? '変更前'
      : data.side === 'new'
        ? '変更後'
        : data.side === 'both'
          ? '変更前後'
          : null

  const message = [
    '選択範囲へのコメント',
    '',
    `ファイル: ${relativePath}`,
    lineLabel,
    `種類: ${data.kind === 'diff' ? '差分' : 'ファイル内容'}`,
    sideLabel ? `対象: ${sideLabel}` : null,
    '',
    'コメント:',
    data.comment,
    '',
    '選択範囲:',
    '````text',
    data.selection,
    '````',
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

  try {
    const directory = await mkdtemp(join(tmpdir(), 'agent-wrap-comment-'))
    const file = join(directory, 'comment.md')
    await writeFile(file, message, 'utf8')

    const comment = await createSessionComment({
      connectedAppId: detail.app.id,
      sessionId,
      kind: data.kind,
      path: data.path,
      repoPath: data.repoPath ?? '.',
      startLine: data.startLine ?? null,
      endLine: endLine ?? null,
      side: data.side ?? null,
      selection: data.selection,
      comment: data.comment,
      attachmentPath: file,
    })

    return c.json({ ok: true, comment })
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502)
  }
})

apps.post('/:id/sessions/:sessionId/processes', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = registerProcessSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      400,
    )
  }

  try {
    const process = await registerProcessDefinition({
      detail,
      sessionId: c.req.param('sessionId'),
      command: parsed.data.command,
      cwd: parsed.data.cwd,
      name: parsed.data.name,
    })

    return c.json({ process })
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400)
  }
})

apps.post('/:id/processes/:processId/run', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  try {
    const process = await runProcessDefinition(
      detail.app.id,
      c.req.param('processId'),
    )

    if (!process) {
      return c.json({ error: 'Process not found' }, 404)
    }

    return c.json({ process })
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400)
  }
})

apps.get('/:id/sessions/:sessionId/processes', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  try {
    const processes = await listSessionProcesses(
      detail.app.id,
      c.req.param('sessionId'),
    )
    return c.json({ processes })
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 500)
  }
})

apps.get('/:id/processes/:processId/logs', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  const tail = Number(c.req.query('tail') ?? '200')

  try {
    const result = await readProcessLog(
      detail.app.id,
      c.req.param('processId'),
      Number.isFinite(tail) ? tail : 200,
    )

    if (!result) {
      return c.json({ error: 'Process not found' }, 404)
    }

    return c.json(result)
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 500)
  }
})

apps.post('/:id/processes/:processId/stop', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  try {
    const process = await stopProcess(
      detail.app.id,
      c.req.param('processId'),
    )

    if (!process) {
      return c.json({ error: 'Process not found' }, 404)
    }

    return c.json({ process })
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 500)
  }
})

apps.get('/:id/sessions/:sessionId/workspace', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  if (detail.app.appType === 'claude') {
    return c.json({ error: 'Claude Code ではワークスペースに対応していません' }, 400)
  }

  try {
    const roots = await resolveWorkspaceRoots(
      detail,
      c.req.param('sessionId'),
    )
    return c.json({ roots })
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502)
  }
})

apps.get('/:id/sessions/:sessionId/workspace/files', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  if (detail.app.appType === 'claude') {
    return c.json({ error: 'Claude Code ではワークスペースに対応していません' }, 400)
  }

  let roots
  try {
    roots = await resolveWorkspaceRoots(detail, c.req.param('sessionId'))
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502)
  }

  const root = selectRoot(roots, c.req.query('root'))
  if (!root) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const result = await listWorkspaceDirectory(
      root.path,
      c.req.query('path') ?? '',
    )
    return c.json(result)
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400)
  }
})

apps.get('/:id/sessions/:sessionId/workspace/file', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  if (detail.app.appType === 'claude') {
    return c.json({ error: 'Claude Code ではワークスペースに対応していません' }, 400)
  }

  let roots
  try {
    roots = await resolveWorkspaceRoots(detail, c.req.param('sessionId'))
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502)
  }

  const root = selectRoot(roots, c.req.query('root'))
  if (!root) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const result = await readWorkspaceFile(
      root.path,
      c.req.query('path') ?? '',
    )
    return c.json(result)
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400)
  }
})

apps.post('/:id/sessions/:sessionId/workspace/reveal', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  if (detail.app.appType === 'claude') {
    return c.json({ error: 'Claude Code ではワークスペースに対応していません' }, 400)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = revealSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      400,
    )
  }

  let roots
  try {
    roots = await resolveWorkspaceRoots(detail, c.req.param('sessionId'))
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502)
  }

  const root = selectRoot(
    roots,
    parsed.data.root === undefined ? undefined : String(parsed.data.root),
  )
  if (!root) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    const result = await revealWorkspacePath(root.path, parsed.data.path)
    return c.json(result)
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400)
  }
})

apps.get('/:id/sessions/:sessionId/workspace/diff', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  if (detail.app.appType === 'claude') {
    return c.json({ error: 'Claude Code ではワークスペースに対応していません' }, 400)
  }

  let roots
  try {
    roots = await resolveWorkspaceRoots(detail, c.req.param('sessionId'))
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502)
  }

  const root = selectRoot(roots, c.req.query('root'))
  if (!root) {
    return c.json({ error: 'Workspace not found' }, 404)
  }

  try {
    return c.json(await workspaceDiff(root.path))
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502)
  }
})

apps.get('/:id/sessions/:sessionId', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  if (detail.app.appType === 'claude') {
    return c.json(
      { error: 'Claude Code ではセッションの埋め込み表示に対応していません' },
      400,
    )
  }

  try {
    const runtime = await getRuntime(detail)
    const session = await runtime.session(c.req.param('sessionId'))

    if (!session) {
      return c.json({ error: 'Session not found' }, 404)
    }

    const projects = await runtime.projects()
    const project =
      projects.find((item) => item.id === session.projectId) ?? null
    const embed = await runtime.sessionEmbed(session.id)

    return c.json({ session, project, embed })
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502)
  }
})

apps.post('/:id/chat', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = chatSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
  }

  let runtime
  try {
    runtime = await getRuntime(detail)
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400)
  }

  return streamSSE(c, async (stream) => {
    const controller = new AbortController()
    stream.onAbort(() => controller.abort())

    try {
      await runtime.chat({
        sessionId: parsed.data.sessionId,
        message: parsed.data.message,
        signal: controller.signal,
        onEvent: async (event) => {
          try {
            await stream.writeSSE({
              event: event.type,
              data: JSON.stringify(event),
            })
          } catch {
            controller.abort()
          }
        },
      })
    } catch (error) {
      try {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ type: 'error', message: errorMessage(error) }),
        })
      } catch {
        // クライアントが既に切断している。
      }
    }
  })
})

apps.post('/:id/chat/interrupt', async (c) => {
  const detail = await getAppDetail(c.req.param('id'))
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = interruptSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
  }

  try {
    const runtime = await getRuntime(detail)
    await runtime.interrupt(parsed.data.sessionId)
    return c.body(null, 204)
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502)
  }
})
