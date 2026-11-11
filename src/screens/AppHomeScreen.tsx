import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/hooks/use-app'
import { api } from '@/lib/api'
import { appTypeLabels, mcpUrl } from '@/lib/app'

export default function AppHomeScreen() {
  const { detail } = useApp()
  const [copied, setCopied] = useState(false)
  const [repoDir, setRepoDir] = useState<string | null>(null)

  const url = mcpUrl(window.location.origin, detail.app.id)
  const appType = appTypeLabels[detail.app.appType]
  const webUrl = `${window.location.origin}/${detail.app.id}/`

  useEffect(() => {
    let cancelled = false

    void api<{ repoDir: string }>('/environment')
      .then((environment) => {
        if (!cancelled) {
          setRepoDir(environment.repoDir)
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  const prompt = `このリポジトリで Connected App の Web UI を開発します。

## 前提
- あなたはこのリポジトリを編集できるコーディングエージェントです。
- 作業ディレクトリ: ${repoDir ?? '（このリポジトリ）'}
- Web UI: ${webUrl}
- ファイル編集と npm コマンドの実行ができる必要があります。

## このアプリ
- appId: ${detail.app.id}
- appType: ${detail.app.appType}
- MCP URL: ${url}

## リポジトリの要点
- トップ画面: src/screens/AppHomeScreen.tsx
- 画面追加: src/screens/ にコンポーネントを作り、src/App.tsx の /:appId 配下にルートを追加
- アプリ共通レイアウト: src/pages/AppWorkspacePage.tsx
- Connected App の取得: useApp() で detail.app / detail.codex / detail.opencode
- API: server/routes/ に Hono ルートを追加し、server/app.ts でマウント
- MCP ツール: server/mcp/tools.ts に registerTool で追加
- DB: schema.ts に型、db/migrations/*.sql に DDL を追加（Prisma 不使用）
- UI: React + shadcn/ui + Tailwind CSS
- 確認: npm run typecheck / npm run build

## 依頼
まずこの構成を確認してください。次に、この ${appType} アプリで作りたい画面や機能を一緒に決めて実装してください。`

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">開発プロンプト</h2>
        <p className="text-muted-foreground text-sm">
          エージェントに貼り付けると、このリポジトリの構成を踏まえて開発を進められます。
        </p>
      </div>

      <div className="bg-muted overflow-hidden rounded-md border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium">プロンプト</span>
          <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'コピーしました' : 'コピー'}
          </Button>
        </div>
        <pre className="max-h-80 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {prompt}
        </pre>
      </div>

      <p className="text-muted-foreground font-mono text-xs">
        src/screens/AppHomeScreen.tsx
      </p>
    </div>
  )
}
