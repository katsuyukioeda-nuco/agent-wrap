import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { ConnectedAppDetail } from '../../shared/agents'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { mcpUrl, appTypeLabels } from '@/lib/app'

export default function ConnectScreen({
  detail,
}: {
  detail: ConnectedAppDetail
}) {
  const [copied, setCopied] = useState<'url' | 'prompt' | null>(null)
  const url = mcpUrl(window.location.origin, detail.app.id)
  const appTypeLabel = appTypeLabels[detail.app.appType]

  const prompt =
    detail.app.appType === 'codex'
      ? `このアプリに接続してください。

MCP サーバー: ${url}

- Codex AppServer が起動している場合は、その WebSocket URL を使ってください。
- 起動していない場合は Codex AppServer を起動し、その WebSocket URL を使ってください。
- MCP サーバーをまだ追加していない場合だけ追加してください。追加済みならスキップしてください。
- MCP ツール connect_codex_app_server に、使用する Codex AppServer の URL を渡してください。

接続するとこの画面は自動的に切り替わります。`
      : `OpenCode を起動してください。

OpenCode アプリを起動するか、次のコマンドでサーバーを起動します。

${detail.opencode?.binary ?? 'opencode'} serve --service

起動すると自動的に接続されます。`

  async function handleCopy(kind: 'url' | 'prompt', value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{appTypeLabel} に接続</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">MCP URL</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleCopy('url', url)}
            >
              {copied === 'url' ? <Check /> : <Copy />}
              コピー
            </Button>
          </div>
          <div className="bg-muted rounded-md p-3">
            <code className="font-mono text-xs break-all">{url}</code>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">
              {appTypeLabel} に貼り付けるプロンプト
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleCopy('prompt', prompt)}
            >
              {copied === 'prompt' ? <Check /> : <Copy />}
              コピー
            </Button>
          </div>
          <pre className="bg-muted rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {prompt}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}
