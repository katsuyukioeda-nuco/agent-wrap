import { Hono } from 'hono'
import { z } from 'zod'
import { getAppDetail } from '../repositories/apps'
import {
  getAppState,
  setLastOpenConnectedApp,
} from '../repositories/app-state'

const updateSchema = z.object({
  lastOpenConnectedAppId: z.string().uuid(),
})

export const appState = new Hono()

appState.get('/', async (c) => {
  return c.json(await getAppState())
})

appState.put('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
  }

  const detail = await getAppDetail(parsed.data.lastOpenConnectedAppId)
  if (!detail) {
    return c.json({ error: 'Connected app not found' }, 404)
  }

  return c.json(await setLastOpenConnectedApp(parsed.data.lastOpenConnectedAppId))
})
