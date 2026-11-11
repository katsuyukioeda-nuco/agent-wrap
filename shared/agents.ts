import type {
  CodexConnectedApp,
  ConnectedApp,
  OpencodeConnectedApp,
} from '../schema'

/** サーバーから Web UI へ流す正規化済みのイベント。 */
export type AgentStreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool.started'; id?: string; name: string; detail?: string }
  | { type: 'tool.output'; id?: string; text: string }
  | { type: 'tool.completed'; id?: string; name: string; ok?: boolean }
  | { type: 'permission'; message: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; message: string }

/** API が返す、プロバイダー設定を外部結合した ConnectedApp。 */
export interface ConnectedAppDetail {
  app: ConnectedApp
  codex: CodexConnectedApp | null
  opencode: OpencodeConnectedApp | null
}

export interface AgentTestResult {
  ok: boolean
  provider: 'codex' | 'opencode'
  message: string
  version?: string
}

export interface McpServerSummary {
  name: string
  status: 'connected' | 'pending' | 'failed' | 'disabled' | 'needs-auth' | 'unknown'
  detail?: string
  toolCount?: number
}
