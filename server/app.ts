import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { appState } from './routes/app-state'
import { apps } from './routes/apps'

const app = new Hono()

app.use(logger())

const api = new Hono()
api.get('/health', (c) => c.json({ ok: true }))
api.get('/environment', (c) => c.json({ repoDir: process.cwd() }))
api.route('/apps', apps)
api.route('/app-state', appState)
app.route('/api', api)

if (process.env.NODE_ENV === 'production') {
  app.use('*', serveStatic({ root: './dist/client' }))
  app.get('*', serveStatic({ path: './dist/client/index.html' }))
}

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'Internal Server Error' }, 500)
})

export default app
