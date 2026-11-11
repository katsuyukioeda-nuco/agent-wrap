import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bot, Code2, Loader2, TerminalSquare } from 'lucide-react'
import type { AgentProvider } from '../../schema'
import type { ConnectedAppDetail } from '../../shared/agents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface PublicConfig {
  workingDir: string
  mcpOrigin: string
}

const selectClassName =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]'

export default function NewAppPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialProvider: AgentProvider =
    searchParams.get('provider') === 'opencode' ? 'opencode' : 'codex'

  const [provider, setProvider] = useState<AgentProvider>(initialProvider)
  const [name, setName] = useState('')
  const [workingDir, setWorkingDir] = useState('')
  const [model, setModel] = useState('')
  const [codexBinary, setCodexBinary] = useState('codex')
  const [sandbox, setSandbox] = useState<'read-only' | 'workspace-write' | 'danger-full-access'>(
    'workspace-write',
  )
  const [approvalPolicy, setApprovalPolicy] = useState<'never' | 'on-request' | 'untrusted'>(
    'never',
  )
  const [opencodeBinary, setOpencodeBinary] = useState('opencode')
  const [port, setPort] = useState('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      try {
        const config = await api<PublicConfig>('/config')
        if (!cancelled) {
          setWorkingDir(config.workingDir)
        }
      } catch {
        // 入力欄は手動で埋められる。
      }
    }

    void loadConfig()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const trimmedName = name.trim()
    const trimmedDir = workingDir.trim()

    if (!trimmedName || !trimmedDir) {
      setError('名前と作業ディレクトリは必須です。')
      return
    }

    const parsedPort = Number(port)

    if (provider === 'opencode' && (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535)) {
      setError('ポートは 0〜65535 の整数で指定してください。')
      return
    }

    setLoading(true)

    try {
      const detail = await api<ConnectedAppDetail>('/apps', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          provider,
          workingDir: trimmedDir,
          model: model.trim() || null,
          ...(provider === 'codex'
            ? {
                codex: {
                  binary: codexBinary.trim() || 'codex',
                  sandbox,
                  approvalPolicy,
                },
              }
            : {
                opencode: {
                  binary: opencodeBinary.trim() || 'opencode',
                  port: parsedPort,
                },
              }),
        }),
      })

      navigate(`/${detail.app.id}/`)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-muted/30 min-h-screen">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" />
          Connected Apps
        </Link>

        <div className="mt-6 flex items-center gap-2">
          <Bot className="size-6" />
          <span className="text-lg font-semibold tracking-tight">agent-wrap</span>
        </div>

        <h1 className="mt-8 text-3xl font-bold tracking-tight">Connected App を作成</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          AI エージェントのハーネスを選び、このアプリ専用の URL と MCP
          エンドポイントを発行します。
        </p>

        <form className="mt-8 flex flex-col gap-6" onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>プロバイダー</CardTitle>
              <CardDescription>
                後からプロバイダーは変更できません。設定は保存できます。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <ProviderButton
                active={provider === 'codex'}
                icon={<Code2 className="size-5" />}
                title="Codex"
                description="codex app-server / stdio"
                onClick={() => setProvider('codex')}
              />
              <ProviderButton
                active={provider === 'opencode'}
                icon={<TerminalSquare className="size-5" />}
                title="OpenCode"
                description="opencode serve / HTTP + SSE"
                onClick={() => setProvider('opencode')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>基本設定</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field label="アプリ名" htmlFor="name">
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="My Agent App"
                  maxLength={255}
                  required
                />
              </Field>

              <Field
                label="作業ディレクトリ"
                htmlFor="workingDir"
                hint="エージェントが操作する既存のディレクトリ。"
              >
                <Input
                  id="workingDir"
                  value={workingDir}
                  onChange={(event) => setWorkingDir(event.target.value)}
                  placeholder="/path/to/workdir"
                  className="font-mono text-sm"
                  required
                />
              </Field>

              <Field
                label="モデル（任意）"
                htmlFor="model"
                hint="空の場合はプロバイダーのデフォルトを使用します。"
              >
                <Input
                  id="model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="例: gpt-6.1-terra"
                  maxLength={255}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{provider === 'codex' ? 'Codex 設定' : 'OpenCode 設定'}</CardTitle>
              <CardDescription>
                {provider === 'codex'
                  ? 'app-server の起動方法とサンドボックスを指定します。'
                  : 'opencode serve の起動方法を指定します。0 は空きポート自動選択です。'}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {provider === 'codex' ? (
                <>
                  <Field label="codex バイナリ" htmlFor="codexBinary">
                    <Input
                      id="codexBinary"
                      value={codexBinary}
                      onChange={(event) => setCodexBinary(event.target.value)}
                      placeholder="codex"
                      className="font-mono text-sm"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Sandbox" htmlFor="sandbox">
                      <select
                        id="sandbox"
                        className={selectClassName}
                        value={sandbox}
                        onChange={(event) =>
                          setSandbox(
                            event.target.value as typeof sandbox,
                          )
                        }
                      >
                        <option value="read-only">read-only</option>
                        <option value="workspace-write">workspace-write</option>
                        <option value="danger-full-access">danger-full-access</option>
                      </select>
                    </Field>
                    <Field label="Approval policy" htmlFor="approvalPolicy">
                      <select
                        id="approvalPolicy"
                        className={selectClassName}
                        value={approvalPolicy}
                        onChange={(event) =>
                          setApprovalPolicy(
                            event.target.value as typeof approvalPolicy,
                          )
                        }
                      >
                        <option value="never">never</option>
                        <option value="on-request">on-request</option>
                        <option value="untrusted">untrusted</option>
                      </select>
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  <Field label="opencode バイナリ" htmlFor="opencodeBinary">
                    <Input
                      id="opencodeBinary"
                      value={opencodeBinary}
                      onChange={(event) => setOpencodeBinary(event.target.value)}
                      placeholder="opencode"
                      className="font-mono text-sm"
                    />
                  </Field>
                  <Field
                    label="ポート"
                    htmlFor="port"
                    hint="0 の場合は空きポートを自動で確保し、127.0.0.1 で起動します。"
                  >
                    <Input
                      id="port"
                      value={port}
                      onChange={(event) => setPort(event.target.value)}
                      inputMode="numeric"
                      className="font-mono text-sm"
                    />
                  </Field>
                </>
              )}
            </CardContent>
          </Card>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {loading ? '作成中…' : '作成する'}
            </Button>
            <Button asChild type="button" variant="ghost">
              <Link to="/">キャンセル</Link>
            </Button>
            <span className="text-muted-foreground ml-auto text-xs">
              MCP: <code>/{'{connected-app-id}'}/mcp</code>
            </span>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProviderButton({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors',
        active
          ? 'border-foreground bg-background shadow-xs'
          : 'hover:border-foreground/30 bg-transparent',
      )}
    >
      <div className="flex w-full items-center justify-between">
        <span className="bg-secondary flex size-9 items-center justify-center rounded-md">
          {icon}
        </span>
        {active && <Badge variant="secondary">選択中</Badge>}
      </div>
      <span className="font-medium">{title}</span>
      <span className="text-muted-foreground text-xs">{description}</span>
    </button>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}
