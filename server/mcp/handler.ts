import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { getAppDetail } from '../repositories/apps'
import { registerAppTools } from './tools'

interface McpSession {
  appId: string
  server: McpServer
  transport: StreamableHTTPServerTransport
}

const sessions = new Map<string, McpSession>()

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) {
    return
  }
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== 'POST') {
    return undefined
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) {
    return undefined
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) {
    return undefined
  }

  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function isMcpPath(url: string | undefined): boolean {
  if (!url) {
    return false
  }
  const pathname = new URL(url, 'http://localhost').pathname
  return /^\/[0-9a-fA-F-]{36}\/mcp\/?$/.test(pathname)
}

/**
 * `http://localhost:<PORT>/<connected-app-id>/mcp` を処理する。
 * MCP Streamable HTTP のセッションはアプリごとに分けて保持する。
 */
export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    const match = /^\/([0-9a-fA-F-]{36})\/mcp\/?$/.exec(pathname)

    if (!match) {
      respondJson(res, 404, { error: 'Not found' })
      return
    }

    const detail = await getAppDetail(match[1])
    if (!detail) {
      respondJson(res, 404, { error: 'Connected app not found' })
      return
    }

    const header = req.headers['mcp-session-id']
    const sessionId = Array.isArray(header) ? header[0] : header
    let session = sessionId ? sessions.get(sessionId) : undefined

    if (sessionId && !session) {
      respondJson(res, 404, { error: 'MCP session not found' })
      return
    }

    if (!session) {
      const holder = {} as McpSession
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, holder)
        },
      })
      const server = new McpServer({
        name: `agent-wrap/${detail.app.id.slice(0, 8)}`,
        version: '0.1.0',
      })

      registerAppTools(server, detail)
      await server.connect(transport)

      holder.appId = detail.app.id
      holder.server = server
      holder.transport = transport
      session = holder

      transport.onclose = () => {
        const id = transport.sessionId
        if (id) {
          sessions.delete(id)
        }
      }
    }

    const body = await readJsonBody(req)
    await session.transport.handleRequest(req, res, body)
  } catch (error) {
    console.error('[mcp] Request failed', error)
    if (!res.headersSent) {
      respondJson(res, 500, { error: 'Internal Server Error' })
    } else if (!res.writableEnded) {
      res.end()
    }
  }
}

export async function closeMcpSessionsForApp(appId: string): Promise<void> {
  const targets = [...sessions.entries()].filter(([, session]) => session.appId === appId)

  for (const [id, session] of targets) {
    sessions.delete(id)
    await Promise.allSettled([session.transport.close(), session.server.close()])
  }
}

export async function closeAllMcpSessions(): Promise<void> {
  const targets = [...sessions.values()]
  sessions.clear()
  await Promise.allSettled(
    targets.flatMap((session) => [session.transport.close(), session.server.close()]),
  )
}
