import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2, RefreshCw, Save, Trash2, Unplug } from 'lucide-react'
import type { AgentTestResult, ConnectedAppDetail } from '../../shared/agents'
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
import { useApp } from '@/hooks/use-app'
import { api } from '@/lib/api'
import { providerLabels } from '@/lib/app'

const selectClassName =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function SettingsScreen() {
  const { detail, refresh } = useApp()
  const navigate = useNavigate()

  const [name, setName] = useState(detail.app.name)
  const [workingDir, setWorkingDir] = useState(detail.app.workingDir)
  const [model, setModel] = useState(detail.app.model ?? '')
  const [codexBinary, setCodexBinary] = useState(detail.codex?.binary ?? 'codex')
  const [sandbox, setSandbox] = useState<'read-only' | 'workspace-write' | 'danger-full-access'>(
    detail.codex?.sandbox ?? 'workspace-write',
  )
  const [approvalPolicy, setApprovalPolicy] = useState<'never' | 'on-request' | 'untrusted'>(
    detail.codex?.approvalPolicy ?? 'never',
  )
  const [opencodeBinary, setOpencodeBinary] = useState(
    detail.opencode?.binary ?? 'opencode',
  )
  const [port, setPort] = useState(String(detail.opencode?.port ?? 0))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<AgentTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(detail.app.name)
    setWorkingDir(detail.app.workingDir)
    setModel(detail.app.model ?? '')
    setCodexBinary(detail.codex?.binary ?? 'codex')
    setSandbox(detail.codex?.sandbox ?? 'workspace-write')
    setApprovalPolicy(detail.codex?.approvalPolicy ?? 'never')
    setOpencodeBinary(detail.opencode?.binary ?? 'opencode')
    setPort(String(detail.opencode?.port ?? 0))
  }, [detail])

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    setSaved(false)

    const parsedPort = Number(port)
    if (
      detail.app.provider === 'opencode' &&
      (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535)
    ) {
      setError('ポートは 0〜65535 の整数で指定してください。')
      return
    }

    setSaving(true)

    try {
      await api<ConnectedAppDetail>(`/apps/${detail.app.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          workingDir: workingDir.trim(),
          model: model.trim() || null,
          ...(detail.app.provider === 'codex'
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
      await refresh()
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true)
    setTest(null)
    try {
      setTest(await api<AgentTestResult>(`/apps/${detail.app.id}/test`, { method: 'POST' }))
    } catch (testError) {
      setTest({
        ok: false,
        provider: detail.app.provider,
        message: testError instanceof Error ? testError.message : String(testError),
      })
    } finally {
      setTesting(false)
    }
  }

  async function handleDelete(): Promise<void> {
    const confirmed = window.confirm(
      `「${detail.app.name}」を削除します。接続設定も削除されます。よろしいですか？`,
    )
    if (!confirmed) {
      return
    }

    try {
      await api<void>(`/apps/${detail.app.id}`, { method: 'DELETE' })
      navigate('/')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">設定</h1>
          <Badge variant="secondary">{providerLabels[detail.app.provider]}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => void handleTest()} disabled={testing}>
          {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          接続テスト
        </Button>
      </header>

      {test && (
        <div className="flex items-center gap-2 text-sm">
          <Badge
            variant={test.ok ? 'secondary' : 'destructive'}
            className={
              test.ok
                ? 'border-emerald-600/30 bg-emerald-500/10 text-emerald-700'
                : undefined
            }
          >
            {test.ok ? <Check /> : <Unplug />}
            {test.message}
          </Badge>
          {test.version && (
            <span className="text-muted-foreground font-mono text-xs">{test.version}</span>
          )}
        </div>
      )}

      <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
        <Card>
          <CardHeader>
            <CardTitle>基本設定</CardTitle>
            <CardDescription>プロバイダーは変更できません。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="アプリ名" htmlFor="settings-name">
              <Input
                id="settings-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={255}
                required
              />
            </Field>
            <Field label="作業ディレクトリ" htmlFor="settings-working-dir">
              <Input
                id="settings-working-dir"
                value={workingDir}
                onChange={(event) => setWorkingDir(event.target.value)}
                className="font-mono text-sm"
                required
              />
            </Field>
            <Field label="モデル（任意）" htmlFor="settings-model">
              <Input
                id="settings-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="デフォルト"
                maxLength={255}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{providerLabels[detail.app.provider]} 設定</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {detail.app.provider === 'codex' ? (
              <>
                <Field label="codex バイナリ" htmlFor="settings-codex-binary">
                  <Input
                    id="settings-codex-binary"
                    value={codexBinary}
                    onChange={(event) => setCodexBinary(event.target.value)}
                    className="font-mono text-sm"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Sandbox" htmlFor="settings-sandbox">
                    <select
                      id="settings-sandbox"
                      className={selectClassName}
                      value={sandbox}
                      onChange={(event) =>
                        setSandbox(event.target.value as typeof sandbox)
                      }
                    >
                      <option value="read-only">read-only</option>
                      <option value="workspace-write">workspace-write</option>
                      <option value="danger-full-access">danger-full-access</option>
                    </select>
                  </Field>
                  <Field label="Approval policy" htmlFor="settings-approval">
                    <select
                      id="settings-approval"
                      className={selectClassName}
                      value={approvalPolicy}
                      onChange={(event) =>
                        setApprovalPolicy(event.target.value as typeof approvalPolicy)
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
                <Field label="opencode バイナリ" htmlFor="settings-opencode-binary">
                  <Input
                    id="settings-opencode-binary"
                    value={opencodeBinary}
                    onChange={(event) => setOpencodeBinary(event.target.value)}
                    className="font-mono text-sm"
                  />
                </Field>
                <Field label="ポート（0 = 自動）" htmlFor="settings-port">
                  <Input
                    id="settings-port"
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
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? '保存中…' : '保存'}
          </Button>
          {saved && (
            <span className="text-muted-foreground flex items-center gap-1 text-sm">
              <Check className="size-4 text-emerald-600" />
              保存しました
            </span>
          )}
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>メタデータ</CardTitle>
          <CardDescription>API と DB に保存されている値です。</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">App ID</dt>
            <dd className="font-mono text-xs break-all">{detail.app.id}</dd>
            <dt className="text-muted-foreground">Provider</dt>
            <dd>{detail.app.provider}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{formatDate(detail.app.createdAt)}</dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd>{formatDate(detail.app.updatedAt)}</dd>
            {detail.codex && (
              <>
                <dt className="text-muted-foreground">Codex config ID</dt>
                <dd className="font-mono text-xs break-all">{detail.codex.id}</dd>
              </>
            )}
            {detail.opencode && (
              <>
                <dt className="text-muted-foreground">OpenCode config ID</dt>
                <dd className="font-mono text-xs break-all">{detail.opencode.id}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            この Connected App とプロバイダー設定を削除します。実行中のエージェントは停止します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => void handleDelete()}>
            <Trash2 />
            アプリを削除
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}
