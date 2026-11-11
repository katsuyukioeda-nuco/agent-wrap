import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { todos } from './routes/todos'
import { users } from './routes/users'

const app = new Hono()

app.use(logger())

const api = new Hono()
api.get('/health', (c) => c.json({ ok: true }))
api.route('/todos', todos)
api.route('/users', users)
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
