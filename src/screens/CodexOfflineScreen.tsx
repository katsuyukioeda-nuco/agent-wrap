import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { ConnectedAppDetail } from '../../shared/agents'
import { Button } from '@/components/ui/button'
import ConnectScreen from './ConnectScreen'

/**
 * 一度接続した Codex AppServer に到達できないときの画面。
 * 初回設定と区別し、データが消えたわけではないことを明示する。
 */
export default function CodexOfflineScreen({
  detail,
  url,
  onRetry,
}: {
  detail: ConnectedAppDetail
  url: string | null
  onRetry: () => void
}) {
  const [showSteps, setShowSteps] = useState(false)

  if (showSteps) {
    return (
      <ConnectScreen
        detail={detail}
        status={{ connected: false, appType: 'codex', url }}
        onRefresh={onRetry}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <section className="rounded-xl border p-6">
        <h1 className="text-lg font-semibold tracking-tight">
          Codex AppServer に接続できません
        </h1>

        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          接続が切れているだけで、会話や設定が消えたわけではありません。
          AppServer を起動すると自動で再接続します。
        </p>

        {url && (
          <p className="bg-muted text-muted-foreground mt-3 truncate rounded-md border px-2.5 py-1.5 font-mono text-[11px]">
            {url}
          </p>
        )}

        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          会話一覧は AppServer から取得するため、接続できるまで表示できません。
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onRetry}>
            <RefreshCw />
            再試行
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSteps(true)}
          >
            接続手順を表示
          </Button>
        </div>
      </section>
    </div>
  )
}
