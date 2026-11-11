import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Code2,
  ListTodo,
  MessageSquare,
  Plug,
  Plus,
  TerminalSquare,
} from 'lucide-react'
import type { AgentProvider, ConnectedApp } from '../../schema'
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
  points: string[]
}> = [
  {
    provider: 'codex',
    icon: Code2,
    title: 'Codex',
    description:
      'codex app-server を JSON-RPC (stdio) で起動して接続します。Codex のスレッドとターンをそのまま Web UI に載せられます。',
    points: ['codex app-server を自動起動', 'sandbox / approval policy を設定', 'スレッドを継続'],
  },
  {
    provider: 'opencode',
    icon: TerminalSquare,
    title: 'OpenCode',
    description:
      'opencode serve をローカルで起動し、HTTP API と SSE で接続します。既存のセッションや MCP 設定を利用できます。',
    points: ['opencode serve を自動起動', 'HTTP API + SSE', 'MCP サーバー状態を表示'],
  },
]

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function AppsPage() {
  const [apps, setApps] = useState<ConnectedApp[]>([])
  const [loading, setLoading] = useState(true)
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

  return (
    <div className="bg-muted/30 min-h-screen">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-10 sm:py-14">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Bot className="size-6" />
            <span className="text-lg font-semibold tracking-tight">agent-wrap</span>
          </Link>
          <Button asChild variant="outline">
            <Link to="/new">
              <Plus />
              新しいアプリ
            </Link>
          </Button>
        </header>

        <section className="mt-16 max-w-2xl">
          <Badge variant="secondary">AI Agent App Wrapper</Badge>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            エージェントのハーネスに、
            <br />
            あなたの画面を。
          </h1>
          <p className="text-muted-foreground mt-5 text-base leading-relaxed">
            Codex または OpenCode を選んで Connected App を作成すると、
            そのアプリ専用の URL・MCP エンドポイント・Web UI が立ち上がります。
            画面はこのリポジトリに追加していくだけです。
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/new">
                Connected App を作成
                <ArrowRight />
              </Link>
            </Button>
            {apps.length > 0 && (
              <Button asChild size="lg" variant="outline">
                <Link to={`/${apps[0].id}/`}>最新のアプリを開く</Link>
              </Button>
            )}
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2">
          {providerCards.map((card) => {
            const Icon = card.icon
            return (
              <Link key={card.provider} to={`/new?provider=${card.provider}`}>
                <Card className="hover:border-foreground/30 h-full transition-colors">
                  <CardHeader>
                    <div className="bg-secondary flex size-10 items-center justify-center rounded-lg">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="mt-2">{card.title}</CardTitle>
                    <CardDescription className="leading-relaxed">
                      {card.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-muted-foreground flex flex-col gap-1.5 text-sm">
                      {card.points.map((point) => (
                        <li key={point} className="flex items-center gap-2">
                          <span className="bg-foreground/40 size-1.5 rounded-full" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
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
          ) : error ? (
            <p className="text-destructive mt-4 text-sm">{error}</p>
          ) : apps.length === 0 ? (
            <Card className="mt-4 border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <Plug className="text-muted-foreground size-6" />
                <p className="font-medium">まだ Connected App がありません</p>
                <p className="text-muted-foreground max-w-md text-sm">
                  Codex / OpenCode を選んで最初のアプリを作成してください。
                  作成後にアプリ専用の URL と MCP エンドポイントが発行されます。
                </p>
                <Button asChild className="mt-1">
                  <Link to="/new">作成する</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {apps.map((app) => (
                <Link key={app.id} to={`/${app.id}/`} className="group">
                  <Card className="group-hover:border-foreground/30 h-full transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="break-words">{app.name}</CardTitle>
                        <Badge variant="secondary">{providerLabels[app.provider]}</Badge>
                      </div>
                      <CardDescription className="font-mono text-xs break-all">
                        {app.workingDir}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-muted-foreground flex flex-col gap-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span>{app.model ?? 'デフォルトモデル'}</span>
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <span>作成: {formatDate(app.createdAt)}</span>
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
                          <ListTodo className="size-3.5" />
                          Demo
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
