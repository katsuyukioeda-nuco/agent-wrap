import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bot,
  Code2,
  LayoutDashboard,
  ListTodo,
  Loader2,
  MessageSquare,
  Plug,
  Plus,
  TerminalSquare,
} from 'lucide-react'
import type { ConnectedApp } from '../../schema'
import type { ConnectedAppDetail } from '../../shared/agents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { providerLabels } from '@/lib/app'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '', label: 'トップ', icon: LayoutDashboard, end: true },
  { to: 'chat', label: 'Chat', icon: MessageSquare },
  { to: 'mcp-servers', label: 'MCP', icon: Plug },
  { to: 'todos', label: 'Todo Demo', icon: ListTodo },
]

export default function AppWorkspacePage() {
  const { appId } = useParams<{ appId: string }>()
  const [detail, setDetail] = useState<ConnectedAppDetail | null>(null)
  const [apps, setApps] = useState<ConnectedApp[]>([])
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
      setDetail(next)
      setApps(list)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

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
              Connected Apps へ戻る
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const base = `/${appId}/`

  return (
    <div className="bg-muted/30 min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl gap-4 px-4 py-6 lg:gap-6 lg:py-10">
        <aside className="hidden w-14 shrink-0 flex-col items-center gap-2 lg:flex">
          {apps.map((app) => (
            <AppRailIcon key={app.id} app={app} active={app.id === appId} />
          ))}
          <div className="bg-border my-1 h-px w-8" />
          <Link
            to="/"
            title="接続先を選ぶ"
            aria-label="接続先を選ぶ"
            className="border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground flex size-11 items-center justify-center rounded-xl border border-dashed transition-colors"
          >
            <Plus className="size-5" />
          </Link>
        </aside>

        <aside className="hidden w-56 shrink-0 flex-col lg:flex">
          <Link to="/" className="flex items-center gap-2">
            <Bot className="size-5" />
            <span className="font-semibold tracking-tight">agent-wrap</span>
          </Link>

          <div className="mt-8">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
              Connected App
            </p>
            <p className="mt-1 font-semibold break-words">{detail.app.name}</p>
            <Badge variant="secondary" className="mt-2">
              {providerLabels[detail.app.provider]}
            </Badge>
          </div>

          <nav className="mt-7 flex flex-col gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.label}
                  to={item.to ? `${base}${item.to}` : base}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
                    )
                  }
                >
                  <Icon className="size-4" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>

          <div className="text-muted-foreground mt-auto flex flex-col gap-1 text-[11px]">
            <span>Working directory</span>
            <span className="font-mono break-all">{detail.app.workingDir}</span>
            <span className="mt-2 font-mono break-all">/{appId}/mcp</span>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-col gap-3 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link to="/" className="flex items-center gap-2">
                <Bot className="size-5" />
                <span className="font-semibold">agent-wrap</span>
              </Link>
              <Badge variant="secondary">{providerLabels[detail.app.provider]}</Badge>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {apps.map((app) => (
                <AppRailIcon
                  key={app.id}
                  app={app}
                  active={app.id === appId}
                  compact
                />
              ))}
              <Link
                to="/"
                title="接続先を選ぶ"
                aria-label="接続先を選ぶ"
                className="border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg border border-dashed transition-colors"
              >
                <Plus className="size-4" />
              </Link>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{detail.app.name}</span>
              <span className="text-muted-foreground font-mono text-[11px]">
                /{appId}/mcp
              </span>
            </div>
            <nav className="flex gap-1 overflow-x-auto pb-1">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.label}
                    to={item.to ? `${base}${item.to}` : base}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                        isActive
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground',
                      )
                    }
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>
          </div>

          <Outlet context={{ detail, refresh: load }} />
        </div>
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
  const Icon = app.provider === 'codex' ? Code2 : TerminalSquare

  return (
    <Link
      to={`/${app.id}/`}
      title={app.name}
      aria-label={`${app.name} を開く`}
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
