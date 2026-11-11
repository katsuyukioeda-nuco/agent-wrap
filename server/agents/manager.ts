import type { ConnectedAppDetail } from '../../shared/agents'
import { CodexRuntime } from './codex'
import { OpenCodeRuntime } from './opencode'
import type { AgentRuntime } from './types'

interface RuntimeEntry {
  runtime: AgentRuntime
  signature: string
}

const runtimes = new Map<string, RuntimeEntry>()

function signature(detail: ConnectedAppDetail): string {
  return JSON.stringify({
    appType: detail.app.appType,
    codex: detail.codex,
    opencode: detail.opencode,
  })
}

export async function getRuntime(detail: ConnectedAppDetail): Promise<AgentRuntime> {
  const key = detail.app.id
  const current = runtimes.get(key)
  const nextSignature = signature(detail)

  if (current && current.signature === nextSignature) {
    return current.runtime
  }

  if (current) {
    await current.runtime.close()
    runtimes.delete(key)
  }

  const runtime =
    detail.app.appType === 'codex'
      ? new CodexRuntime(detail)
      : new OpenCodeRuntime(detail)

  runtimes.set(key, { runtime, signature: nextSignature })
  return runtime
}

export async function stopRuntime(appId: string): Promise<void> {
  const current = runtimes.get(appId)
  if (!current) {
    return
  }
  runtimes.delete(appId)
  await current.runtime.close()
}

export async function stopAllRuntimes(): Promise<void> {
  const entries = [...runtimes.values()]
  runtimes.clear()
  await Promise.allSettled(entries.map((entry) => entry.runtime.close()))
}
