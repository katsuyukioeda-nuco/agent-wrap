import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { getRuntime, stopRuntime } from '../agents/manager'
import { errorMessage } from '../agents/types'
import { closeMcpSessionsForApp } from '../mcp/handler'
import {
  createApp,
  deleteApp,
  getAppDetail,
  listApps,
  updateApp,
} from '../repositories/apps'

const sandboxSchema = z.enum(['read-only', 'workspace-write', 'danger-full-access'])
const approvalPolicySchema = z.enum(['never', 'on-request', 'untrusted'])

const codexSchema = z.object({
  binary: z.string().trim().min(1).max(255).default('codex'),
  sandbox: sandboxSchema.default('workspace-write'),
  approvalPolicy: approvalPolicySchema.default('never'),
})

const opencodeSchema = z.object({
  binary: z.string().trim().min(1).max(255).default('opencode'),
  port: z.number().int().min(0).max(65535).default(0),
})

const codexPatchSchema = z.object({
  binary: z.string().trim().min(1).max(255).optional(),
  sandbox: sandboxSchema.optional(),
  approvalPolicy: approvalPolicySchema.optional(),
})

const opencodePatchSchema = z.object({
  binary: z.string().trim().min(1).max(255).optional(),
  port: z.number().int().min(0).max(65535).optional(),
})

const baseSchema = {
  name: z.string().trim().min(1).max(255),
  workingDir: z.string().trim().min(1).max(1024),
  model: z
    .string()
    .trim()
    .max(255)
    .nullish()
    .transform((value) => value || null),
}

const createSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('codex'),
    ...baseSchema,
    codex: codexSchema.optional(),
  }),
  z.object({
    provider: z.literal('opencode'),
    ...baseSchema,
    opencode: opencodeSchema.optional(),
  }),
])

const updateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  workingDir: z.string().trim().min(1).max(1024).optional(),
  model: z.string().trim().max(255).nullable().optional(),
  codex: codexPatchSchema.optional(),
  opencode: opencodePatchSchema.optional(),
})

const chatSchema = z.object({
  message: z.string().trim().min(1).max(100_000),
  sessionId: z.string().trim().min(1).max(255).optional(),
})

const interruptSchema = z.object({
  sessionId: z.string().trim().min(1).max(255),
})

async function normalizeWorkingDir(value: string): Promise<string | null> {
  const expanded = value.startsWith('~')
    ? value.replace(/^~/, homedir())
    : value
  const absolute = resolve(expanded)

  try {
    const info = await stat(absolute)
    return info.isDirectory() ? absolute : null
  } catch {
    return null
  }
}

function mcpOrigin(): string {
  return (
    process.env.MCP_PUBLIC_ORIGIN ??
    `http://localhost:${process.env.PORT ?? 3000}`
  )
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

  const workingDir = await normalizeWorkingDir(parsed.data.workingDir)
  if (!workingDir) {
    return c.json({ error: 'workingDir must be an existing directory' }, 400)
  }

  const detail = await createApp({
    name: parsed.data.name,
    provider: parsed.data.provider,
    workingDir,
    model: parsed.data.model,
    ...(parsed.data.provider === 'codex'
      ? { codex: codexSchema.parse(parsed.data.codex ?? {}) }
      : { opencode: opencodeSchema.parse(parsed.data.opencode ?? {}) }),
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

  if (current.app.provider === 'codex' && parsed.data.opencode) {
    return c.json({ error: 'This app is configured for Codex' }, 400)
  }
  if (current.app.provider === 'opencode' && parsed.data.codex) {
    return c.json({ error: 'This app is configured for OpenCode' }, 400)
  }

  let workingDir: string | undefined
  if (parsed.data.workingDir) {
    const normalized = await normalizeWorkingDir(parsed.data.workingDir)
    if (!normalized) {
      return c.json({ error: 'workingDir must be an existing directory' }, 400)
    }
    workingDir = normalized
  }

  const detail = await updateApp(id, {
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(workingDir !== undefined ? { workingDir } : {}),
    ...(parsed.data.model !== undefined ? { model: parsed.data.model } : {}),
    ...(parsed.data.codex ? { codex: parsed.data.codex } : {}),
    ...(parsed.data.opencode ? { opencode: parsed.data.opencode } : {}),
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
      provider: detail.app.provider,
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
