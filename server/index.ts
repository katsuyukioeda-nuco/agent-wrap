import 'dotenv/config'
import { createServer } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import app from './app'
import { stopAllRuntimes } from './agents/manager'
import { closeAllMcpSessions, handleMcpRequest, isMcpPath } from './mcp/handler'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'

const hono = getRequestListener(app.fetch)
const server = createServer()

async function shutdown(): Promise<void> {
  await Promise.allSettled([stopAllRuntimes(), closeAllMcpSessions()])
  server.close(() => process.exit(0))
}

server.on('request', (req, res) => {
  if (isMcpPath(req.url)) {
    void handleMcpRequest(req, res)
    return
  }

  if (process.env.NODE_ENV === 'production') {
    hono(req, res)
    return
  }

  // 開発時は Hono と Vite を同じ HTTP サーバーで動かす。
  // Vite は middleware mode で HMR を提供し、/api 以外は Vite が処理する。
  void (async () => {
    if (req.url === '/api' || req.url?.startsWith('/api/')) {
      hono(req, res)
      return
    }

    const vite = await getVite()
    vite.middlewares(req, res, () => {
      res.statusCode = 404
      res.end('Not found')
    })
  })()
})

let vitePromise: Promise<import('vite').ViteDevServer> | null = null

function getVite(): Promise<import('vite').ViteDevServer> {
  if (!vitePromise) {
    vitePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: { middlewareMode: true, hmr: { server } },
        appType: 'spa',
      }),
    )
  }
  return vitePromise
}

server.listen(port, host, () => {
  const mode = process.env.NODE_ENV === 'production' ? 'Server' : 'Dev server'
  console.log(`${mode} listening on http://localhost:${port}`)
})

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
