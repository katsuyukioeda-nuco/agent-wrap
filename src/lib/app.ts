import type { AppType } from '../../schema'
import type { ConnectedAppDetail } from '../../shared/agents'

export interface AppOutletContext {
  detail: ConnectedAppDetail
  refresh: () => Promise<void>
}

export const appTypeLabels: Record<AppType, string> = {
  codex: 'Codex',
  opencode: 'OpenCode',
}

export function mcpUrl(origin: string, appId: string): string {
  return `${origin.replace(/\/$/, '')}/${appId}/mcp`
}
