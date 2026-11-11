/**
 * アプリケーションのスキーマ定義。
 *
 * 規約:
 * - id は必須。UUIDv7 の文字列。
 * - リレーションは HasOne などを書かず、外部キーを `xxxId: EntityName['id']` で表現する。
 * - createdAt は必須。ISO8601 文字列。
 * - updatedAt は更新を許可するエンティティのみ持つ。ISO8601 文字列。
 *
 * DB の DDL は db/migrations/ に置き、このファイルと手動で同期する。
 */
export interface User {
  id: string // UUIDv7
  name: string
  email: string
  createdAt: string // ISO8601
}

export interface Todo {
  id: string // UUIDv7
  title: string
  authorId: User['id']
  createdAt: string // ISO8601
  updatedAt: string // ISO8601
}

/**
 * AI エージェントのハーネス種別。
 * Codex は `codex app-server`（JSON-RPC / stdio）、
 * OpenCode は `opencode serve`（HTTP / SSE）に接続する。
 */
export type AgentProvider = 'codex' | 'opencode'

/**
 * 接続済みアプリ。ユーザーが最初に Codex / OpenCode を選んで作成する。
 * 複数作成でき、画面（Web UI）はこのアプリの下に追加していく。
 */
export interface ConnectedApp {
  id: string // UUIDv7
  name: string
  provider: AgentProvider
  workingDir: string
  createdAt: string // ISO8601
  updatedAt: string // ISO8601
}

/**
 * Codex 固有の接続設定。ConnectedApp と 1:1。
 * 外部キーは connectedAppId: ConnectedApp['id'] で表現する。
 */
export interface CodexConnectedApp {
  id: string // UUIDv7
  connectedAppId: ConnectedApp['id']
  binary: string
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  approvalPolicy: 'never' | 'on-request' | 'untrusted'
  createdAt: string // ISO8601
  updatedAt: string // ISO8601
}

/**
 * OpenCode 固有の接続設定。ConnectedApp と 1:1。
 * 外部キーは connectedAppId: ConnectedApp['id'] で表現する。
 */
export interface OpencodeConnectedApp {
  id: string // UUIDv7
  connectedAppId: ConnectedApp['id']
  binary: string
  /** 0 の場合は空きポートを自動で確保する。 */
  port: number
  createdAt: string // ISO8601
  updatedAt: string // ISO8601
}
