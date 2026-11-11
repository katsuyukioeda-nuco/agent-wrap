import type { AgentProvider } from '../../schema'
import type { ConnectedAppDetail } from '../../shared/agents'

export interface AppOutletContext {
  detail: ConnectedAppDetail
  refresh: () => Promise<void>
}

export const providerLabels: Record<AgentProvider, string> = {
  codex: 'Codex',
  opencode: 'OpenCode',
}

export function sessionStorageKey(appId: string): string {
  return `agent-wrap:session:${appId}`
}

export function mcpUrl(origin: string, appId: string): string {
  return `${origin.replace(/\/$/, '')}/${appId}/mcp`
}
