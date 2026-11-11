import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Code2,
  Loader2,
  MessageSquare,
  Plug,
  Plus,
  TerminalSquare,
  Trash2,
} from 'lucide-react'
import type { AgentProvider, ConnectedApp } from '../../schema'
import type { ConnectedAppDetail } from '../../shared/agents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { api } from '@/lib/api'
import { providerLabels } from '@/lib/app'

const providerCards: Array<{
  provider: AgentProvider
  icon: typeof Code2
  title: string
  description: string
}> = [
  {
    provider: 'codex',
    icon: Code2,
    title: 'Codex',
    description:
      'codex app-server に接続します。Codex の認証・スレッドをそのまま使えます。',
  },
  {
    provider: 'opencode',
    icon: TerminalSquare,
    title: 'OpenCode',
    description:
      '起動中の認証済み OpenCode サーバーに接続します。見つからなければ自動で起動します。',
  },
]

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function AppsPage() {
  const navigate = useNavigate()
  const [apps, setApps] = useState<ConnectedApp[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<AgentProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const list = await api<ConnectedApp[]>('/apps')
        if (!cancelled) {
          setApps(list)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
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

  async function handleCreate(provider: AgentProvider): Promise<void> {
    setCreating(provider)
    setError(null)

    try {
      const detail = await api<ConnectedAppDetail>('/apps', {
        method: 'POST',
        body: JSON.stringify({ provider }),
      })
      navigate(`/${detail.app.id}/`)
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : String(createError),
      )
    } finally {
      setCreating(null)
    }
  }

  async function handleDelete(app: ConnectedApp): Promise<void> {
    const confirmed = window.confirm(`「${app.name}」を削除しますか？`)
    if (!confirmed) {
      return
    }

    try {
      await api<void>(`/apps/${app.id}`, { method: 'DELETE' })
      setApps((current) => current.filter((item) => item.id !== app.id))
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : String(deleteError),
      )
    }
  }

  return (
    <div className="bg-muted/30 min-h-screen">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-10 sm:py-14">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Bot className="size-6" />
            <span className="text-lg font-semibold tracking-tight">agent-wrap</span>
          </Link>
        </header>

        <section className="mt-16 max-w-2xl">
          <Badge variant="secondary">AI Agent App Wrapper</Badge>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            エージェントのハーネスに、
            <br />
            あなたの画面を。
          </h1>
          <p className="text-muted-foreground mt-5 text-base leading-relaxed">
            Codex または OpenCode を選ぶと、このリポジトリを作業ディレクトリとして
            Connected App が作成されます。あとはソースを直接編集して、自分だけの
            画面と MCP ツールを作り込むだけです。
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">アプリを追加</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            接続するアプリを選んでください。認証や作業ディレクトリの設定は不要です。
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {providerCards.map((card) => {
              const Icon = card.icon
              const isCreating = creating === card.provider
              return (
                <button
                  key={card.provider}
                  type="button"
                  onClick={() => void handleCreate(card.provider)}
                  disabled={creating !== null}
                  className="text-left disabled:cursor-wait"
                >
                  <Card className="hover:border-foreground/30 h-full transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="bg-secondary flex size-10 items-center justify-center rounded-lg">
                          <Icon className="size-5" />
                        </div>
                        {isCreating ? (
                          <Loader2 className="text-muted-foreground size-4 animate-spin" />
                        ) : (
                          <Plus className="text-muted-foreground size-4" />
                        )}
                      </div>
                      <CardTitle className="mt-2">{card.title}</CardTitle>
                      <CardDescription className="leading-relaxed">
                        {card.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </button>
              )
            })}
          </div>

          {error && <p className="text-destructive mt-4 text-sm">{error}</p>}
        </section>

        <section className="mt-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Connected Apps</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                作成済みのアプリは {apps.length} 件です。
              </p>
            </div>
          </div>

          {loading ? (
            <p className="text-muted-foreground mt-4 text-sm">読み込み中…</p>
          ) : apps.length === 0 ? (
            <Card className="mt-4 border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <Plug className="text-muted-foreground size-6" />
                <p className="font-medium">まだ Connected App がありません</p>
                <p className="text-muted-foreground max-w-md text-sm">
                  上の Codex / OpenCode から追加してください。作成後すぐに
                  アプリ専用のトップページが開きます。
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {apps.map((app) => (
                <Card key={app.id} className="group relative h-full">
                  <Link to={`/${app.id}/`} className="block h-full">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3 pr-10">
                        <CardTitle className="break-words">{app.name}</CardTitle>
                        <ArrowRight className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <CardDescription className="font-mono text-xs break-all">
                        {app.workingDir}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-muted-foreground flex flex-col gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {providerLabels[app.provider]}
                        </Badge>
                        <span>作成: {formatDate(app.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-3 pt-1">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="size-3.5" />
                          Chat
                        </span>
                        <span className="flex items-center gap-1">
                          <Plug className="size-3.5" />
                          MCP
                        </span>
                        <span className="flex items-center gap-1">
                          <ArrowRight className="size-3.5" />
                          トップページ
                        </span>
                      </div>
                    </CardContent>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${app.name} を削除`}
                    className="text-muted-foreground hover:text-destructive absolute top-3 right-3"
                    onClick={() => void handleDelete(app)}
                  >
                    <Trash2 />
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
