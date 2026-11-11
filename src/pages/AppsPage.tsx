import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import type { AppState, AppType, ConnectedApp } from '../../schema'
import type { ConnectedAppDetail } from '../../shared/agents'
import { AppTypeLogo } from '@/components/app-type-logo'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const choices: Array<{
  appType: AppType
  label: string
}> = [
  { appType: 'codex', label: 'Codex' },
  { appType: 'opencode', label: 'OpenCode' },
]

export default function AppsPage() {
  const navigate = useNavigate()

  const [apps, setApps] = useState<ConnectedApp[]>([])
  const [lastOpenId, setLastOpenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<AppType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [appList, state] = await Promise.all([
          api<ConnectedApp[]>('/apps'),
          api<AppState>('/app-state'),
        ])
        if (!cancelled) {
          setApps(appList)
          setLastOpenId(state.lastOpenConnectedAppId)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSelect(appType: AppType): Promise<void> {
    if (connecting) {
      return
    }

    setConnecting(appType)
    setError(null)

    try {
      const detail = await api<ConnectedAppDetail>('/apps', {
        method: 'POST',
        body: JSON.stringify({ appType }),
      })
      navigate(`/${detail.app.id}/`)
    } catch (selectError) {
      setError(
        selectError instanceof Error ? selectError.message : String(selectError),
      )
      setConnecting(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-muted/30 flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    )
  }

  if (apps.length > 0) {
    const target = apps.find((app) => app.id === lastOpenId)?.id ?? apps[0].id
    return <Navigate to={`/${target}/`} replace />
  }

  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-lg flex-col items-center gap-8">
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          どちらを使っていますか？
        </h1>

        <div className="grid w-full grid-cols-2 gap-4">
          {choices.map((choice) => {
            const isConnecting = connecting === choice.appType

            return (
              <button
                key={choice.appType}
                type="button"
                onClick={() => void handleSelect(choice.appType)}
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
                  <AppTypeLogo
                    appType={choice.appType}
                    className="h-[60px] transition-transform group-hover:scale-105"
                  />
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
