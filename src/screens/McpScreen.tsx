import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Loader2,
  Plug,
  RefreshCw,
  ServerCog,
  Unplug,
} from 'lucide-react'
import type { McpServerSummary } from '../../shared/agents'
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

interface McpResponse {
  url: string
  servers: McpServerSummary[]
  error?: string
}

const statusLabels: Record<McpServerSummary['status'], string> = {
  connected: 'Connected',
  pending: 'Pending',
  failed: 'Failed',
  disabled: 'Disabled',
  'needs-auth': 'Needs auth',
  unknown: 'Unknown',
}

function statusVariant(
  status: McpServerSummary['status'],
): 'secondary' | 'destructive' | 'outline' {
  if (status === 'connected') {
    return 'secondary'
  }
  if (status === 'failed') {
    return 'destructive'
  }
  return 'outline'
}

export default function McpScreen() {
  const { detail } = useApp()
  const [data, setData] = useState<McpResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api<McpResponse>(`/apps/${detail.app.id}/mcp-servers`))
    } catch (error) {
      setData({
        url: mcpUrl(window.location.origin, detail.app.id),
        servers: [],
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }, [detail.app.id])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCopy() {
    if (!data) {
      return
    }
    try {
      await navigator.clipboard.writeText(data.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const url = data?.url ?? mcpUrl(window.location.origin, detail.app.id)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">MCP</h1>
          <Badge variant="secondary">{providerLabels[detail.app.provider]}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          更新
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ServerCog className="size-4" />
            このアプリの MCP エンドポイント
          </CardTitle>
          <CardDescription>
            Connected App ごとに独立した MCP サーバーです。この URL
            をプロバイダーの MCP 設定に追加してください。
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

          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">公開ツール</p>
            <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
              <li>
                <code className="text-foreground">get_app_info</code> — アプリ名・provider・作業ディレクトリ
              </li>
              <li>
                <code className="text-foreground">list_todos</code> — デモ用 Todo 一覧
              </li>
            </ul>
            <p className="text-muted-foreground text-xs">
              ツールは <code>server/mcp/tools.ts</code> に追加できます。
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-4" />
            プロバイダー側の MCP サーバー
          </CardTitle>
          <CardDescription>
            {detail.app.provider === 'codex'
              ? 'Codex app-server の mcpServerStatus/list から取得した状態です。'
              : 'OpenCode の /api/mcp から取得した状態です。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loading ? (
            <p className="text-muted-foreground text-sm">読み込み中…</p>
          ) : data?.error ? (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
              {data.error}
            </div>
          ) : data && data.servers.length > 0 ? (
            <ul className="divide-y">
              {data.servers.map((server) => (
                <li
                  key={server.name}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {server.status === 'connected' ? (
                      <Plug className="size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Unplug className="text-muted-foreground size-4 shrink-0" />
                    )}
                    <span className="font-mono text-sm">{server.name}</span>
                    {server.detail && (
                      <span className="text-muted-foreground truncate text-xs">
                        {server.detail}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {typeof server.toolCount === 'number' && (
                      <span className="text-muted-foreground text-xs">
                        {server.toolCount} tools
                      </span>
                    )}
                    <Badge variant={statusVariant(server.status)}>
                      {statusLabels[server.status]}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              MCP サーバーは設定されていないか、まだ接続されていません。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
