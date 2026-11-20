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
  /** Claude Code の実行ファイルが見つかっているか。 */
  installed?: boolean
}

/** エージェント側に登録されているプロジェクト。 */
export interface ProjectSummary {
  id: string
  /** ディレクトリの絶対パス。 */
  path: string
  /** ディレクトリ名。 */
  name: string
  vcs?: string
  createdAt?: string
  updatedAt?: string
  /** 最後にそのプロジェクトで作業した日時。 */
  lastActiveAt?: string
  sessionCount?: number
}

export interface ProjectsResponse {
  /** このアプリ種別がプロジェクト一覧に対応しているか。 */
  supported: boolean
  projects: ProjectSummary[]
  error?: string
}

/** プロジェクト配下のセッション（Codex ではスレッド）。 */
export interface SessionSummary {
  id: string
  projectId: string
  title: string
  agent?: string
  model?: string
  provider?: string
  /** セッションが実行されたディレクトリ。 */
  directory?: string
  createdAt?: string
  updatedAt?: string
  status?: 'running' | 'idle' | 'error'
  outcome?: string
}

export interface SessionsResponse {
  supported: boolean
  sessions: SessionSummary[]
  error?: string
}

export interface RecentSessionsResponse {
  supported: boolean
  sessions: SessionSummary[]
  error?: string
}

/** セッションを外部 UI に埋め込むための情報。 */
export interface SessionEmbed {
  /** 埋め込み先の URL。対応していない場合は null。 */
  url: string | null
  /** 埋め込めない理由。 */
  reason?: string
}

export interface SessionDetailResponse {
  session: SessionSummary
  project: ProjectSummary | null
  embed: SessionEmbed
}

export interface WorkspaceRoot {
  id: string
  path: string
  name: string
  git: boolean
}

export interface WorkspaceInfo {
  roots: WorkspaceRoot[]
}

export interface WorkspaceEntry {
  name: string
  /** ワークスペースルートからの相対パス。 */
  path: string
  type: 'file' | 'directory'
}

export interface WorkspaceFilesResponse {
  path: string
  entries: WorkspaceEntry[]
}

export interface WorkspaceAllFilesResponse {
  /** ワークスペースルートからの相対パス。 */
  files: string[]
  /** 上限を超えて一部だけ返した場合 true。 */
  truncated: boolean
}

export interface WorkspaceFileResponse {
  path: string
  size: number
  binary: boolean
  truncated: boolean
  content?: string
}

export interface GitChangedFile {
  id: string
  repoPath: string
  repoLabel: string
  repoKind: 'root' | 'submodule'
  /** リポジトリ内の相対パス。 */
  path: string
  status: string
  diff: string
  untracked: boolean
  truncated?: boolean
}

export interface GitRepoSummary {
  path: string
  label: string
  kind: 'root' | 'submodule'
  branch?: string
}

export interface WorkspaceDiffResponse {
  git: boolean
  repos: GitRepoSummary[]
  files: GitChangedFile[]
}
