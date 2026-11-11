import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { useApp } from '@/hooks/use-app'
import { appTypeLabels, mcpUrl } from '@/lib/app'

export default function AppHomeScreen() {
  const { detail } = useApp()
  const [copied, setCopied] = useState(false)
  const url = mcpUrl(window.location.origin, detail.app.id)

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-2 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium">
                {appTypeLabels[detail.app.appType]} 接続済み
              </span>
            </div>
            <span className="text-muted-foreground text-xs">MCP URL</span>
          </div>
          <div className="bg-muted flex items-center gap-2 rounded-md p-2">
            <code className="min-w-0 flex-1 px-1 font-mono text-xs break-all">
              {url}
            </code>
            <Button
              variant="ghost"
              size="icon"
              aria-label="MCP URL をコピー"
              onClick={() => void handleCopy()}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground text-sm">
          ここにアプリの画面を追加してください
        </p>
        <p className="text-muted-foreground mt-3 font-mono text-xs">
          src/screens/AppHomeScreen.tsx
        </p>
      </div>
    </div>
  )
}
