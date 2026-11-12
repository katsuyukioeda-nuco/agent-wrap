import type {
  AppType,
  ClaudeConnectedApp,
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

/** API が返す、アプリ種別ごとの設定を外部結合した ConnectedApp。 */
export interface ConnectedAppDetail {
  app: ConnectedApp
  codex: CodexConnectedApp | null
  opencode: OpencodeConnectedApp | null
  claude: ClaudeConnectedApp | null
}

export interface AgentTestResult {
  ok: boolean
  appType: AppType
  message: string
  version?: string
}

export interface McpServerSummary {
  name: string
  status: 'connected' | 'pending' | 'failed' | 'disabled' | 'needs-auth' | 'unknown'
  detail?: string
  toolCount?: number
}

export interface ConnectionStatus {
  connected: boolean
  appType: AppType
  url?: string | null
}
