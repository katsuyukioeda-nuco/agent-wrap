import { useState } from 'react'
import {
  Check,
  Code2,
  Copy,
  Loader2,
  TerminalSquare,
} from 'lucide-react'
import type { ConnectedAppDetail } from '../../shared/agents'
import { Button } from '@/components/ui/button'
import { appTypeLabels, mcpUrl } from '@/lib/app'

export default function ConnectScreen({
  detail,
}: {
  detail: ConnectedAppDetail
}) {
  const [copied, setCopied] = useState<'action' | 'url' | null>(null)
  const url = mcpUrl(window.location.origin, detail.app.id)
  const appTypeLabel = appTypeLabels[detail.app.appType]
  const Icon = detail.app.appType === 'codex' ? Code2 : TerminalSquare

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
      ? '下のボタンでプロンプトをコピーして、Codex にそのまま貼り付けてね。つながったら、この画面は自動で切り替わるよ。'
      : 'OpenCode を起動するだけでOK。起動したら自動でつながるよ。'

  const steps =
    detail.app.appType === 'codex'
      ? 'コピー → Codex に貼り付け → 待つだけ'
      : '起動 → 待つだけ'

  const actionLabel =
    detail.app.appType === 'codex'
      ? 'プロンプトをコピー'
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
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center py-8 text-center">
      <div className="bg-secondary flex size-14 items-center justify-center rounded-2xl">
        <Icon className="size-7" />
      </div>

      <h1 className="mt-5 text-2xl font-bold tracking-tight">
        {appTypeLabel} とつなごう
      </h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
        {description}
      </p>

      <Button
        size="lg"
        className="mt-6 w-full"
        onClick={() => void handleCopy('action', actionText)}
      >
        {copied === 'action' ? <Check /> : <Copy />}
        {copied === 'action' ? 'コピーしたよ' : actionLabel}
      </Button>

      <p className="text-muted-foreground mt-3 text-xs">{steps}</p>

      <div className="text-muted-foreground mt-6 flex items-center gap-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        つながるのを待ってるよ…
      </div>

      <div className="border-border mt-8 flex w-full flex-col gap-2 border-t pt-4 text-left">
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs select-none">
            プロンプトの中身を見る
          </summary>
          <pre className="bg-muted mt-2 rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {prompt}
          </pre>
        </details>

        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs select-none">
            MCP URL を見る
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
      </div>
    </div>
  )
}
