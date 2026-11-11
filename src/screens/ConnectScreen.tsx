import { useState, type ReactNode } from 'react'
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
import { cn } from '@/lib/utils'

type StepState = 'done' | 'active' | 'pending'

export default function ConnectScreen({
  detail,
}: {
  detail: ConnectedAppDetail
}) {
  const [actionCopied, setActionCopied] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)

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

  const actionLabel =
    detail.app.appType === 'codex'
      ? 'プロンプトをコピー'
      : '起動コマンドをコピー'

  async function handleCopyAction(): Promise<void> {
    try {
      await navigator.clipboard.writeText(actionText)
      setActionCopied(true)
    } catch {
      setActionCopied(false)
    }
  }

  async function handleCopyUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      setUrlCopied(true)
      window.setTimeout(() => setUrlCopied(false), 1500)
    } catch {
      setUrlCopied(false)
    }
  }

  const stepOneState: StepState = actionCopied ? 'done' : 'active'
  const stepTwoState: StepState = actionCopied ? 'active' : 'pending'

  return (
    <div className="mx-auto w-full max-w-lg py-10">
      <div className="flex flex-col items-center text-center">
        <div className="bg-secondary flex size-14 items-center justify-center rounded-2xl">
          <Icon className="size-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          {appTypeLabel} に接続
        </h1>
      </div>

      <div className="mt-10">
        <Step
          index={1}
          total={detail.app.appType === 'codex' ? 3 : 2}
          title="コピー"
          state={stepOneState}
        >
          {actionCopied ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Check className="size-4 text-emerald-600" />
              コピー済み
              <Button variant="link" size="sm" onClick={() => void handleCopyAction()}>
                もう一度コピー
              </Button>
            </div>
          ) : (
            <Button size="lg" onClick={() => void handleCopyAction()}>
              <Copy />
              {actionLabel}
            </Button>
          )}
        </Step>

        {detail.app.appType === 'codex' ? (
          <>
            <Step
              index={2}
              total={3}
              title="Codex に貼り付ける"
              state={stepTwoState}
            />
            <Step
              index={3}
              total={3}
              title="接続を待つ"
              state={actionCopied ? 'active' : 'pending'}
            >
              {actionCopied && <Waiting />}
            </Step>
          </>
        ) : (
          <Step
            index={2}
            total={2}
            title="接続を待つ"
            state={stepTwoState}
          >
            {actionCopied && <Waiting />}
          </Step>
        )}
      </div>

      <div className="border-border mt-8 flex flex-col gap-2 border-t pt-4">
        <details>
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs select-none">
            プロンプトの中身を見る
          </summary>
          <pre className="bg-muted mt-2 rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {prompt}
          </pre>
        </details>

        <details>
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
              onClick={() => void handleCopyUrl()}
            >
              {urlCopied ? <Check /> : <Copy />}
            </Button>
          </div>
        </details>
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

function Waiting() {
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-sm">
      <Loader2 className="size-4 animate-spin" />
      接続を待っています…
    </div>
  )
}
