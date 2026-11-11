import { useState } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import type { ConnectedAppDetail } from '../../shared/agents'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { appTypeLabels, mcpUrl } from '@/lib/app'

export default function ConnectScreen({
  detail,
}: {
  detail: ConnectedAppDetail
}) {
  const [copied, setCopied] = useState<'action' | 'url' | null>(null)
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

  const actionText =
    detail.app.appType === 'codex'
      ? prompt
      : `${detail.opencode?.binary ?? 'opencode'} serve --service`

  const description =
    detail.app.appType === 'codex'
      ? '下のプロンプトをコピーして Codex に貼り付けてください。接続が完了すると、この画面は自動でアプリ画面に切り替わります。'
      : 'OpenCode を起動してください。起動すると自動で接続され、この画面はアプリ画面に切り替わります。'

  const steps =
    detail.app.appType === 'codex'
      ? ['プロンプトをコピー', 'Codex に貼り付ける', '接続を待つ']
      : ['OpenCode を起動', '接続を待つ']

  const actionLabel =
    detail.app.appType === 'codex'
      ? '接続プロンプトをコピー'
      : '起動コマンドをコピー'

  async function handleCopy(kind: 'action' | 'url', value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">{appTypeLabel} に接続</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => void handleCopy('action', actionText)}
          >
            {copied === 'action' ? <Check /> : <Copy />}
            {copied === 'action' ? 'コピーしました' : actionLabel}
          </Button>

          <ol className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {steps.map((step, index) => (
              <li key={step} className="flex items-center gap-1.5">
                <span className="bg-muted text-foreground flex size-4 items-center justify-center rounded-full text-[10px] font-medium">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm select-none">
            プロンプトの内容を確認
          </summary>
          <pre className="bg-muted mt-2 rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {prompt}
          </pre>
        </details>

        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm select-none">
            MCP URL を確認
          </summary>
          <div className="bg-muted mt-2 flex items-center gap-2 rounded-md p-2">
            <code className="min-w-0 flex-1 px-1 font-mono text-xs break-all">
              {url}
            </code>
            <Button
              variant="ghost"
              size="icon"
              aria-label="MCP URL をコピー"
              onClick={() => void handleCopy('url', url)}
            >
              {copied === 'url' ? <Check /> : <Copy />}
            </Button>
          </div>
        </details>

        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          接続を待っています
        </div>
      </CardContent>
    </Card>
  )
}
