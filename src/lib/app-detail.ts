import type { ConnectedAppDetail } from '../../shared/agents'

export function providerSettingsSummary(detail: ConnectedAppDetail): string {
  if (detail.app.provider === 'codex') {
    return detail.codex
      ? `${detail.codex.binary} · ${detail.codex.sandbox} · approvals: ${detail.codex.approvalPolicy}`
      : 'Codex settings missing'
  }

  return detail.opencode
    ? `${detail.opencode.binary} · port: ${detail.opencode.port || 'auto'}`
    : 'OpenCode settings missing'
}
