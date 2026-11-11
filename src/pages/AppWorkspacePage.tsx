import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Code2,
  Copy,
  Loader2,
  Plus,
  TerminalSquare,
} from 'lucide-react'
import type { AppType, ConnectedApp } from '../../schema'
import type { ConnectedAppDetail, ConnectionStatus } from '../../shared/agents'
import { appTypeLabels, mcpUrl } from '@/lib/app'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import ConnectScreen from '@/screens/ConnectScreen'

const addChoices: Array<{
  appType: AppType
  label: string
  icon: typeof Code2
}> = [
  { appType: 'codex', label: 'Codex', icon: Code2 },
  { appType: 'opencode', label: 'OpenCode', icon: TerminalSquare },
]

export default function AppWorkspacePage() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<ConnectedAppDetail | null>(null)
  const [apps, setApps] = useState<ConnectedApp[]>([])
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState<AppType | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [copiedMcp, setCopiedMcp] = useState(false)

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

  async function handleAdd(appType: AppType): Promise<void> {
    if (adding) {
      return
    }

    setAdding(appType)
    setAddError(null)

    try {
      const created = await api<ConnectedAppDetail>('/apps', {
        method: 'POST',
        body: JSON.stringify({ appType }),
      })
      setAddOpen(false)
      navigate(`/${created.app.id}/`)
    } catch (createError) {
      setAddError(
        createError instanceof Error ? createError.message : String(createError),
      )
    } finally {
      setAdding(null)
    }
  }

  async function handleCopyMcp(): Promise<void> {
    if (!appId) {
      return
    }

    try {
      await navigator.clipboard.writeText(mcpUrl(window.location.origin, appId))
      setCopiedMcp(true)
      window.setTimeout(() => setCopiedMcp(false), 1500)
    } catch {
      setCopiedMcp(false)
    }
  }

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
    <Dialog
      open={addOpen}
      onOpenChange={(open) => {
        if (!adding) {
          setAddOpen(open)
          if (!open) {
            setAddError(null)
          }
        }
      }}
    >
      <div className="bg-muted/30 min-h-screen">
        <div className="mx-auto flex min-h-screen w-full max-w-4xl gap-4 px-4 py-6 lg:gap-6 lg:py-10">
          <aside className="hidden w-14 shrink-0 flex-col items-center gap-2 lg:flex">
            {apps.map((app) => (
              <AppRailIcon key={app.id} app={app} active={app.id === appId} />
            ))}
            <div className="bg-border my-1 h-px w-8" />
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              title="アプリを追加"
              aria-label="アプリを追加"
              className="border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground flex size-11 cursor-pointer items-center justify-center rounded-xl border border-dashed transition-colors"
            >
              <Plus className="size-5" />
            </button>
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
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                title="アプリを追加"
                aria-label="アプリを追加"
                className="border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed transition-colors"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <div className="mb-4 flex justify-end">
              <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    connection?.connected ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                  )}
                />
                <span className="shrink-0 font-medium">MCP</span>
                <code
                  className="max-w-[45vw] truncate font-mono sm:max-w-md"
                  title={mcpUrl(window.location.origin, appId)}
                >
                  {mcpUrl(window.location.origin, appId)}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label="MCP URL をコピー"
                  onClick={() => void handleCopyMcp()}
                >
                  {copiedMcp ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>

            {connection?.connected ? (
              <Outlet context={{ detail, refresh: load }} />
            ) : (
              <ConnectScreen detail={detail} />
            )}
          </main>
        </div>
      </div>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>アプリを追加</DialogTitle>
          <DialogDescription>どちらを追加しますか？</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {addChoices.map((choice) => {
            const Icon = choice.icon
            const isAdding = adding === choice.appType

            return (
              <button
                key={choice.appType}
                type="button"
                onClick={() => void handleAdd(choice.appType)}
                disabled={adding !== null}
                className={cn(
                  'bg-background flex h-28 flex-col items-center justify-center gap-3 rounded-lg border transition-colors',
                  'hover:border-foreground/40',
                  'disabled:cursor-wait disabled:opacity-60',
                )}
              >
                {isAdding ? (
                  <Loader2 className="text-muted-foreground size-6 animate-spin" />
                ) : (
                  <Icon className="size-6" />
                )}
                <span className="font-medium">{choice.label}</span>
              </button>
            )
          })}
        </div>

        {addError && <p className="text-destructive text-sm">{addError}</p>}
      </DialogContent>
    </Dialog>
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
