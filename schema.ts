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
export type AppType = 'codex' | 'opencode'

/**
 * 接続済みアプリ。ユーザーが Codex / OpenCode を選んで作成する。
 * 画面（Web UI）はこのアプリの下に追加していく。
 */
export interface ConnectedApp {
  id: string // UUIDv7
  appType: AppType
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
  /** ユーザー（エージェント）側で起動した Codex AppServer の WebSocket URL。 */
  appServerUrl: string | null
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

/**
 * アプリ全体の状態。シングルトンとして扱う。
 * トップ画面は最後に開いた Connected App へリダイレクトする。
 */
export interface AppState {
  id: string // UUIDv7
  lastOpenConnectedAppId: ConnectedApp['id'] | null
  createdAt: string // ISO8601
  updatedAt: string // ISO8601
}
