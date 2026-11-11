import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  AgentTestResult,
  ConnectedAppDetail,
  McpServerSummary,
} from '../../shared/agents'
import { readServerSentEvents, type ServerSentEvent } from './sse'
import type { AgentRuntime, ChatInput } from './types'
import { delay } from './utils'

interface DiscoveredService {
  url: string
  password?: string
  version?: string
}

function basicAuth(password: string): string {
  return `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`
}

/**
 * すでに起動している OpenCode の認証済みサービスを探す。
 * 見つかればそのサーバーに相乗りし、見つからなければ自前で起動する。
 */
export async function discoverOpenCodeService(): Promise<DiscoveredService | null> {
  const stateHome = process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state')
  const candidates = [
    join(stateHome, 'opencode', 'service.json'),
    join(homedir(), '.config', 'opencode', 'service.json'),
  ]

  for (const file of candidates) {
    try {
      const info = JSON.parse(await readFile(file, 'utf8')) as {
        url?: string
        password?: string
        version?: string
      }

      if (!info.url) {
        continue
      }
      if (info.version && !info.version.startsWith('2.')) {
        continue
      }

      const headers = info.password
        ? { Authorization: basicAuth(info.password) }
        : undefined
      const response = await fetch(`${info.url}/api/info`, {
        headers,
        signal: AbortSignal.timeout(2000),
      })

      if (!response.ok) {
        continue
      }

      const body = (await response.json()) as { version?: string }
      return {
        url: info.url.replace(/\/$/, ''),
        password: info.password,
        version: body.version ?? info.version,
      }
    } catch {
      // 次の候補を見る。
    }
  }

  return null
}


interface OpenCodeInfo {
  version?: string
  pid?: number
  urls?: string[]
}

interface OpenCodeEventPayload {
  type?: string
  data?: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function mapMcpStatus(status: unknown): McpServerSummary['status'] {
  switch (status) {
    case 'connected':
      return 'connected'
    case 'pending':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'disabled':
      return 'disabled'
    case 'needs_auth':
      return 'needs-auth'
    default:
      return 'unknown'
  }
}

export class OpenCodeRuntime implements AgentRuntime {
  private startPromise: Promise<void> | null = null
  private baseUrl: string | null = null
  private authHeader = ''
  private info: OpenCodeInfo | null = null
  private closed = false

  constructor(detail: ConnectedAppDetail) {
    if (detail.app.appType !== 'opencode' || !detail.opencode) {
      throw new Error('Connected app is not configured for OpenCode')
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.closed) {
      throw new Error('OpenCode runtime is closed')
    }
    if (this.baseUrl && this.info) {
      return
    }
    if (!this.startPromise) {
      this.startPromise = this.start().finally(() => {
        this.startPromise = null
      })
    }
    await this.startPromise
  }

  private async start(): Promise<void> {
    const discovered = await discoverOpenCodeService()

    if (!discovered) {
      throw new Error(
        'OpenCode server is not running. Start OpenCode or run `opencode serve --service`.',
      )
    }

    this.baseUrl = discovered.url
    this.authHeader = discovered.password ? basicAuth(discovered.password) : ''
    this.info = { version: discovered.version }
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const baseUrl = this.baseUrl
    if (!baseUrl) {
      throw new Error('OpenCode server is not running')
    }

    const headers = new Headers(init.headers)
    headers.set('Authorization', this.authHeader)
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    return fetch(`${baseUrl}${path}`, { ...init, headers })
  }

  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init)
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300)
      throw new Error(
        `OpenCode API ${init.method ?? 'GET'} ${path} failed: ${response.status}${detail ? ` ${detail}` : ''}`,
      )
    }
    return (await response.json()) as T
  }

  async test(): Promise<AgentTestResult> {
    await this.ensureStarted()
    const version = this.info?.version
    return {
      ok: true,
      appType: 'opencode',
      message: version ? `OpenCode ${version}` : 'Connected',
      version,
    }
  }

  async chat({ sessionId, message, onEvent, signal }: ChatInput): Promise<void> {
    await this.ensureStarted()

    let activeSessionId = sessionId

    if (!activeSessionId) {
      const created = await this.json<{ data: { id: string } }>('/api/session', {
        method: 'POST',
        body: JSON.stringify({
          title: message.slice(0, 60),
          location: { directory: process.cwd() },
        }),
      })
      activeSessionId = created.data.id
    }

    await onEvent({ type: 'session', sessionId: activeSessionId })

    const sessionIdForRequest = activeSessionId
    const controller = new AbortController()
    const abort = () => {
      controller.abort()
      void this.request(
        `/api/session/${encodeURIComponent(sessionIdForRequest)}/interrupt`,
        { method: 'POST' },
      ).catch(() => undefined)
      complete()
    }
    signal?.addEventListener('abort', abort, { once: true })

    let streamedText = ''
    let promptSent = false
    let completionSeen = false
    let connected = false
    let finished = false
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let resolveCompletion: () => void = () => undefined

    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve
    })

    const toolNames = new Map<string, string>()

    const cleanup = () => {
      controller.abort()
      if (idleTimer) {
        clearTimeout(idleTimer)
      }
      signal?.removeEventListener('abort', abort)
    }

    const complete = () => {
      if (finished) {
        return
      }
      finished = true
      cleanup()
      resolveCompletion()
    }

    const fail = async (failureMessage: string) => {
      if (finished) {
        return
      }
      await onEvent({ type: 'error', message: failureMessage })
      complete()
    }

    const resetIdle = () => {
      if (idleTimer) {
        clearTimeout(idleTimer)
      }
      idleTimer = setTimeout(() => {
        void fail('OpenCode stream timed out')
      }, 300_000)
    }

    const emitFinalText = async () => {
      try {
        const result = await this.json<{ data: Array<Record<string, unknown>> }>(
          `/api/session/${encodeURIComponent(sessionIdForRequest)}/message?limit=100&order=asc&type=assistant`,
        )
        const last = result.data[result.data.length - 1]
        const content = Array.isArray(last?.content) ? last.content : []
        const text = content
          .map((part) => {
            const record = asRecord(part)
            return record?.type === 'text' ? String(record.text ?? '') : ''
          })
          .join('')

        if (text && text !== streamedText) {
          if (text.startsWith(streamedText)) {
            const remainder = text.slice(streamedText.length)
            if (remainder) {
              await onEvent({ type: 'delta', text: remainder })
            }
          } else if (!streamedText) {
            await onEvent({ type: 'delta', text })
          }
        }
      } catch {
        // 履歴の取得に失敗しても、ストリーム済みの内容は表示できる。
      }
    }

    const finishSuccessfully = async () => {
      await emitFinalText()
      await onEvent({ type: 'done', sessionId: sessionIdForRequest })
      complete()
    }

    const handleEvent = async (sse: ServerSentEvent) => {
      resetIdle()

      let payload: OpenCodeEventPayload
      try {
        payload = JSON.parse(sse.data) as OpenCodeEventPayload
      } catch {
        return
      }

      const type = payload.type ?? sse.event
      const data = payload.data ?? {}

      if (type === 'server.connected') {
        connected = true
        return
      }

      if (data.sessionID !== sessionIdForRequest) {
        return
      }

      switch (type) {
        case 'session.text.delta':
          streamedText += typeof data.delta === 'string' ? data.delta : ''
          await onEvent({
            type: 'delta',
            text: typeof data.delta === 'string' ? data.delta : '',
          })
          break
        case 'session.reasoning.delta':
          await onEvent({
            type: 'reasoning',
            text: typeof data.delta === 'string' ? data.delta : '',
          })
          break
        case 'session.tool.input.started': {
          const id = typeof data.id === 'string' ? data.id : undefined
          const name = typeof data.name === 'string' ? data.name : 'tool'
          if (id) {
            toolNames.set(id, name)
          }
          await onEvent({ type: 'tool.started', id, name })
          break
        }
        case 'session.tool.success': {
          const id = typeof data.id === 'string' ? data.id : undefined
          await onEvent({
            type: 'tool.completed',
            id,
            name: (id && toolNames.get(id)) || 'tool',
            ok: true,
          })
          break
        }
        case 'session.tool.failed': {
          const id = typeof data.id === 'string' ? data.id : undefined
          const error = asRecord(data.error)
          await onEvent({
            type: 'tool.completed',
            id,
            name: (id && toolNames.get(id)) || 'tool',
            ok: false,
          })
          if (typeof error?.message === 'string') {
            await onEvent({ type: 'error', message: error.message })
          }
          break
        }
        case 'permission.asked': {
          await onEvent({
            type: 'permission',
            message: 'OpenCode が権限確認を要求しています。',
          })
          break
        }
        case 'session.execution.failed': {
          const error = asRecord(data.error)
          await fail(
            typeof error?.message === 'string'
              ? error.message
              : 'OpenCode の実行に失敗しました。',
          )
          break
        }
        case 'session.execution.interrupted':
          await onEvent({ type: 'done', sessionId: sessionIdForRequest })
          complete()
          break
        case 'session.execution.succeeded':
        case 'session.idle':
          if (promptSent) {
            await finishSuccessfully()
          } else {
            completionSeen = true
          }
          break
      }
    }

    const consume = async () => {
      const response = await this.request('/api/event', { signal: controller.signal })
      if (!response.ok || !response.body) {
        throw new Error(`OpenCode event stream failed: ${response.status}`)
      }
      resetIdle()
      await readServerSentEvents(response.body, handleEvent)
    }

    const consuming = consume().catch(async (error: unknown) => {
      if (!finished) {
        await fail(error instanceof Error ? error.message : String(error))
      }
    })

    // イベント購読が確立するまで少し待つ。確立前に prompt を送ると
    // 最初の delta を取りこぼす可能性がある。
    const connectDeadline = Date.now() + 5000
    while (!connected && Date.now() < connectDeadline && !finished) {
      await delay(50)
    }

    if (!finished) {
      try {
        await this.json(`/api/session/${encodeURIComponent(sessionIdForRequest)}/prompt`, {
          method: 'POST',
          body: JSON.stringify({ text: message }),
        })
        promptSent = true
        if (completionSeen) {
          await finishSuccessfully()
        }
      } catch (error) {
        await fail(error instanceof Error ? error.message : String(error))
      }
    }

    await completion
    await consuming
  }

  async interrupt(sessionId: string): Promise<void> {
    await this.ensureStarted()
    await this.request(`/api/session/${encodeURIComponent(sessionId)}/interrupt`, {
      method: 'POST',
    })
  }

  async mcpServers(): Promise<McpServerSummary[]> {
    await this.ensureStarted()

    const result = await this.json<{
      data: Array<{ name: string; status: { status: string; error?: string } }>
    }>(`/api/mcp?location.directory=${encodeURIComponent(process.cwd())}`)

    return result.data.map((server) => ({
      name: server.name,
      status: mapMcpStatus(server.status?.status),
      detail:
        typeof server.status?.error === 'string' ? server.status.error : undefined,
    }))
  }

  async close(): Promise<void> {
    this.closed = true
    this.baseUrl = null
    this.authHeader = ''
    this.info = null
  }
}
