import type {
  AgentTestResult,
  ConnectedAppDetail,
  ConnectionStatus,
} from '../../shared/agents'
import { getAppDetail, setCodexAppServerUrl } from '../repositories/apps'
import { getClaudeAuthStatus } from './claude'
import { getRuntime, stopRuntime } from './manager'
import { discoverOpenCodeService } from './opencode'

export async function getConnectionStatus(
  detail: ConnectedAppDetail,
): Promise<ConnectionStatus> {
  if (detail.app.appType === 'codex') {
    return {
      connected: Boolean(detail.codex?.appServerUrl),
      appType: 'codex',
      url: detail.codex?.appServerUrl ?? null,
    }
  }

  if (detail.app.appType === 'claude') {
    const auth = await getClaudeAuthStatus(detail.claude?.binary)
    return {
      connected: auth.loggedIn,
      appType: 'claude',
      url: null,
    }
  }

  const discovered = await discoverOpenCodeService()
  return {
    connected: Boolean(discovered),
    appType: 'opencode',
    url: discovered?.url ?? null,
  }
}

/**
 * エージェント側で起動された Codex AppServer の WebSocket URL を登録し、
 * wrapper から接続できることを確認する。失敗したら URL を戻す。
 */
export async function connectCodexAppServer(
  appId: string,
  url: string,
): Promise<AgentTestResult> {
  if (!/^wss?:\/\//i.test(url)) {
    throw new Error('Codex AppServer URL must start with ws:// or wss://')
  }

  const before = await getAppDetail(appId)
  if (!before || before.app.appType !== 'codex' || !before.codex) {
    throw new Error('Connected app is not configured for Codex')
  }

  await setCodexAppServerUrl(appId, url)
  await stopRuntime(appId)

  const next = await getAppDetail(appId)
  if (!next) {
    throw new Error('Connected app not found')
  }

  try {
    const runtime = await getRuntime(next)
    return await runtime.test()
  } catch (error) {
    await setCodexAppServerUrl(appId, null)
    await stopRuntime(appId)
    throw error
  }
}
