import { connect } from 'node:net'
import type {
  AgentTestResult,
  ConnectedAppDetail,
  ConnectionStatus,
} from '../../shared/agents'
import { getAppDetail, setCodexAppServerUrl } from '../repositories/apps'
import { getClaudeAuthStatus } from './claude'
import { getRuntime, stopRuntime } from './manager'
import { discoverOpenCodeService } from './opencode'

/** AppServer の WebSocket URL に TCP で到達できるかだけを短時間で確認する。 */
function probeAppServer(url: string, timeoutMs = 1200): Promise<boolean> {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return Promise.resolve(false)
  }

  const port =
    Number(parsed.port) || (parsed.protocol === 'wss:' ? 443 : 80)

  return new Promise((resolve) => {
    let settled = false
    const socket = connect({ host: parsed.hostname, port })

    const done = (ok: boolean) => {
      if (settled) {
        return
      }
      settled = true
      socket.destroy()
      resolve(ok)
    }

    socket.setTimeout(timeoutMs, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

export async function getConnectionStatus(
  detail: ConnectedAppDetail,
): Promise<ConnectionStatus> {
  if (detail.app.appType === 'codex') {
    const url = detail.codex?.appServerUrl ?? null

    return {
      connected: url ? await probeAppServer(url) : false,
      appType: 'codex',
      url,
    }
  }

  if (detail.app.appType === 'claude') {
    const auth = await getClaudeAuthStatus(detail.claude?.binary)
    return {
      connected: auth.loggedIn,
      appType: 'claude',
      url: null,
      installed: auth.installed,
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
