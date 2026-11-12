import { createServer } from 'node:net'

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => {
        if (port > 0) {
          resolve(port)
        } else {
          reject(new Error('Failed to allocate a free port'))
        }
      })
    })
  })
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** MCP エンドポイントの公開 origin。 */
export function mcpOrigin(): string {
  return (
    process.env.MCP_PUBLIC_ORIGIN ??
    `http://localhost:${process.env.PORT ?? 3000}`
  )
}
