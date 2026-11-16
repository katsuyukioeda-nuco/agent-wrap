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
  close(): Promise<void>
}

export interface RuntimeFactory {
  create(app: ConnectedApp): AgentRuntime
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
