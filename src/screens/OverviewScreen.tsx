import { useEffect, useState } from 'react'
import { Check, Copy, Plug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useApp } from '@/hooks/use-app'
import { api } from '@/lib/api'
import { mcpUrl, providerLabels } from '@/lib/app'

interface PublicConfig {
  workingDir: string
  mcpOrigin: string
}

export default function OverviewScreen() {
  const { detail } = useApp()
  const [mcpOrigin, setMcpOrigin] = useState(window.location.origin)
  const [copied, setCopied] = useState<'url' | 'prompt' | null>(null)

  useEffect(() => {
    let cancelled = false

    void api<PublicConfig>('/config')
      .then((config) => {
        if (!cancelled) {
          setMcpOrigin(config.mcpOrigin)
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  const url = mcpUrl(mcpOrigin, detail.app.id)
  const serverName = `agent-wrap-${detail.app.id.slice(0, 8)}`
  const provider = providerLabels[detail.app.provider]

  const prompt =
    detail.app.provider === 'codex'
      ? `次のMCPサーバーをCodexに追加してください。

codex mcp add ${serverName} --url "${url}"

追加後に \`codex mcp list\` で ${serverName} が表示されることを確認してください。`
      : `次のMCPサーバーをOpenCodeに追加してください。

OpenCode の設定ファイル（opencode.json / opencode.jsonc）の mcp.servers に以下を追加してください。

"${serverName}": {
  "type": "remote",
  "url": "${url}"
}

追加後に OpenCode を再起動し、MCPサーバー ${serverName} が接続されることを確認してください。`

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
        <CardTitle className="flex items-center gap-2">
          <Plug className="size-4" />
          MCP
        </CardTitle>
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
              {provider} に貼り付けるプロンプト
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
