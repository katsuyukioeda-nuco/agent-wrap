import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type {
  AgentTestResult,
  ConnectedAppDetail,
  McpServerSummary,
  ProjectSummary,
  SessionEmbed,
  SessionSummary,
} from '../../shared/agents'
import { readServerSentEvents, type ServerSentEvent } from './sse'
import type { AgentRuntime, ChatInput, CommentInput } from './types'
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

/** OpenCode の `/api/project` が返すプロジェクト。 */
interface OpenCodeProject {
  id?: string
  canonical?: string
  vcs?: string
  time?: {
    created?: number
    updated?: number
    active?: number
  }
}

/** OpenCode の `/api/session` が返すセッション。 */
interface OpenCodeSession {
  id?: string
  projectID?: string
  title?: string
  agent?: string
  model?: {
    id?: string
    providerID?: string
  }
  outcome?: string
  time?: {
    created?: number
    updated?: number
    busy?: number
    idle?: number
  }
  location?: {
    directory?: string
  }
}

function toIso(value: number | undefined): string | undefined {
  return typeof value === 'number' ? new Date(value).toISOString() : undefined
}

function toSessionSummary(session: OpenCodeSession): SessionSummary | null {
  if (typeof session.id !== 'string' || typeof session.projectID !== 'string') {
    return null
  }

  const busy = session.time?.busy
  const idle = session.time?.idle
  const running =
    typeof busy === 'number' && (typeof idle !== 'number' || busy > idle)

  return {
    id: session.id,
    projectId: session.projectID,
    title: session.title?.trim() || '無題のセッション',
    agent: session.agent,
    model: session.model?.id,
    provider: session.model?.providerID,
    directory: session.location?.directory,
    createdAt: toIso(session.time?.created),
    updatedAt: toIso(session.time?.updated),
    status:
      session.outcome === 'failed' ? 'error' : running ? 'running' : 'idle',
    outcome: session.outcome,
  }
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
  private embedAuth: { token: string; expiresAt: number } | null = null
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

  async comment({ sessionId, text, attachments }: CommentInput): Promise<void> {
    await this.ensureStarted()

    const body: Record<string, unknown> = { text }
    if (attachments && attachments.length > 0) {
      body.files = attachments
    }

    await this.json(`/api/session/${encodeURIComponent(sessionId)}/prompt`, {
      method: 'POST',
      body: JSON.stringify(body),
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

  private async allSessions(): Promise<OpenCodeSession[]> {
    const result = await this.json<{ data?: OpenCodeSession[] }>(
      '/api/session?limit=500',
    )
    return Array.isArray(result.data) ? result.data : []
  }

  async projects(): Promise<ProjectSummary[]> {
    await this.ensureStarted()

    const [projects, sessions] = await Promise.all([
      this.json<OpenCodeProject[]>('/api/project'),
      this.allSessions(),
    ])

    const counts = new Map<string, number>()
    for (const session of sessions) {
      if (typeof session.projectID === 'string') {
        counts.set(session.projectID, (counts.get(session.projectID) ?? 0) + 1)
      }
    }

    // 同じディレクトリが複数のプロジェクトとして登録されていることがある。
    // 最後に使われたものを残す。
    const byPath = new Map<string, ProjectSummary>()
    for (const project of projects) {
      if (
        typeof project.id !== 'string' ||
        typeof project.canonical !== 'string'
      ) {
        continue
      }

      const candidate: ProjectSummary = {
        id: project.id,
        path: project.canonical,
        name: basename(project.canonical) || project.canonical,
        vcs: project.vcs,
        createdAt: toIso(project.time?.created),
        updatedAt: toIso(project.time?.updated),
        lastActiveAt: toIso(project.time?.active),
        sessionCount: counts.get(project.id) ?? 0,
      }

      const existing = byPath.get(candidate.path)
      if (
        !existing ||
        (candidate.lastActiveAt ?? '') > (existing.lastActiveAt ?? '') ||
        (!existing.vcs && candidate.vcs)
      ) {
        byPath.set(candidate.path, candidate)
      }
    }

    return [...byPath.values()].sort((a, b) =>
      (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''),
    )
  }

  async sessions(project: ProjectSummary): Promise<SessionSummary[]> {
    await this.ensureStarted()

    const sessions = await this.allSessions()

    return sessions
      .map(toSessionSummary)
      .filter(
        (session): session is SessionSummary =>
          session !== null && session.projectId === project.id,
      )
      .sort((a, b) =>
        (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
      )
  }

  async recentSessions(limit: number): Promise<SessionSummary[]> {
    await this.ensureStarted()

    const sessions = await this.allSessions()

    return sessions
      .map(toSessionSummary)
      .filter((session): session is SessionSummary => session !== null)
      .sort((a, b) =>
        (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
      )
      .slice(0, limit)
  }

  async session(sessionId: string): Promise<SessionSummary | null> {
    await this.ensureStarted()

    const sessions = await this.allSessions()
    return (
      sessions
        .map(toSessionSummary)
        .find((session) => session?.id === sessionId) ?? null
    )
  }

  /**
   * ブラウザ埋め込み用のセッション URL。
   * ペアリングコードをセッショントークンに交換し、auth_token として付ける。
   */
  async sessionEmbed(sessionId: string): Promise<SessionEmbed> {
    await this.ensureStarted()

    const baseUrl = this.baseUrl
    if (!baseUrl) {
      throw new Error('OpenCode server is not running')
    }

    const token = await this.embedToken()
    const serverKey = Buffer.from(baseUrl).toString('base64url')
    // OpenCode の auth_token は base64url(`<serverKey>:<sessionToken>`)。
    const authToken = Buffer.from(`${serverKey}:${token}`).toString(
      'base64url',
    )

    return {
      url: `${baseUrl}/server/${serverKey}/session/${encodeURIComponent(sessionId)}?auth_token=${authToken}`,
    }
  }

  private async embedToken(): Promise<string> {
    const now = Date.now()
    if (this.embedAuth && this.embedAuth.expiresAt - now > 60_000) {
      return this.embedAuth.token
    }

    const pair = await this.json<{ code?: string }>('/api/pair', {
      method: 'POST',
      body: '{}',
    })
    if (!pair.code) {
      throw new Error('OpenCode did not return a pairing code')
    }

    const response = await this.request(
      `/auth/connect/${encodeURIComponent(pair.code)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!response.ok) {
      throw new Error(`OpenCode pairing failed: ${response.status}`)
    }

    const body = (await response.json()) as { token?: string }
    if (!body.token) {
      throw new Error('OpenCode did not return a session token')
    }

    // トークンは `<expiresAt>.<secret>` の形式。読めない場合は短めに扱う。
    const expiresAt = Number(body.token.split('.')[0])
    this.embedAuth = {
      token: body.token,
      expiresAt: Number.isFinite(expiresAt)
        ? expiresAt * 1000
        : now + 5 * 60_000,
    }

    return body.token
  }

  async close(): Promise<void> {
    this.closed = true
    this.baseUrl = null
    this.authHeader = ''
    this.info = null
    this.embedAuth = null
  }
}
