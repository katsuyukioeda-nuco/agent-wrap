import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { CodexConnectedApp, ConnectedApp } from '../../schema'
import type {
  AgentStreamEvent,
  AgentTestResult,
  ConnectedAppDetail,
  McpServerSummary,
} from '../../shared/agents'
import type { AgentRuntime, ChatInput } from './types'
import { errorMessage } from './types'

interface RpcMessage {
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown }
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function mapMcpStatus(status: unknown): McpServerSummary['status'] {
  switch (status) {
    case 'connected':
      return 'connected'
    case 'starting':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'disabled':
      return 'disabled'
    case 'authenticationRequired':
      return 'needs-auth'
    default:
      return 'unknown'
  }
}

async function forwardItemStarted(
  itemValue: unknown,
  onEvent: (event: AgentStreamEvent) => void | Promise<void>,
): Promise<void> {
  const item = asRecord(itemValue)
  if (!item) {
    return
  }

  const id = typeof item.id === 'string' ? item.id : undefined

  switch (item.type) {
    case 'commandExecution':
      await onEvent({
        type: 'tool.started',
        id,
        name: 'shell',
        detail: typeof item.command === 'string' ? item.command : undefined,
      })
      break
    case 'mcpToolCall':
      await onEvent({
        type: 'tool.started',
        id,
        name: `${String(item.server ?? 'mcp')}/${String(item.tool ?? 'tool')}`,
      })
      break
    case 'fileChange': {
      const count = Array.isArray(item.changes) ? item.changes.length : 0
      await onEvent({
        type: 'tool.started',
        id,
        name: 'file change',
        detail: `${count} file(s)`,
      })
      break
    }
    case 'webSearch':
      await onEvent({ type: 'tool.started', id, name: 'web search' })
      break
  }
}

async function forwardItemCompleted(
  itemValue: unknown,
  seenAgentDeltas: Set<string>,
  onEvent: (event: AgentStreamEvent) => void | Promise<void>,
): Promise<void> {
  const item = asRecord(itemValue)
  if (!item) {
    return
  }

  const id = typeof item.id === 'string' ? item.id : undefined

  switch (item.type) {
    case 'agentMessage': {
      const text = typeof item.text === 'string' ? item.text : ''
      if (text && !seenAgentDeltas.has(id ?? '')) {
        await onEvent({ type: 'delta', text })
      }
      break
    }
    case 'commandExecution': {
      if (typeof item.aggregatedOutput === 'string' && item.aggregatedOutput) {
        await onEvent({
          type: 'tool.output',
          id,
          text: item.aggregatedOutput.slice(-4000),
        })
      }
      await onEvent({
        type: 'tool.completed',
        id,
        name: 'shell',
        ok: item.status === 'completed',
      })
      break
    }
    case 'mcpToolCall':
      await onEvent({
        type: 'tool.completed',
        id,
        name: `${String(item.server ?? 'mcp')}/${String(item.tool ?? 'tool')}`,
        ok: item.status === 'completed',
      })
      break
    case 'fileChange':
      await onEvent({
        type: 'tool.completed',
        id,
        name: 'file change',
        ok: item.status === 'completed',
      })
      break
    case 'webSearch':
      await onEvent({ type: 'tool.completed', id, name: 'web search' })
      break
  }
}

export class CodexRuntime implements AgentRuntime {
  private child: ChildProcessWithoutNullStreams | null = null
  private startPromise: Promise<void> | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private listeners = new Set<(message: RpcMessage) => void | Promise<void>>()
  private eventQueue: Promise<void> = Promise.resolve()
  private buffer = ''
  private stderr = ''
  private userAgent = ''
  private closed = false
  private activeTurns = new Map<string, string>()
  private readonly app: ConnectedApp
  private readonly settings: CodexConnectedApp

  constructor(detail: ConnectedAppDetail) {
    if (detail.app.provider !== 'codex' || !detail.codex) {
      throw new Error('Connected app is not configured for Codex')
    }
    this.app = detail.app
    this.settings = detail.codex
  }

  private get connection(): CodexConnectedApp {
    return this.settings
  }

  private async ensureStarted(): Promise<void> {
    if (this.closed) {
      throw new Error('Codex runtime is closed')
    }
    if (this.child) {
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
    const binary = this.connection.binary || 'codex'
    const child = spawn(binary, ['app-server'], {
      cwd: this.app.workingDir,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.child = child
    this.buffer = ''
    this.stderr = ''

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.onData(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-4000)
    })
    child.on('error', (error) => this.handleExit(error))
    child.on('exit', (code, signal) => {
      this.handleExit(
        new Error(
          `codex app-server exited (${signal ?? code ?? 'unknown'})${this.stderr ? `: ${this.stderr.trim()}` : ''}`,
        ),
      )
    })

    try {
      const info = await this.request<{ userAgent?: string }>('initialize', {
        clientInfo: {
          name: 'agent_wrap',
          title: 'agent-wrap',
          version: '0.1.0',
        },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
        },
      })
      this.userAgent = typeof info.userAgent === 'string' ? info.userAgent : ''
      this.send({ method: 'initialized' })
    } catch (error) {
      this.handleExit(error instanceof Error ? error : new Error(String(error)))
      child.kill('SIGTERM')
      throw error
    }
  }

  private onData(chunk: string): void {
    this.buffer += chunk

    let index = this.buffer.indexOf('\n')
    while (index !== -1) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      index = this.buffer.indexOf('\n')

      if (!line) {
        continue
      }

      let message: RpcMessage
      try {
        message = JSON.parse(line) as RpcMessage
      } catch {
        console.warn(`[codex] Ignoring non-JSON line: ${line.slice(0, 200)}`)
        continue
      }

      this.handleMessage(message)
    }
  }

  private handleMessage(message: RpcMessage): void {
    if (message.id !== undefined && message.method) {
      this.handleServerRequest(message)
      return
    }

    if (message.id !== undefined && ('result' in message || 'error' in message)) {
      const pending = this.pending.get(Number(message.id))
      if (!pending) {
        return
      }

      this.pending.delete(Number(message.id))
      clearTimeout(pending.timer)

      if (message.error) {
        pending.reject(
          new Error(message.error.message ?? `Codex request failed (${message.error.code ?? 'unknown'})`),
        )
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (message.method) {
      this.emit(message)
    }
  }

  private handleServerRequest(message: RpcMessage): void {
    const id = message.id
    if (id === undefined) {
      return
    }

    let result: unknown

    switch (message.method) {
      case 'item/commandExecution/requestApproval':
      case 'item/fileChange/requestApproval':
        result = { decision: 'decline' }
        break
      case 'item/tool/requestUserInput':
        result = { answers: {} }
        break
      case 'mcpServer/elicitation/request':
        result = { action: 'decline', content: null, _meta: null }
        break
      default:
        this.trySend({
          id,
          error: {
            code: -32601,
            message: `Unsupported server request: ${message.method}`,
          },
        })
        return
    }

    this.trySend({ id, result })
  }

  private request<T = unknown>(method: string, params?: unknown, timeoutMs = 60_000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.child) {
        reject(new Error('codex app-server is not running'))
        return
      }

      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex request timed out: ${method}`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      })

      try {
        this.send({ id, method, params })
      } catch (error) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private send(message: unknown): void {
    const child = this.child
    if (!child) {
      throw new Error('codex app-server is not running')
    }
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private trySend(message: unknown): void {
    try {
      this.send(message)
    } catch (error) {
      console.error('[codex] Failed to send message', error)
    }
  }

  private emit(message: RpcMessage): void {
    if (this.listeners.size === 0) {
      return
    }

    const listeners = [...this.listeners]
    this.eventQueue = this.eventQueue.then(async () => {
      for (const listener of listeners) {
        try {
          await listener(message)
        } catch (error) {
          console.error('[codex] Listener failed', error)
        }
      }
    })
  }

  private handleExit(error: Error): void {
    const child = this.child
    if (!child) {
      return
    }

    this.child = null

    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }

    this.emit({ method: 'runtime/exit', params: { message: error.message } })
  }

  async test(): Promise<AgentTestResult> {
    await this.ensureStarted()

    let message = 'Connected'
    try {
      const result = await this.request<{
        account?: { type?: string; planType?: string; email?: string | null } | null
      }>('account/read', { refreshToken: false })
      const account = result.account
      if (account?.type === 'chatgpt') {
        message = `ChatGPT (${account.planType ?? 'unknown'})`
      } else if (account?.type) {
        message = account.type
      }
    } catch {
      // 認証情報が取れなくても app-server 自体の接続は成功している。
    }

    return {
      ok: true,
      provider: 'codex',
      message,
      version: this.userAgent || undefined,
    }
  }

  async chat({ sessionId, message, onEvent, signal }: ChatInput): Promise<void> {
    await this.ensureStarted()

    let threadId = sessionId

    if (threadId) {
      await this.request('thread/resume', {
        threadId,
        cwd: this.app.workingDir,
        sandbox: this.connection.sandbox,
        approvalPolicy: this.connection.approvalPolicy,
        ...(this.app.model ? { model: this.app.model } : {}),
      })
      await onEvent({ type: 'session', sessionId: threadId })
    } else {
      const result = await this.request<{ thread?: { id?: string } }>('thread/start', {
        cwd: this.app.workingDir,
        sandbox: this.connection.sandbox,
        approvalPolicy: this.connection.approvalPolicy,
        ephemeral: false,
        ...(this.app.model ? { model: this.app.model } : {}),
      })
      threadId = result.thread?.id
      if (!threadId) {
        throw new Error('Codex app-server did not return a thread id')
      }
      await onEvent({ type: 'session', sessionId: threadId })
    }

    const activeThreadId = threadId
    const seenAgentDeltas = new Set<string>()

    await new Promise<void>((resolve) => {
      let finished = false

      const finish = () => {
        if (finished) {
          return
        }
        finished = true
        this.listeners.delete(listener)
        signal?.removeEventListener('abort', abortHandler)
        resolve()
      }

      const listener = async (notification: RpcMessage) => {
        if (finished) {
          return
        }

        if (notification.method === 'runtime/exit') {
          const exitParams = asRecord(notification.params)
          await onEvent({
            type: 'error',
            message:
              typeof exitParams?.message === 'string'
                ? exitParams.message
                : 'Codex app-server disconnected',
          })
          await onEvent({ type: 'done', sessionId: activeThreadId })
          finish()
          return
        }

        const params = asRecord(notification.params)
        if (!params || params.threadId !== activeThreadId) {
          return
        }

        switch (notification.method) {
          case 'turn/started': {
            const turn = asRecord(params.turn)
            if (typeof turn?.id === 'string') {
              this.activeTurns.set(activeThreadId, turn.id)
            }
            break
          }
          case 'item/agentMessage/delta': {
            const itemId = typeof params.itemId === 'string' ? params.itemId : ''
            if (itemId) {
              seenAgentDeltas.add(itemId)
            }
            await onEvent({
              type: 'delta',
              text: typeof params.delta === 'string' ? params.delta : '',
            })
            break
          }
          case 'item/reasoning/textDelta':
          case 'item/reasoning/summaryTextDelta':
            await onEvent({
              type: 'reasoning',
              text: typeof params.delta === 'string' ? params.delta : '',
            })
            break
          case 'item/started':
            await forwardItemStarted(params.item, onEvent)
            break
          case 'item/completed':
            await forwardItemCompleted(params.item, seenAgentDeltas, onEvent)
            break
          case 'item/commandExecution/outputDelta':
            await onEvent({
              type: 'tool.output',
              id: typeof params.itemId === 'string' ? params.itemId : undefined,
              text: typeof params.delta === 'string' ? params.delta : '',
            })
            break
          case 'turn/completed': {
            const turn = asRecord(params.turn)
            this.activeTurns.delete(activeThreadId)
            if (turn?.status === 'failed') {
              const turnError = asRecord(turn.error)
              await onEvent({
                type: 'error',
                message:
                  typeof turnError?.message === 'string' ? turnError.message : 'Turn failed',
              })
            }
            await onEvent({ type: 'done', sessionId: activeThreadId })
            finish()
            break
          }
          case 'error': {
            const turnError = asRecord(params.error)
            await onEvent({
              type: 'error',
              message:
                typeof turnError?.message === 'string' ? turnError.message : 'Unknown Codex error',
            })
            break
          }
        }
      }

      const abortHandler = () => {
        const turnId = this.activeTurns.get(activeThreadId)
        if (turnId) {
          void this.request('turn/interrupt', {
            threadId: activeThreadId,
            turnId,
          }).catch(() => undefined)
        }
        void onEvent({ type: 'done', sessionId: activeThreadId })
        finish()
      }

      this.listeners.add(listener)
      signal?.addEventListener('abort', abortHandler, { once: true })

      this.request<{ turn?: { id?: string } }>('turn/start', {
        threadId: activeThreadId,
        input: [{ type: 'text', text: message, text_elements: [] }],
      })
        .then((result) => {
          if (typeof result.turn?.id === 'string') {
            this.activeTurns.set(activeThreadId, result.turn.id)
          }
        })
        .catch(async (error: unknown) => {
          await onEvent({ type: 'error', message: errorMessage(error) })
          await onEvent({ type: 'done', sessionId: activeThreadId })
          finish()
        })
    })
  }

  async interrupt(sessionId: string): Promise<void> {
    const turnId = this.activeTurns.get(sessionId)
    if (!turnId || !this.child) {
      return
    }
    await this.request('turn/interrupt', { threadId: sessionId, turnId })
  }

  async mcpServers(): Promise<McpServerSummary[]> {
    await this.ensureStarted()

    const result = await this.request<{ data?: Array<Record<string, unknown>> }>(
      'mcpServerStatus/list',
      { limit: 100 },
    )

    return (result.data ?? []).map((server) => {
      const tools = asRecord(server.tools)
      return {
        name: String(server.name ?? 'unknown'),
        status: mapMcpStatus(server.runtimeStatus),
        detail: typeof server.toolsError === 'string' ? server.toolsError : undefined,
        toolCount: tools ? Object.keys(tools).length : 0,
      }
    })
  }

  async close(): Promise<void> {
    this.closed = true
    const child = this.child
    this.handleExit(new Error('Codex runtime closed'))
    this.listeners.clear()

    if (!child) {
      return
    }

    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 3000)
      timer.unref?.()
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
