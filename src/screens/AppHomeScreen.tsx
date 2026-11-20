import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  GitBranch,
  Loader2,
  MessageSquare,
  RefreshCw,
} from 'lucide-react'
import type {
  ProjectSummary,
  ProjectsResponse,
  RecentSessionsResponse,
  SessionSummary,
  SessionsResponse,
} from '../../shared/agents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useApp } from '@/hooks/use-app'
import { api } from '@/lib/api'
import { mcpUrl } from '@/lib/app'
import { cn } from '@/lib/utils'
import CodexOfflineScreen from './CodexOfflineScreen'

interface SessionState {
  sessions: SessionSummary[]
  loading: boolean
  error: string | null
}

export default function AppHomeScreen() {
  const { detail } = useApp()
  const appId = detail.app.id

  const [searchParams] = useSearchParams()
  const requestedProject = searchParams.get('project')

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)

  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [sessionStates, setSessionStates] = useState<
    Record<string, SessionState>
  >({})
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([])
  const [recentLoading, setRecentLoading] = useState(true)

  const [reloadToken, setReloadToken] = useState(0)
  const [promptCopied, setPromptCopied] = useState(false)
  const inFlight = useRef(new Set<string>())
  const initialized = useRef(false)

  useEffect(() => {
    let cancelled = false
    setProjectsLoading(true)

    api<ProjectsResponse>(`/apps/${appId}/projects`)
      .then((result) => {
        if (cancelled) {
          return
        }
        setProjects(result.projects)
        setSupported(result.supported)
        setProjectsError(result.error ?? null)

        const openFirst = !initialized.current
        setOpenIds((previous) => {
          const valid = [...previous].filter((id) =>
            result.projects.some((project) => project.id === id),
          )

          if (valid.length > 0) {
            return new Set(valid)
          }

          // 初回だけ対象のプロジェクトを開いて会話を見せる。
          if (openFirst) {
            const initial =
              result.projects.find(
                (project) => project.id === requestedProject,
              ) ?? result.projects[0]

            if (initial) {
              return new Set([initial.id])
            }
          }

          return new Set()
        })
        initialized.current = true
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setProjects([])
          setProjectsError(
            loadError instanceof Error ? loadError.message : String(loadError),
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProjectsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [appId, reloadToken, requestedProject])

  useEffect(() => {
    let cancelled = false
    setRecentLoading(true)

    api<RecentSessionsResponse>(`/apps/${appId}/recent-sessions?limit=5`)
      .then((result) => {
        if (!cancelled) {
          setRecentSessions(result.supported ? result.sessions : [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecentSessions([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRecentLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [appId, reloadToken])

  const fetchSessions = useCallback(
    async (projectId: string) => {
      if (inFlight.current.has(projectId)) {
        return
      }
      inFlight.current.add(projectId)

      setSessionStates((previous) => ({
        ...previous,
        [projectId]: {
          sessions: previous[projectId]?.sessions ?? [],
          loading: true,
          error: null,
        },
      }))

      try {
        const result = await api<SessionsResponse>(
          `/apps/${appId}/projects/${encodeURIComponent(projectId)}/sessions`,
        )
        setSessionStates((previous) => ({
          ...previous,
          [projectId]: {
            sessions: result.sessions,
            loading: false,
            error: result.error ?? null,
          },
        }))
        if (!result.supported) {
          setSupported(false)
        }
      } catch (loadError) {
        setSessionStates((previous) => ({
          ...previous,
          [projectId]: {
            sessions: [],
            loading: false,
            error:
              loadError instanceof Error
                ? loadError.message
                : String(loadError),
          },
        }))
      } finally {
        inFlight.current.delete(projectId)
      }
    },
    [appId],
  )

  useEffect(() => {
    for (const projectId of openIds) {
      if (!sessionStates[projectId]) {
        void fetchSessions(projectId)
      }
    }
  }, [openIds, sessionStates, fetchSessions])

  const toggle = useCallback((projectId: string) => {
    setOpenIds((previous) => {
      const next = new Set(previous)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }, [])

  const refresh = useCallback(() => {
    setSessionStates({})
    setReloadToken((token) => token + 1)
  }, [])

  const prompt = useMemo(
    () =>
      `この会話のセッション URL を表示してください。\n\nagent-wrap の MCP サーバー（${mcpUrl(window.location.origin, appId)}）にある reflect ツールを呼び出し、返ってきた session.url をそのまま回答してください。`,
    [appId],
  )

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setPromptCopied(true)
      window.setTimeout(() => setPromptCopied(false), 1500)
    } catch {
      setPromptCopied(false)
    }
  }, [prompt])

  const busy = projectsLoading

  return (
    <div className="space-y-3">
      {detail.app.appType !== 'claude' && (
        <section className="bg-background rounded-xl border p-4 shadow-xs">
          <h1 className="text-sm font-semibold tracking-tight">
            会話を開く
          </h1>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            プロンプトをコピーして会話に貼り付けると、その会話の URL
            が返ってきます。返ってきた URL をブラウザで開いてください。
          </p>

          <Button
            variant="default"
            size="sm"
            className="mt-3 gap-1.5"
            aria-label="会話のURL取得プロンプトをコピー"
            title="会話に貼るプロンプトをコピー"
            onClick={() => void copyPrompt()}
          >
            {promptCopied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {promptCopied ? 'コピーしました' : 'プロンプトをコピー'}
          </Button>

          <pre className="bg-muted/50 text-muted-foreground mt-3 overflow-hidden rounded-lg border px-3 py-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
            {prompt}
          </pre>
        </section>
      )}

      {(recentLoading || recentSessions.length > 0) &&
        detail.app.appType !== 'claude' && (
          <section className="bg-background rounded-xl border">
            <header className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight">
                最近の会話
              </h2>
            </header>

            {recentLoading && recentSessions.length === 0 ? (
              <InlineSpinner />
            ) : (
              <ul className="divide-y">
                {recentSessions.map((session) => {
                  const project = projects.find(
                    (item) => item.id === session.projectId,
                  )

                  return (
                    <li key={session.id}>
                      <Link
                        to={`/${appId}/sessions/${session.id}?project=${encodeURIComponent(session.projectId)}`}
                        className="hover:bg-muted/30 flex items-start gap-2.5 px-4 py-2.5 transition-colors"
                      >
                        <MessageSquare className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm">{session.title}</p>
                            {session.status === 'running' && (
                              <Badge
                                variant="secondary"
                                className="h-5 shrink-0 px-1.5 text-[10px]"
                              >
                                実行中
                              </Badge>
                            )}
                            {session.status === 'error' && (
                              <Badge
                                variant="outline"
                                className="h-5 shrink-0 px-1.5 text-[10px]"
                              >
                                失敗
                              </Badge>
                            )}
                          </div>

                          <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px]">
                            {project && <span>{project.name}</span>}
                            {session.model && (
                              <span className="truncate">{session.model}</span>
                            )}
                            {session.updatedAt && (
                              <span>
                                · {formatRelative(session.updatedAt)}
                              </span>
                            )}
                          </div>
                        </div>

                        <ChevronRight className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

      <section className="bg-background relative flex h-[55vh] max-h-[44rem] min-h-[24rem] w-full flex-col overflow-hidden rounded-xl border border-dashed">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              プロジェクトごとの会話
            </h2>
            {!projectsLoading && (
              <span className="text-muted-foreground text-[11px]">
                {projects.length}
              </span>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="プロジェクトを更新"
            title="更新"
            onClick={refresh}
            disabled={busy || !supported}
          >
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {!supported ? (
          <PaneMessage
            icon={<Folder />}
            title="プロジェクトを表示できません"
            description="Claude Code の Connected App ではプロジェクト一覧に対応していません。"
          />
        ) : projectsLoading ? (
          <PaneSpinner />
        ) : projectsError ? (
          detail.app.appType === 'codex' && /AppServer/i.test(projectsError) ? (
            <CodexOfflineScreen
              url={detail.codex?.appServerUrl ?? null}
              onRetry={refresh}
            />
          ) : (
            <PaneMessage
              icon={<Folder />}
              title="プロジェクトを読み込めませんでした"
              description={projectsError}
              action={
                <Button variant="outline" size="sm" onClick={refresh}>
                  再試行
                </Button>
              }
            />
          )
        ) : projects.length === 0 ? (
          <PaneMessage
            icon={<Folder />}
            title="プロジェクトがありません"
            description="OpenCode や Codex で作業すると、そのディレクトリがここに表示されます。"
          />
        ) : (
          <ul className="divide-y">
            {projects.map((project) => {
              const open = openIds.has(project.id)
              const state = sessionStates[project.id]

              return (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => toggle(project.id)}
                    aria-expanded={open}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors',
                      open ? 'bg-muted/40' : 'hover:bg-muted/40',
                    )}
                  >
                    <ChevronDown
                      className={cn(
                        'text-muted-foreground size-4 shrink-0 transition-transform',
                        !open && '-rotate-90',
                      )}
                    />
                    <Folder className="text-muted-foreground size-4 shrink-0" />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {project.name}
                        </span>
                        {project.vcs && (
                          <Badge
                            variant="outline"
                            className="h-5 gap-0.5 px-1.5 text-[10px]"
                          >
                            <GitBranch />
                            {project.vcs}
                          </Badge>
                        )}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block truncate font-mono text-[11px]">
                        {project.path}
                      </span>
                    </span>

                    <span className="text-muted-foreground shrink-0 text-right text-[11px] tabular-nums">
                      <span className="block">
                        {project.sessionCount ?? 0} 件の会話
                      </span>
                      {project.lastActiveAt && (
                        <span className="block">
                          {formatRelative(project.lastActiveAt)}
                        </span>
                      )}
                    </span>
                  </button>

                  {open && (
                    <div className="ml-[1.625rem] border-l pb-1">
                      {!state || state.loading ? (
                        <InlineSpinner />
                      ) : state.error ? (
                        <div className="flex items-center gap-2 px-4 py-3">
                          <p className="text-muted-foreground min-w-0 flex-1 text-xs break-words">
                            {state.error}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void fetchSessions(project.id)}
                          >
                            再試行
                          </Button>
                        </div>
                      ) : state.sessions.length === 0 ? (
                        <p className="text-muted-foreground px-4 py-3 text-xs">
                          会話がありません
                        </p>
                      ) : (
                        <ul>
                          {state.sessions.map((session) => (
                            <li key={session.id}>
                              <Link
                                to={`/${appId}/sessions/${session.id}?project=${project.id}`}
                                className="hover:bg-muted/30 flex items-start gap-2.5 py-2.5 pr-3 pl-4 transition-colors"
                              >
                                <MessageSquare className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate text-sm">
                                      {session.title}
                                    </p>
                                    {session.status === 'running' && (
                                      <Badge
                                        variant="secondary"
                                        className="h-5 shrink-0 px-1.5 text-[10px]"
                                      >
                                        実行中
                                      </Badge>
                                    )}
                                    {session.status === 'error' && (
                                      <Badge
                                        variant="outline"
                                        className="h-5 shrink-0 px-1.5 text-[10px]"
                                      >
                                        失敗
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px]">
                                    {session.agent && (
                                      <span>{session.agent}</span>
                                    )}
                                    {session.model && (
                                      <span className="truncate">
                                        {session.model}
                                      </span>
                                    )}
                                    {session.updatedAt && (
                                      <span>
                                        · {formatRelative(session.updatedAt)}
                                      </span>
                                    )}
                                    {session.directory &&
                                      session.directory !== project.path && (
                                        <span className="truncate">
                                          · {session.directory}
                                        </span>
                                      )}
                                  </div>
                                </div>

                                <ChevronRight className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        </div>
      </section>
    </div>
  )
}

function PaneSpinner() {
  return (
    <div className="flex min-h-32 items-center justify-center py-10">
      <Loader2 className="text-muted-foreground size-5 animate-spin" />
    </div>
  )
}

function InlineSpinner() {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
      <span className="text-muted-foreground text-xs">読み込み中…</span>
    </div>
  )
}

function PaneMessage({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="text-muted-foreground/60 [&>svg]:size-7">{icon}</span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 max-w-xs text-xs leading-relaxed break-words">
          {description}
        </p>
      </div>
      {action}
    </div>
  )
}

function formatRelative(iso: string | undefined): string {
  if (!iso) {
    return ''
  }

  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) {
    return ''
  }

  const diff = Math.max(0, Date.now() - time)
  const minutes = Math.floor(diff / 60_000)

  if (minutes < 1) {
    return 'たった今'
  }
  if (minutes < 60) {
    return `${minutes}分前`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}時間前`
  }

  const days = Math.floor(hours / 24)
  if (days < 30) {
    return `${days}日前`
  }

  const months = Math.floor(days / 30)
  if (months < 12) {
    return `${months}か月前`
  }

  return `${Math.floor(months / 12)}年前`
}
