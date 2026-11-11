import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { connectCodexAppServer, getConnectionStatus } from '../agents/connection'
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

const codexPatchSchema = z.object({
  binary: z.string().trim().min(1).max(255).optional(),
  sandbox: sandboxSchema.optional(),
  approvalPolicy: approvalPolicySchema.optional(),
})

const opencodePatchSchema = z.object({
  binary: z.string().trim().min(1).max(255).optional(),
  port: z.number().int().min(0).max(65535).optional(),
})

const createSchema = z.object({
  appType: z.enum(['codex', 'opencode']),
})

const updateSchema = z.object({
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

  if (current.app.appType === 'codex' && parsed.data.opencode) {
    return c.json({ error: 'This app is configured for Codex' }, 400)
  }
  if (current.app.appType === 'opencode' && parsed.data.codex) {
    return c.json({ error: 'This app is configured for OpenCode' }, 400)
  }

  const detail = await updateApp(id, {
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
