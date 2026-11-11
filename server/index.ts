import 'dotenv/config'
import { createServer } from 'node:http'
import { getRequestListener, serve } from '@hono/node-server'
import app from './app'

const port = Number(process.env.PORT ?? 3000)

if (process.env.NODE_ENV === 'production') {
  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server listening on http://localhost:${info.port}`)
  })

  const shutdown = () => server.close(() => process.exit(0))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
} else {
  // 開発時は Hono と Vite を同じ HTTP サーバーで動かす。
  // Vite は middleware mode で HMR を提供し、/api 以外は Vite が処理する。
  const { createServer: createViteServer } = await import('vite')
  const server = createServer()
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  })

  const hono = getRequestListener(app.fetch)

  server.on('request', (req, res) => {
    if (req.url === '/api' || req.url?.startsWith('/api/')) {
      hono(req, res)
      return
    }

    vite.middlewares(req, res, () => {
      res.statusCode = 404
      res.end('Not found')
    })
  })

  server.listen(port, () => {
    console.log(`Dev server listening on http://localhost:${port}`)
  })

  const shutdown = async () => {
    await vite.close()
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
