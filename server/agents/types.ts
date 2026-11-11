import type { ConnectedApp } from '../../schema'
import type { AgentStreamEvent, AgentTestResult, McpServerSummary } from '../../shared/agents'

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
  close(): Promise<void>
}

export interface RuntimeFactory {
  create(app: ConnectedApp): AgentRuntime
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
