import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Code2,
  Loader2,
  Plus,
  TerminalSquare,
} from 'lucide-react'
import type { ConnectedApp } from '../../schema'
import type { ConnectedAppDetail, ConnectionStatus } from '../../shared/agents'
import { appTypeLabels } from '@/lib/app'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import ConnectScreen from '@/screens/ConnectScreen'

export default function AppWorkspacePage() {
  const { appId } = useParams<{ appId: string }>()
  const [detail, setDetail] = useState<ConnectedAppDetail | null>(null)
  const [apps, setApps] = useState<ConnectedApp[]>([])
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!appId) {
      return
    }

    try {
      const [next, list] = await Promise.all([
        api<ConnectedAppDetail>(`/apps/${appId}`),
        api<ConnectedApp[]>('/apps'),
      ])
      const status = await api<ConnectionStatus>(
        `/apps/${appId}/connection`,
      ).catch(() => ({
        connected: false,
        appType: next.app.appType,
        url: null,
      }))
      setDetail(next)
      setApps(list)
      setConnection(status)
      setError(null)

      void api<void>('/app-state', {
        method: 'PUT',
        body: JSON.stringify({ lastOpenConnectedAppId: next.app.id }),
      }).catch(() => undefined)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!appId || connection?.connected) {
      return
    }

    let cancelled = false
    const timer = window.setInterval(() => {
      void api<ConnectionStatus>(`/apps/${appId}/connection`)
        .then((status) => {
          if (!cancelled) {
            setConnection(status)
          }
        })
        .catch(() => undefined)
    }, 2000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [appId, connection?.connected])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    )
  }

  if (error || !detail || !appId) {
    return (
      <div className="bg-muted/30 flex min-h-screen items-center justify-center px-4">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="font-medium">Connected App を読み込めませんでした</p>
          <p className="text-muted-foreground text-sm">{error ?? 'Not found'}</p>
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft />
              接続先を選ぶ
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-muted/30 min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl gap-4 px-4 py-6 lg:gap-6 lg:py-10">
        <aside className="hidden w-14 shrink-0 flex-col items-center gap-2 lg:flex">
          {apps.map((app) => (
            <AppRailIcon key={app.id} app={app} active={app.id === appId} />
          ))}
          <div className="bg-border my-1 h-px w-8" />
          <Link
            to="/?pick=1"
            title="接続先を選ぶ"
            aria-label="接続先を選ぶ"
            className="border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground flex size-11 items-center justify-center rounded-xl border border-dashed transition-colors"
          >
            <Plus className="size-5" />
          </Link>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1 lg:hidden">
            {apps.map((app) => (
              <AppRailIcon
                key={app.id}
                app={app}
                active={app.id === appId}
                compact
              />
            ))}
            <Link
              to="/?pick=1"
              title="接続先を選ぶ"
              aria-label="接続先を選ぶ"
              className="border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg border border-dashed transition-colors"
            >
              <Plus className="size-4" />
            </Link>
          </div>

          {connection?.connected ? (
            <Outlet context={{ detail, refresh: load }} />
          ) : (
            <ConnectScreen detail={detail} />
          )}
        </main>
      </div>
    </div>
  )
}

function AppRailIcon({
  app,
  active,
  compact = false,
}: {
  app: ConnectedApp
  active: boolean
  compact?: boolean
}) {
  const Icon = app.appType === 'codex' ? Code2 : TerminalSquare
  const title = `${appTypeLabels[app.appType]} ${app.id.slice(0, 8)}`

  return (
    <Link
      to={`/${app.id}/`}
      title={title}
      aria-label={`${title} を開く`}
      className={cn(
        'flex shrink-0 items-center justify-center border transition-colors',
        compact ? 'size-8 rounded-lg' : 'size-11 rounded-xl',
        active
          ? 'bg-foreground text-background border-foreground'
          : 'bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40',
      )}
    >
      <Icon className={compact ? 'size-4' : 'size-5'} />
    </Link>
  )
}
