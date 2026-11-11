import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  Copy,
  ListTodo,
  Loader2,
  MessageSquare,
  Plug,
  RefreshCw,
  Unplug,
} from 'lucide-react'
import type { AgentTestResult } from '../../shared/agents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useApp } from '@/hooks/use-app'
import { api } from '@/lib/api'
import { mcpUrl, providerLabels } from '@/lib/app'
import { providerSettingsSummary } from '@/lib/app-detail'

interface PublicConfig {
  workingDir: string
  mcpOrigin: string
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function OverviewScreen() {
  const { detail } = useApp()
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [test, setTest] = useState<AgentTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false

    void api<PublicConfig>('/config')
      .then((value) => {
        if (!cancelled) {
          setConfig(value)
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  async function handleTest() {
    setTesting(true)
    setTest(null)
    try {
      setTest(await api<AgentTestResult>(`/apps/${detail.app.id}/test`, { method: 'POST' }))
    } catch (error) {
      setTest({
        ok: false,
        provider: detail.app.provider,
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setTesting(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const url = mcpUrl(config?.mcpOrigin ?? window.location.origin, detail.app.id)
  const base = `/${detail.app.id}`

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{detail.app.name}</h1>
          <Badge variant="secondary">{providerLabels[detail.app.provider]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {detail.app.workingDir}
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="size-4" />
              接続
            </CardTitle>
            <CardDescription>
              {providerSettingsSummary(detail)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Provider</dt>
              <dd>{providerLabels[detail.app.provider]}</dd>
              {detail.codex && (
                <>
                  <dt className="text-muted-foreground">Binary</dt>
                  <dd className="font-mono text-xs">{detail.codex.binary}</dd>
                  <dt className="text-muted-foreground">Sandbox</dt>
                  <dd className="font-mono text-xs">{detail.codex.sandbox}</dd>
                  <dt className="text-muted-foreground">Approvals</dt>
                  <dd className="font-mono text-xs">{detail.codex.approvalPolicy}</dd>
                </>
              )}
              {detail.opencode && (
                <>
                  <dt className="text-muted-foreground">Binary</dt>
                  <dd className="font-mono text-xs">{detail.opencode.binary}</dd>
                  <dt className="text-muted-foreground">Port</dt>
                  <dd className="font-mono text-xs">
                    {detail.opencode.port || 'auto'}
                  </dd>
                </>
              )}
            </dl>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => void handleTest()} disabled={testing}>
                {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                接続テスト
              </Button>
              {test && (
                <Badge
                  variant={test.ok ? 'secondary' : 'destructive'}
                  className={
                    test.ok
                      ? 'border-emerald-600/30 bg-emerald-500/10 text-emerald-700'
                      : undefined
                  }
                >
                  {test.ok ? <Check /> : <Unplug />}
                  {test.message}
                </Badge>
              )}
            </div>
            {test?.version && (
              <p className="text-muted-foreground font-mono text-xs">{test.version}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="size-4" />
              MCP エンドポイント
            </CardTitle>
            <CardDescription>
              この Connected App 専用の MCP サーバーです。Codex / OpenCode
              の MCP 設定に追加すると、ここで定義したツールをエージェントから呼べます。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="bg-muted flex items-center gap-2 rounded-md p-2">
              <code className="min-w-0 flex-1 px-1 font-mono text-xs break-all">{url}</code>
              <Button
                variant="ghost"
                size="icon"
                aria-label="MCP URL をコピー"
                onClick={() => void handleCopy()}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              公開ツール: <code>get_app_info</code>, <code>list_todos</code>。
              追加は <code>server/mcp/tools.ts</code> で行います。
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to={`${base}/mcp-servers`}>
                MCP サーバー状態を見る
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <QuickLink
          to={`${base}/chat`}
          icon={<MessageSquare className="size-4" />}
          title="Chat"
          description="エージェントと会話するデモ画面"
        />
        <QuickLink
          to={`${base}/todos`}
          icon={<ListTodo className="size-4" />}
          title="Todo Demo"
          description="DB / API / UI の CRUD サンプル"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>この土台の使い方</CardTitle>
          <CardDescription>
            画面ごとに URL が分かれています。ここから自分専用の画面を追加できます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="text-muted-foreground flex list-decimal flex-col gap-2 pl-4 text-sm">
            <li>
              <code className="text-foreground">src/screens</code> に画面コンポーネントを追加する
            </li>
            <li>
              <code className="text-foreground">src/App.tsx</code> のルートと{' '}
              <code className="text-foreground">src/pages/AppWorkspacePage.tsx</code>{' '}
              のナビゲーションに登録する
            </li>
            <li>
              MCP ツールは <code className="text-foreground">server/mcp/tools.ts</code>{' '}
              に追加する
            </li>
            <li>
              テーブルは <code className="text-foreground">schema.ts</code> と{' '}
              <code className="text-foreground">db/migrations</code> を更新する
            </li>
          </ol>
          <p className="text-muted-foreground mt-4 text-xs">
            作成日: {formatDate(detail.app.createdAt)} / 更新日:{' '}
            {formatDate(detail.app.updatedAt)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function QuickLink({
  to,
  icon,
  title,
  description,
}: {
  to: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link to={to}>
      <Card className="hover:border-foreground/30 h-full transition-colors">
        <CardHeader>
          <div className="bg-secondary flex size-8 items-center justify-center rounded-md">
            {icon}
          </div>
          <CardTitle className="mt-1 text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  )
}
