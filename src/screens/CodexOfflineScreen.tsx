import { useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * 一度接続した Codex AppServer に到達できないときの画面。
 * 初回設定と区別し、データが消えたわけではないことを明示する。
 */
export default function CodexOfflineScreen({
  url,
  onRetry,
}: {
  url: string | null
  onRetry: () => void
}) {
  const [copied, setCopied] = useState(false)

  const command = url
    ? `codex app-server --listen ${url}`
    : 'codex app-server --listen ws://127.0.0.1:4501'

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <section className="rounded-xl border p-6">
        <h1 className="text-lg font-semibold tracking-tight">
          Codex AppServer に接続できません
        </h1>

        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          接続が切れているだけで、会話や設定が消えたわけではありません。
          次のコマンドで AppServer を起動すると、自動で再接続します。
        </p>

        <div className="bg-muted mt-3 overflow-hidden rounded-md border">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-medium">起動コマンド</span>
            <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
              {copied ? <Check /> : <Copy />}
              {copied ? 'コピーしました' : 'コピー'}
            </Button>
          </div>
          <pre className="overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {command}
          </pre>
        </div>

        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          会話一覧は AppServer から取得するため、接続できるまで表示できません。
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onRetry}>
            <RefreshCw />
            再試行
          </Button>
        </div>
      </section>
    </div>
  )
}
