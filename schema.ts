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
export type AppType = 'codex' | 'opencode' | 'claude'

/**
 * 接続済みアプリ。ユーザーが Codex / OpenCode / Claude Code を選んで作成する。
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
 * Claude Code 固有の接続設定。ConnectedApp と 1:1。
 * Claude Code には待ち受けサーバーが無いため、wrapper が CLI プロセスを起動する。
 */
export interface ClaudeConnectedApp {
  id: string // UUIDv7
  connectedAppId: ConnectedApp['id']
  /** 使用する claude 実行ファイル。null の場合は SDK 同梱のバイナリを使う。 */
  binary: string | null
  permissionMode: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  /** 使用するモデル。null の場合は CLI のデフォルト。 */
  model: string | null
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

/**
 * セッションに保存されたコメント。
 * MCP の list_comments で未対応分を取得し、done_comment で対応済みにする。
 */
export interface SessionComment {
  id: string // UUIDv7
  connectedAppId: ConnectedApp['id']
  /** OpenCode のセッション ID、または Codex の thread ID。 */
  sessionId: string
  kind: 'file' | 'diff'
  /** ワークスペースからの相対パス。 */
  path: string
  /** 差分の場合のリポジトリパス。'.' はルート。 */
  repoPath: string
  startLine: number | null
  endLine: number | null
  side: 'old' | 'new' | 'both' | null
  selection: string
  comment: string
  /** 選択範囲をまとめた添付ファイルの絶対パス。 */
  attachmentPath: string | null
  createdAt: string // ISO8601
  doneAt: string | null // ISO8601
}

export type ProcessStatus = 'starting' | 'running' | 'exited' | 'failed' | 'killed'

/**
 * エージェントが MCP から起動したプロセス。
 * 一度起動すると自動的に管理対象になり、一覧とログを参照できる。
 */
export interface ProcessDefinition {
  id: string // UUIDv7
  connectedAppId: ConnectedApp['id']
  /** OpenCode のセッション ID、または Codex の thread ID。 */
  sessionId: string
  /** 一覧に表示する名前。未指定なら command から作る。 */
  name: string
  cwd: string
  command: string
  pid: number | null
  status: ProcessStatus
  exitCode: number | null
  signal: string | null
  /** stdout / stderr をまとめたログファイルの絶対パス。 */
  logPath: string
  createdAt: string // ISO8601
  startedAt: string | null // ISO8601
  endedAt: string | null // ISO8601
  updatedAt: string // ISO8601
}
