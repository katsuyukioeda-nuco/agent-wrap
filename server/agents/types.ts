import type { ConnectedApp } from '../../schema'
import type {
  AgentStreamEvent,
  AgentTestResult,
  McpServerSummary,
  ProjectSummary,
  SessionEmbed,
  SessionSummary,
} from '../../shared/agents'

export interface ChatInput {
  sessionId?: string
  message: string
  onEvent: (event: AgentStreamEvent) => void | Promise<void>
  signal?: AbortSignal
}

export interface CommentAttachment {
  uri: string
  name: string
  description?: string
}

export interface CommentInput {
  sessionId: string
  text: string
  /** セッションの作業ディレクトリ。 */
  cwd?: string
  /** 選択元のファイルがある場合、その絶対パス。 */
  filePath?: string
  /** Codex の mention に表示する名前。 */
  mentionName?: string
  /** OpenCode の files 添付。 */
  attachments?: CommentAttachment[]
}

export interface AgentRuntime {
  test(): Promise<AgentTestResult>
  chat(input: ChatInput): Promise<void>
  interrupt(sessionId: string): Promise<void>
  mcpServers(): Promise<McpServerSummary[]>
  projects(): Promise<ProjectSummary[]>
  sessions(project: ProjectSummary): Promise<SessionSummary[]>
  recentSessions(limit: number): Promise<SessionSummary[]>
  session(sessionId: string): Promise<SessionSummary | null>
  sessionEmbed(sessionId: string): Promise<SessionEmbed>
  comment(input: CommentInput): Promise<void>
  close(): Promise<void>
}

export interface RuntimeFactory {
  create(app: ConnectedApp): AgentRuntime
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
