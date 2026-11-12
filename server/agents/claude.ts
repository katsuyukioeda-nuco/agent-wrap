import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  query,
  type Options,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeConnectedApp } from '../../schema'
import type {
  AgentStreamEvent,
  AgentTestResult,
  ConnectedAppDetail,
  McpServerSummary,
} from '../../shared/agents'
import type { AgentRuntime, ChatInput } from './types'
import { mcpOrigin } from './utils'

const execFileAsync = promisify(execFile)

export interface ClaudeAuthStatus {
  installed: boolean
  loggedIn: boolean
  authMethod?: string
}

const claudeBinaryCandidates = [
  join(homedir(), '.local', 'bin', 'claude'),
  join(homedir(), '.claude', 'local', 'claude'),
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
]

let detectedBinary: Promise<string | null> | null = null

async function detectClaudeBinary(): Promise<string | null> {
  try {
    await execFileAsync('claude', ['--version'], { timeout: 5000 })
    return 'claude'
  } catch {
    // PATH に無い場合は一般的なインストール先を見る。
  }

  for (const candidate of claudeBinaryCandidates) {
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // 次の候補を見る。
    }
  }

  return null
}

/** 使用する claude 実行ファイルを解決する。 */
export function resolveClaudeBinary(
  binary?: string | null,
): Promise<string | null> {
  if (binary?.trim()) {
    return Promise.resolve(binary.trim())
  }

  if (!detectedBinary) {
    detectedBinary = detectClaudeBinary()
  }

  return detectedBinary
}

/** `claude auth status` でログイン状態を確認する。 */
export async function getClaudeAuthStatus(
  binary?: string | null,
): Promise<ClaudeAuthStatus> {
  const command = await resolveClaudeBinary(binary)

  if (!command) {
    return { installed: false, loggedIn: false }
  }

  const parse = (stdout: string): ClaudeAuthStatus | null => {
    try {
      const parsed = JSON.parse(stdout) as {
        loggedIn?: boolean
        authMethod?: string
      }
      return {
        installed: true,
        loggedIn: Boolean(parsed.loggedIn),
        authMethod: parsed.authMethod,
      }
    } catch {
      return null
    }
  }

  try {
    const { stdout } = await execFileAsync(command, ['auth', 'status', '--json'], {
      timeout: 5000,
    })
    return parse(stdout) ?? { installed: true, loggedIn: false }
  } catch (error) {
    // 未ログイン時は終了コード 1 で JSON が返る。
    const stdout = (error as { stdout?: string }).stdout
    if (typeof stdout === 'string') {
      const status = parse(stdout)
      if (status) {
        return status
      }
    }

    const code = (error as NodeJS.ErrnoException).code
    return { installed: code !== 'ENOENT', loggedIn: false }
  }
}

/**
 * 非同期イテラブルな入力キュー。
 * SDK の streaming input にユーザーメッセージを流し込む。
 */
class AsyncQueue<T> implements AsyncIterable<T> {
  private values: T[] = []
  private resolvers: Array<(result: IteratorResult<T>) => void> = []
  private closed = false

  push(value: T): void {
    if (this.closed) {
      return
    }

    const resolver = this.resolvers.shift()
    if (resolver) {
      resolver({ value, done: false })
    } else {
      this.values.push(value)
    }
  }

  close(): void {
    this.closed = true
    for (const resolver of this.resolvers.splice(0)) {
      resolver({ value: undefined, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift()
        if (value !== undefined) {
          return Promise.resolve({ value, done: false })
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve)
        })
      },
      return: () => {
        this.close()
        return Promise.resolve({ value: undefined, done: true })
      },
    }
  }
}

interface Turn {
  resolve: () => void
  reject: (error: Error) => void
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function textOf(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  const record = asRecord(value)
  if (record && typeof record.text === 'string') {
    return record.text
  }

  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

/**
 * Claude Code ランタイム。
 *
 * Codex / OpenCode と違い待ち受けサーバーが無いため、Claude Agent SDK 経由で
 * CLI プロセスを起動し、streaming input で会話する。
 */
export class ClaudeRuntime implements AgentRuntime {
  private readonly settings: ClaudeConnectedApp
  private readonly appId: string

  private input: AsyncQueue<SDKUserMessage> | null = null
  private current: Query | null = null
  private consuming: Promise<void> | null = null
  private turn: Turn | null = null
  private onEvent: ChatInput['onEvent'] | null = null
  private toolNames = new Map<string, string>()
  private closed = false

  constructor(detail: ConnectedAppDetail) {
    if (detail.app.appType !== 'claude' || !detail.claude) {
      throw new Error('Connected app is not configured for Claude Code')
    }

    this.settings = detail.claude
    this.appId = detail.app.id
  }

  private options(binary: string): Options {
    return {
      cwd: process.cwd(),
      includePartialMessages: true,
      permissionMode: this.settings.permissionMode,
      ...(this.settings.permissionMode === 'bypassPermissions'
        ? { allowDangerouslySkipPermissions: true }
        : {}),
      ...(this.settings.model ? { model: this.settings.model } : {}),
      pathToClaudeCodeExecutable: binary,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      mcpServers: {
        'agent-wrap': {
          type: 'http',
          url: `${mcpOrigin()}/${this.appId}/mcp`,
        },
      },
    }
  }

  private async ensureStarted(): Promise<void> {
    if (this.closed) {
      throw new Error('Claude runtime is closed')
    }
    if (this.current) {
      return
    }

    const input = new AsyncQueue<SDKUserMessage>()
    const binary = await resolveClaudeBinary(this.settings.binary)

    if (!binary) {
      throw new Error(
        'Claude Code が見つかりません。`claude` をインストールしてください。',
      )
    }

    const current = query({ prompt: input, options: this.options(binary) })

    this.input = input
    this.current = current
    this.consuming = this.consume(current)

    try {
      await current.initializationResult()
    } catch (error) {
      await this.close()
      throw error
    }
  }

  private async consume(current: Query): Promise<void> {
    try {
      for await (const message of current) {
        if (this.closed) {
          break
        }
        await this.handleMessage(message)
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      this.failTurn(failure)
      await this.emit({ type: 'error', message: failure.message })
      return
    }

    if (!this.closed) {
      this.failTurn(new Error('Claude Code のプロセスが終了しました'))
    }
  }

  private async handleMessage(message: SDKMessage): Promise<void> {
    switch (message.type) {
      case 'system': {
        if (message.subtype === 'init') {
          await this.emit({ type: 'session', sessionId: message.session_id })
        }
        return
      }
      case 'stream_event': {
        const event = message.event

        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            await this.emit({ type: 'delta', text: event.delta.text })
          } else if (event.delta.type === 'thinking_delta') {
            await this.emit({ type: 'reasoning', text: event.delta.thinking })
          }
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            this.toolNames.set(
              event.content_block.id,
              event.content_block.name,
            )
            await this.emit({
              type: 'tool.started',
              id: event.content_block.id,
              name: event.content_block.name,
            })
          }
        }
        return
      }
      case 'user': {
        const content = message.message.content

        if (!Array.isArray(content)) {
          return
        }

        for (const block of content) {
          if (block.type !== 'tool_result') {
            continue
          }

          const output = textOf(block.content)
          if (output) {
            await this.emit({
              type: 'tool.output',
              id: block.tool_use_id,
              text: output,
            })
          }

          await this.emit({
            type: 'tool.completed',
            id: block.tool_use_id,
            name: this.toolNames.get(block.tool_use_id) ?? 'tool',
            ok: !block.is_error,
          })
          this.toolNames.delete(block.tool_use_id)
        }
        return
      }
      case 'assistant': {
        if (message.error) {
          return
        }

        for (const block of message.message.content) {
          if (block.type === 'tool_use') {
            this.toolNames.set(block.id, block.name)
          }
        }
        return
      }
      case 'result': {
        if (message.subtype === 'success' && !message.is_error) {
          await this.emit({ type: 'done', sessionId: message.session_id })
        } else {
          const detail =
            message.subtype === 'success'
              ? message.result
              : message.errors.join('\n')
          await this.emit({
            type: 'error',
            message: detail || 'Claude Code の実行に失敗しました。',
          })
        }

        this.resolveTurn()
        return
      }
    }
  }

  private async emit(event: AgentStreamEvent): Promise<void> {
    const handler = this.onEvent
    if (!handler) {
      return
    }

    await handler(event)
  }

  private resolveTurn(): void {
    const turn = this.turn
    this.turn = null
    turn?.resolve()
  }

  private failTurn(error: Error): void {
    const turn = this.turn
    this.turn = null
    turn?.reject(error)
  }

  async test(): Promise<AgentTestResult> {
    const auth = await getClaudeAuthStatus(this.settings.binary)

    if (!auth.installed) {
      return {
        ok: false,
        appType: 'claude',
        message:
          'Claude Code が見つかりません。`claude` をインストールしてください。',
      }
    }

    if (!auth.loggedIn) {
      return {
        ok: false,
        appType: 'claude',
        message:
          'Claude Code にログインしていません。`claude auth login` を実行してください。',
      }
    }

    return {
      ok: true,
      appType: 'claude',
      message: auth.authMethod
        ? `Claude Code (${auth.authMethod})`
        : 'Claude Code',
    }
  }

  async chat({ message, onEvent, signal }: ChatInput): Promise<void> {
    await this.ensureStarted()

    if (this.turn) {
      throw new Error('A Claude Code turn is already running')
    }

    this.onEvent = onEvent

    const done = new Promise<void>((resolve, reject) => {
      this.turn = { resolve, reject }
    })

    const abort = () => {
      void this.current?.interrupt().catch(() => undefined)
    }
    signal?.addEventListener('abort', abort, { once: true })

    this.input?.push({
      type: 'user',
      message: { role: 'user', content: message },
      parent_tool_use_id: null,
    })

    try {
      await done
    } finally {
      signal?.removeEventListener('abort', abort)
      this.turn = null
      this.onEvent = null
    }
  }

  async interrupt(): Promise<void> {
    await this.current?.interrupt()
  }

  async mcpServers(): Promise<McpServerSummary[]> {
    await this.ensureStarted()

    const statuses = await this.current?.mcpServerStatus()
    return (statuses ?? []).map((status) => ({
      name: status.name,
      status: status.status,
      detail: status.error,
    }))
  }

  async close(): Promise<void> {
    this.closed = true
    this.turn = null
    this.input?.close()
    this.current?.close()
    this.input = null
    this.current = null
    await this.consuming?.catch(() => undefined)
    this.consuming = null
  }
}
