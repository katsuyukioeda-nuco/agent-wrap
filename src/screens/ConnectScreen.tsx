import { useState, type ReactNode } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import type { ConnectedAppDetail, ConnectionStatus } from '../../shared/agents'
import { Button } from '@/components/ui/button'
import { appTypeLabels, mcpUrl } from '@/lib/app'
import { cn } from '@/lib/utils'

type StepState = 'done' | 'active' | 'pending'

export default function ConnectScreen({
  detail,
  status,
  onRefresh,
}: {
  detail: ConnectedAppDetail
  status?: ConnectionStatus | null
  onRefresh?: () => void
}) {
  const [copied, setCopied] = useState(false)

  const url = mcpUrl(window.location.origin, detail.app.id)
  const appTypeLabel = appTypeLabels[detail.app.appType]
  const isClaude = detail.app.appType === 'claude'
  const claudeMissing = isClaude && status?.installed === false

  const prompt =
    detail.app.appType === 'codex'
      ? `このアプリに接続してください。

MCP サーバー: ${url}

- Codex AppServer が起動している場合は、その WebSocket URL を使ってください。
- 起動していない場合は Codex AppServer を起動し、その WebSocket URL を使ってください。
- MCP サーバーをまだ追加していない場合だけ追加してください。追加済みならスキップしてください。
- MCP ツール connect_codex_app_server に、使用する Codex AppServer の URL を渡してください。`
      : detail.app.appType === 'claude'
        ? `このアプリに接続してください。

MCP サーバー: ${url}

- MCP サーバーをまだ追加していない場合だけ追加してください。追加済みならスキップしてください。`
        : `${detail.opencode?.binary ?? 'opencode'} serve --service`

  const codeLabel =
    detail.app.appType === 'opencode' ? 'コマンド' : 'プロンプト'
  const stepTitle =
    detail.app.appType === 'codex'
      ? '以下のプロンプトをCodexに貼り付けます'
      : detail.app.appType === 'claude'
        ? '以下のプロンプトをClaudeに貼り付けます'
        : '以下のコマンドでOpenCodeを起動します'

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <h1 className="text-lg font-semibold tracking-tight">
        以下の手順で{appTypeLabel}に接続します。
      </h1>

      {claudeMissing && (
        <p className="border-destructive/40 text-destructive mt-3 rounded-md border px-3 py-2 text-xs leading-relaxed">
          Claude Code の実行ファイルが見つかりません。インストールしてから、この画面を再読み込みしてください。
        </p>
      )}

      <div className="mt-6">
        <Step
          index={1}
          total={2}
          title={stepTitle}
          state={copied ? 'done' : 'active'}
        >
          <div className="bg-muted mt-3 overflow-hidden rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-medium">{codeLabel}</span>
              <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'コピーしました' : 'コピー'}
              </Button>
            </div>
            <pre className="max-h-56 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {prompt}
            </pre>
          </div>
        </Step>

        <Step
          index={2}
          total={2}
          title="接続を待つ"
          state={copied ? 'active' : 'pending'}
        >
          {copied && (
            <div className="space-y-2">
              {claudeMissing ? (
                <p className="text-muted-foreground text-sm">
                  Claude Code が見つからないため、接続状態を確認できません。
                </p>
              ) : (
                <Waiting label="接続を待っています…" />
              )}
              <p className="text-muted-foreground text-xs leading-relaxed">
                接続できると自動で進みます。反映されない場合は再確認してください。
              </p>
              {onRefresh && (
                <Button variant="outline" size="sm" onClick={onRefresh}>
                  再確認
                </Button>
              )}
            </div>
          )}
        </Step>
      </div>
    </div>
  )
}

function Step({
  index,
  total,
  title,
  state,
  children,
}: {
  index: number
  total: number
  title: string
  state: StepState
  children?: ReactNode
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
            state === 'done' && 'border-emerald-600 bg-emerald-600 text-white',
            state === 'active' && 'border-foreground bg-foreground text-background',
            state === 'pending' && 'border-border text-muted-foreground',
          )}
        >
          {state === 'done' ? <Check className="size-4" /> : index}
        </div>
        {index < total && (
          <div
            className={cn(
              'my-2 w-px flex-1',
              state === 'done' ? 'bg-emerald-600/40' : 'bg-border',
            )}
          />
        )}
      </div>

      <div className={cn('min-w-0 flex-1 pb-8', state === 'pending' && 'opacity-45')}>
        <p className="font-medium">{title}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  )
}

function Waiting({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-sm">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  )
}
