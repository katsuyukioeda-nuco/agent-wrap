import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Code2, Loader2, TerminalSquare } from 'lucide-react'
import type { AgentProvider, ConnectedApp } from '../../schema'
import type { ConnectedAppDetail } from '../../shared/agents'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const choices: Array<{
  provider: AgentProvider
  label: string
  icon: typeof Code2
}> = [
  { provider: 'codex', label: 'Codex', icon: Code2 },
  { provider: 'opencode', label: 'OpenCode', icon: TerminalSquare },
]

export default function AppsPage() {
  const navigate = useNavigate()
  const [connecting, setConnecting] = useState<AgentProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSelect(provider: AgentProvider): Promise<void> {
    if (connecting) {
      return
    }

    setConnecting(provider)
    setError(null)

    try {
      const apps = await api<ConnectedApp[]>('/apps')
      const existing = apps.find((app) => app.provider === provider)

      if (existing) {
        navigate(`/${existing.id}/`)
        return
      }

      const detail = await api<ConnectedAppDetail>('/apps', {
        method: 'POST',
        body: JSON.stringify({ provider }),
      })
      navigate(`/${detail.app.id}/`)
    } catch (selectError) {
      setError(
        selectError instanceof Error ? selectError.message : String(selectError),
      )
      setConnecting(null)
    }
  }

  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-lg flex-col items-center gap-8">
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          どちらを使っていますか？
        </h1>

        <div className="grid w-full grid-cols-2 gap-4">
          {choices.map((choice) => {
            const Icon = choice.icon
            const isConnecting = connecting === choice.provider

            return (
              <button
                key={choice.provider}
                type="button"
                onClick={() => void handleSelect(choice.provider)}
                disabled={connecting !== null}
                className={cn(
                  'group bg-background flex h-40 flex-col items-center justify-center gap-4 rounded-xl border shadow-sm transition-all',
                  'hover:border-foreground/40 hover:shadow-md',
                  'disabled:cursor-wait disabled:opacity-60',
                )}
              >
                {isConnecting ? (
                  <Loader2 className="text-muted-foreground size-7 animate-spin" />
                ) : (
                  <Icon className="size-7 transition-transform group-hover:scale-105" />
                )}
                <span className="text-lg font-medium">{choice.label}</span>
              </button>
            )
          })}
        </div>

        {error && <p className="text-destructive text-center text-sm">{error}</p>}
      </div>
    </div>
  )
}
