import {
  Fragment,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlignJustify,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Columns2,
  Copy,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  List,
  ListTree,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  Play,
  RefreshCw,
  ScrollText,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'
import type { ProcessDefinition, SessionComment } from '../../schema'
import type {
  GitChangedFile,
  GitRepoSummary,
  SessionDetailResponse,
  WorkspaceAllFilesResponse,
  WorkspaceDiffResponse,
  WorkspaceEntry,
  WorkspaceFileResponse,
  WorkspaceFilesResponse,
  WorkspaceInfo,
  WorkspaceRoot,
} from '../../shared/agents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useApp } from '@/hooks/use-app'
import { api } from '@/lib/api'
import { appTypeLabels } from '@/lib/app'
import { cn } from '@/lib/utils'
import type { CodeSelection } from '@/components/code-viewer'
import ConnectScreen from './ConnectScreen'
import CommandPalette from '@/components/command-palette'

const CodeViewer = lazy(() => import('@/components/code-viewer'))

interface EditorTab {
  id: string
  kind: 'file' | 'diff'
  path: string
  repoPath?: string
  title: string
}

interface DiffSelection {
  text: string
  startLine?: number
  endLine?: number
  side?: 'old' | 'new' | 'both'
  rect?: { left: number; top: number; bottom: number }
}

interface CommentTarget {
  kind: 'file' | 'diff'
  path: string
  repoPath?: string
  startLine?: number
  endLine?: number
  side?: 'old' | 'new' | 'both'
  text: string
}

type EntryDialogKind = 'create-file' | 'create-directory' | 'rename'

interface EntryDialogState {
  kind: EntryDialogKind
  parent: string
  entry: WorkspaceEntry | null
}

export default function SessionScreen() {
  const { detail } = useApp()
  const { appId, sessionId } = useParams<{
    appId: string
    sessionId: string
  }>()

  const [session, setSession] = useState<SessionDetailResponse | null>(null)
  const [roots, setRoots] = useState<WorkspaceRoot[]>([])
  const [rootIndex, setRootIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dirEntries, setDirEntries] = useState<
    Record<string, WorkspaceEntry[]>
  >({})
  const [dirLoading, setDirLoading] = useState<Set<string>>(new Set())
  const [dirErrors, setDirErrors] = useState<Record<string, string>>({})

  const [diff, setDiff] = useState<WorkspaceDiffResponse | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [gitView, setGitView] = useState<'list' | 'tree'>('list')

  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [diffMode, setDiffMode] = useState<'split' | 'unified'>('split')
  const [fileCache, setFileCache] = useState<
    Record<string, WorkspaceFileResponse>
  >({})
  const [fileLoadingPath, setFileLoadingPath] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([])
  const [workspaceFilesRoot, setWorkspaceFilesRoot] = useState<number | null>(
    null,
  )
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [filesTruncated, setFilesTruncated] = useState(false)

  const [fileSelection, setFileSelection] = useState<CodeSelection | null>(null)
  const [diffSelection, setDiffSelection] = useState<DiffSelection | null>(null)
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null)
  const [commentText, setCommentText] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    entry: WorkspaceEntry
  } | null>(null)
  const [entryDialog, setEntryDialog] = useState<EntryDialogState | null>(null)
  const [entryName, setEntryName] = useState('')
  const [entryError, setEntryError] = useState<string | null>(null)
  const [entrySaving, setEntrySaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceEntry | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)

  const entryDialogTitle =
    entryDialog?.kind === 'rename'
      ? '名前を変更'
      : entryDialog?.kind === 'create-directory'
        ? '新規フォルダ'
        : '新規ファイル'
  const entryDialogSubmitLabel =
    entryDialog?.kind === 'rename' ? '変更' : '作成'
  const entryDialogLocation = entryDialog
    ? entryDialog.parent || 'ワークスペースのルート'
    : ''
  const [rightView, setRightView] = useState<'editor' | 'comments' | 'processes'>(
    'editor',
  )
  const [comments, setComments] = useState<SessionComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [processes, setProcesses] = useState<ProcessDefinition[]>([])
  const [processesLoading, setProcessesLoading] = useState(false)
  const [processesError, setProcessesError] = useState<string | null>(null)
  const [openLogId, setOpenLogId] = useState<string | null>(null)
  const [processLogs, setProcessLogs] = useState<Record<string, string[]>>({})
  const [processLogLoading, setProcessLogLoading] = useState<string | null>(
    null,
  )
  const editorPaneRef = useRef<HTMLDivElement | null>(null)
  const selectionPopupRef = useRef<HTMLDivElement | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)

  const workspaceBase =
    appId && sessionId
      ? `/apps/${appId}/sessions/${sessionId}/workspace`
      : ''

  const loadTreeDir = useCallback(
    async (index: number, path: string) => {
      if (!workspaceBase) {
        return
      }

      setDirLoading((previous) => new Set(previous).add(path))

      try {
        const result = await api<WorkspaceFilesResponse>(
          `${workspaceBase}/files?root=${index}&path=${encodeURIComponent(path)}`,
        )
        setDirEntries((previous) => ({ ...previous, [path]: result.entries }))
        setDirErrors((previous) => {
          const next = { ...previous }
          delete next[path]
          return next
        })
      } catch (loadError) {
        setDirErrors((previous) => ({
          ...previous,
          [path]: errorMessage(loadError),
        }))
      } finally {
        setDirLoading((previous) => {
          const next = new Set(previous)
          next.delete(path)
          return next
        })
      }
    },
    [workspaceBase],
  )

  const loadDiff = useCallback(
    async (index: number) => {
      if (!workspaceBase) {
        return
      }

      setDiffLoading(true)
      setDiffError(null)

      try {
        setDiff(
          await api<WorkspaceDiffResponse>(
            `${workspaceBase}/diff?root=${index}`,
          ),
        )
      } catch (loadError) {
        setDiff(null)
        setDiffError(errorMessage(loadError))
      } finally {
        setDiffLoading(false)
      }
    },
    [workspaceBase],
  )

  useEffect(() => {
    if (!appId || !sessionId) {
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      api<SessionDetailResponse>(`/apps/${appId}/sessions/${sessionId}`),
      api<WorkspaceInfo>(`/apps/${appId}/sessions/${sessionId}/workspace`).catch(
        () => ({ roots: [] }) as WorkspaceInfo,
      ),
    ])
      .then(([nextSession, workspace]) => {
        if (cancelled) {
          return
        }

        setSession(nextSession)
        setRoots(workspace.roots)
        setRootIndex(0)

        if (workspace.roots.length > 0) {
          void loadTreeDir(0, '')
          void loadDiff(0)
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(errorMessage(loadError))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [appId, sessionId, loadTreeDir, loadDiff])

  const loadComments = useCallback(async () => {
    if (!appId || !sessionId) {
      return
    }

    setCommentsLoading(true)
    setCommentsError(null)

    try {
      const result = await api<{ comments: SessionComment[] }>(
        `/apps/${appId}/sessions/${sessionId}/comments`,
      )
      setComments(result.comments)
    } catch (loadError) {
      setCommentsError(errorMessage(loadError))
    } finally {
      setCommentsLoading(false)
    }
  }, [appId, sessionId])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  useEffect(() => {
    if (rightView !== 'comments') {
      return
    }

    const timer = window.setInterval(() => {
      void loadComments()
    }, 5000)

    return () => {
      window.clearInterval(timer)
    }
  }, [rightView, loadComments])

  const loadProcesses = useCallback(async () => {
    if (!appId || !sessionId) {
      return
    }

    setProcessesLoading(true)

    try {
      const result = await api<{ processes: ProcessDefinition[] }>(
        `/apps/${appId}/sessions/${sessionId}/processes`,
      )
      setProcesses(result.processes)
      setProcessesError(null)
    } catch (loadError) {
      setProcessesError(errorMessage(loadError))
    } finally {
      setProcessesLoading(false)
    }
  }, [appId, sessionId])

  useEffect(() => {
    void loadProcesses()
  }, [loadProcesses])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadProcesses()
    }, 5000)

    return () => {
      window.clearInterval(timer)
    }
  }, [loadProcesses])

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const activeFilePath = activeTab?.kind === 'file' ? activeTab.path : null

  useEffect(() => {
    if (!activeFilePath || !workspaceBase || fileCache[activeFilePath]) {
      return
    }

    let cancelled = false
    setFileLoadingPath(activeFilePath)
    setFileError(null)

    api<WorkspaceFileResponse>(
      `${workspaceBase}/file?root=${rootIndex}&path=${encodeURIComponent(activeFilePath)}`,
    )
      .then((result) => {
        if (!cancelled) {
          setFileCache((previous) => ({
            ...previous,
            [activeFilePath]: result,
          }))
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setFileError(errorMessage(loadError))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFileLoadingPath(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeFilePath, workspaceBase, rootIndex, fileCache])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return
      }

      if (event.key.toLowerCase() !== 'p') {
        return
      }

      if (commentOpen || entryDialog || deleteTarget) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setPaletteOpen(true)
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [commentOpen, entryDialog, deleteTarget])

  useEffect(() => {
    if (!paletteOpen || !workspaceBase || workspaceFilesRoot === rootIndex) {
      return
    }

    let cancelled = false
    setWorkspaceFiles([])
    setFilesLoading(true)
    setFilesError(null)

    api<WorkspaceAllFilesResponse>(
      `${workspaceBase}/all-files?root=${rootIndex}`,
    )
      .then((result) => {
        if (cancelled) {
          return
        }

        setWorkspaceFiles(result.files)
        setFilesTruncated(result.truncated)
        setWorkspaceFilesRoot(rootIndex)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setFilesError(errorMessage(loadError))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFilesLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [paletteOpen, workspaceBase, rootIndex, workspaceFilesRoot])

  const selection =
    activeTab?.kind === 'file'
      ? fileSelection
      : activeTab?.kind === 'diff'
        ? diffSelection
        : null

  const popupPosition =
    selection?.rect && selection.rect.bottom > 0
      ? selectionPopupPosition(selection.rect)
      : null

  const showSelectionPopup = Boolean(
    rightView === 'editor' &&
      !commentOpen &&
      selection?.text.trim() &&
      popupPosition,
  )

  const unresolvedComments = comments.filter(
    (comment) => !comment.doneAt,
  ).length

  const runningProcesses = processes.filter(
    (process) => process.status === 'running' || process.status === 'starting',
  ).length

  const stopManagedProcess = useCallback(
    async (id: string) => {
      if (!appId) {
        return
      }

      try {
        await api(`/apps/${appId}/processes/${id}/stop`, { method: 'POST' })
        await loadProcesses()
      } catch (stopError) {
        setNotice(errorMessage(stopError))
        window.setTimeout(() => setNotice(null), 3000)
      }
    },
    [appId, loadProcesses],
  )

  const rerunProcess = useCallback(
    async (process: ProcessDefinition) => {
      if (!appId) {
        return
      }

      try {
        await api(`/apps/${appId}/processes/${process.id}/run`, {
          method: 'POST',
        })
        await loadProcesses()
      } catch (runError) {
        setNotice(errorMessage(runError))
        window.setTimeout(() => setNotice(null), 3000)
      }
    },
    [appId, loadProcesses],
  )

  const toggleProcessLog = useCallback(
    async (id: string) => {
      if (!appId) {
        return
      }

      if (openLogId === id) {
        setOpenLogId(null)
        return
      }

      setOpenLogId(id)
      setProcessLogLoading(id)

      try {
        const result = await api<{
          process: ProcessDefinition
          log: { lines: string[]; truncated: boolean }
        }>(`/apps/${appId}/processes/${id}/logs?tail=300`)

        setProcessLogs((previous) => ({
          ...previous,
          [id]: result.log.lines,
        }))
      } catch (logError) {
        setProcessLogs((previous) => ({
          ...previous,
          [id]: [errorMessage(logError)],
        }))
      } finally {
        setProcessLogLoading(null)
      }
    },
    [appId, openLogId],
  )

  const revealLabel = useMemo(() => {
    if (/Mac/i.test(navigator.userAgent)) {
      return 'Finder で表示'
    }
    if (/Windows/i.test(navigator.userAgent)) {
      return 'Explorer で表示'
    }
    return 'ファイルマネージャーで表示'
  }, [])

  const revealEntry = useCallback(
    async (entry: WorkspaceEntry) => {
      setContextMenu(null)

      if (!workspaceBase) {
        return
      }

      try {
        await api(`${workspaceBase}/reveal`, {
          method: 'POST',
          body: JSON.stringify({ root: rootIndex, path: entry.path }),
        })
        setNotice('ファイルマネージャーで開きました')
      } catch (revealError) {
        setNotice(errorMessage(revealError))
      }

      window.setTimeout(() => setNotice(null), 2500)
    },
    [workspaceBase, rootIndex],
  )

  const openWorkspaceFolder = useCallback(async () => {
    if (!workspaceBase) {
      return
    }

    try {
      await api(`${workspaceBase}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ root: rootIndex, path: '.' }),
      })
      setNotice('フォルダを開きました')
    } catch (openError) {
      setNotice(errorMessage(openError))
    }

    window.setTimeout(() => setNotice(null), 2500)
  }, [workspaceBase, rootIndex])

  const copyEntryPath = useCallback(
    async (entry: WorkspaceEntry) => {
      setContextMenu(null)

      const root = roots[rootIndex]
      if (!root) {
        return
      }

      const absolute = entry.path ? `${root.path}/${entry.path}` : root.path

      try {
        await navigator.clipboard.writeText(absolute)
        setNotice('パスをコピーしました')
      } catch {
        setNotice('パスをコピーできませんでした')
      }

      window.setTimeout(() => setNotice(null), 2000)
    },
    [roots, rootIndex],
  )

  async function reloadTreeDir(path: string): Promise<void> {
    setDirEntries((previous) => {
      const next = { ...previous }
      delete next[path]
      return next
    })
    setDirErrors((previous) => {
      const next = { ...previous }
      delete next[path]
      return next
    })
    await loadTreeDir(rootIndex, path)
  }

  function remapPath(
    path: string,
    from: string,
    to: string,
  ): string | null {
    if (path === from) {
      return to
    }
    if (path.startsWith(`${from}/`)) {
      return `${to}${path.slice(from.length)}`
    }
    return null
  }

  /** リネーム後に開いているタブとキャッシュのパスを付け替える。 */
  function applyRenamedPath(from: string, to: string): void {
    setTabs((previous) =>
      previous.map((tab) => {
        if (tab.kind !== 'file') {
          return tab
        }
        const path = remapPath(tab.path, from, to)
        return path
          ? { ...tab, id: `file:${path}`, path, title: basename(path) }
          : tab
      }),
    )

    setActiveTabId((previous) => {
      if (!previous) {
        return previous
      }
      return remapPath(previous, `file:${from}`, `file:${to}`) ?? previous
    })

    setFileCache((previous) => {
      const next: Record<string, WorkspaceFileResponse> = {}

      for (const [key, value] of Object.entries(previous)) {
        const path = remapPath(key, from, to) ?? key
        next[path] = path === key ? value : { ...value, path }
      }

      return next
    })

    setExpanded((previous) => {
      const next = new Set<string>()
      for (const path of previous) {
        if (path !== from && !path.startsWith(`${from}/`)) {
          next.add(path)
        }
      }
      return next
    })

    setDirEntries((previous) => {
      const next = { ...previous }
      for (const key of Object.keys(next)) {
        if (key === from || key.startsWith(`${from}/`)) {
          delete next[key]
        }
      }
      return next
    })
  }

  /** 削除したパスに紐づくタブ・キャッシュ・ツリーの状態を捨てる。 */
  function forgetPaths(target: string): void {
    const nextTabs = tabs.filter(
      (tab) =>
        tab.kind !== 'file' ||
        (tab.path !== target && !tab.path.startsWith(`${target}/`)),
    )

    setTabs(nextTabs)

    if (activeTabId && !nextTabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(nextTabs[0]?.id ?? null)
    }

    setFileCache((previous) => {
      const next = { ...previous }
      for (const key of Object.keys(next)) {
        if (key === target || key.startsWith(`${target}/`)) {
          delete next[key]
        }
      }
      return next
    })

    setDirEntries((previous) => {
      const next = { ...previous }
      for (const key of Object.keys(next)) {
        if (key === target || key.startsWith(`${target}/`)) {
          delete next[key]
        }
      }
      return next
    })

    setExpanded((previous) => {
      const next = new Set<string>()
      for (const path of previous) {
        if (path !== target && !path.startsWith(`${target}/`)) {
          next.add(path)
        }
      }
      return next
    })
  }

  function openEntryDialog(
    kind: EntryDialogKind,
    entry: WorkspaceEntry,
  ): void {
    setContextMenu(null)
    setEntryName(kind === 'rename' ? entry.name : '')
    setEntryError(null)
    setEntryDialog({
      kind,
      parent: entry.type === 'directory' ? entry.path : parentPath(entry.path),
      entry,
    })
  }

  async function submitEntryDialog(): Promise<void> {
    if (!entryDialog || !workspaceBase || entrySaving) {
      return
    }

    const name = entryName.trim()
    if (!name) {
      setEntryError('名前を入力してください')
      return
    }

    setEntrySaving(true)
    setEntryError(null)

    try {
      if (entryDialog.kind === 'rename') {
        const entry = entryDialog.entry
        if (!entry) {
          return
        }

        const result = await api<{ path: string }>(`${workspaceBase}/rename`, {
          method: 'POST',
          body: JSON.stringify({ root: rootIndex, path: entry.path, name }),
        })

        applyRenamedPath(entry.path, result.path)
        setNotice(`${entry.name} の名前を変更しました`)
        await reloadTreeDir(parentPath(result.path))
      } else {
        const directory = entryDialog.kind === 'create-directory'

        const result = await api<{
          path: string
          type: 'file' | 'directory'
        }>(`${workspaceBase}/create`, {
          method: 'POST',
          body: JSON.stringify({
            root: rootIndex,
            path: entryDialog.parent,
            name,
            directory,
          }),
        })

        await reloadTreeDir(entryDialog.parent)

        if (!directory) {
          openFileTab(result.path)
        }

        setNotice(directory ? 'フォルダを作成しました' : 'ファイルを作成しました')
      }

      setEntryDialog(null)
      void loadDiff(rootIndex)
      window.setTimeout(() => setNotice(null), 2500)
    } catch (createError) {
      setEntryError(errorMessage(createError))
    } finally {
      setEntrySaving(false)
    }
  }

  function openDeleteDialog(entry: WorkspaceEntry): void {
    setContextMenu(null)
    setDeleteError(null)
    setDeleteTarget(entry)
  }

  async function submitDelete(): Promise<void> {
    if (!deleteTarget || !workspaceBase || deleteSaving) {
      return
    }

    const target = deleteTarget
    setDeleteSaving(true)
    setDeleteError(null)

    try {
      await api(`${workspaceBase}/delete`, {
        method: 'POST',
        body: JSON.stringify({ root: rootIndex, path: target.path }),
      })

      forgetPaths(target.path)
      setDeleteTarget(null)
      setNotice(
        target.type === 'directory'
          ? 'フォルダを削除しました'
          : 'ファイルを削除しました',
      )
      await reloadTreeDir(parentPath(target.path))
      void loadDiff(rootIndex)
      window.setTimeout(() => setNotice(null), 2500)
    } catch (deleteFailure) {
      setDeleteError(errorMessage(deleteFailure))
    } finally {
      setDeleteSaving(false)
    }
  }

  useEffect(() => {
    if (!showSelectionPopup) {
      return
    }

    const hide = () => {
      setFileSelection(null)
      setDiffSelection(null)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (selectionPopupRef.current?.contains(event.target as Node)) {
        return
      }
      hide()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [showSelectionPopup])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) {
        return
      }
      setContextMenu(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    const hide = () => setContextMenu(null)

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [contextMenu])

  useEffect(() => {
    setFileSelection(null)
    setDiffSelection(null)
  }, [activeTabId])

  useEffect(() => {
    if (rightView !== 'editor' || activeTab?.kind !== 'diff') {
      setDiffSelection(null)
      return
    }

    const update = () => {
      const selection = window.getSelection()

      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setDiffSelection(null)
        return
      }

      const range = selection.getRangeAt(0)
      const pane = editorPaneRef.current

      if (!pane || !pane.contains(range.commonAncestorContainer)) {
        setDiffSelection(null)
        return
      }

      const text = extractDiffSelectionText(range)
      const bounds = range.getBoundingClientRect()

      if (!text.trim()) {
        setDiffSelection(null)
        return
      }

      const start = diffLineInfo(range.startContainer)
      const end = diffLineInfo(range.endContainer)
      const oldLines = [start?.old, end?.old].filter(
        (line): line is number => typeof line === 'number',
      )
      const newLines = [start?.new, end?.new].filter(
        (line): line is number => typeof line === 'number',
      )
      const lines = newLines.length > 0 ? newLines : oldLines
      const side =
        oldLines.length > 0 && newLines.length > 0
          ? 'both'
          : oldLines.length > 0
            ? 'old'
            : newLines.length > 0
              ? 'new'
              : undefined

      setDiffSelection({
        text,
        startLine: lines.length > 0 ? Math.min(...lines) : undefined,
        endLine: lines.length > 0 ? Math.max(...lines) : undefined,
        side,
        rect: {
          left: bounds.left,
          top: bounds.top,
          bottom: bounds.bottom,
        },
      })
    }

    document.addEventListener('selectionchange', update)
    update()

    return () => {
      document.removeEventListener('selectionchange', update)
    }
  }, [activeTab?.id, activeTab?.kind, rightView])

  function switchRoot(index: number): void {
    setRootIndex(index)
    setExpanded(new Set())
    setDirEntries({})
    setDirErrors({})
    setDirLoading(new Set())
    setTabs([])
    setActiveTabId(null)
    setFileCache({})
    setFileError(null)
    setDiff(null)

    void loadTreeDir(index, '')
    void loadDiff(index)
  }

  function toggleFolder(path: string): void {
    const open = expanded.has(path)

    setExpanded((previous) => {
      const next = new Set(previous)
      if (open) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })

    if (!open && !dirEntries[path]) {
      void loadTreeDir(rootIndex, path)
    }
  }

  function refreshTree(): void {
    setExpanded(new Set())
    setDirEntries({})
    setDirErrors({})
    void loadTreeDir(rootIndex, '')
  }

  function openFileTab(path: string): void {
    const id = `file:${path}`

    setTabs((previous) =>
      previous.some((tab) => tab.id === id)
        ? previous
        : [
            ...previous,
            {
              id,
              kind: 'file',
              path,
              title: basename(path),
            },
          ],
    )
    setActiveTabId(id)
  }

  function openDiffTab(file: GitChangedFile): void {
    const id = `diff:${file.id}`

    setTabs((previous) =>
      previous.some((tab) => tab.id === id)
        ? previous
        : [
            ...previous,
            {
              id,
              kind: 'diff',
              path: file.path,
              repoPath: file.repoPath,
              title: basename(file.path),
            },
          ],
    )
    setActiveTabId(id)
  }

  function closeTab(id: string): void {
    const index = tabs.findIndex((tab) => tab.id === id)
    const next = tabs.filter((tab) => tab.id !== id)

    setTabs(next)

    if (activeTabId === id) {
      setActiveTabId(next[Math.max(0, index - 1)]?.id ?? next[0]?.id ?? null)
    }
  }

  function reloadActiveFile(): void {
    if (!activeTab || activeTab.kind !== 'file') {
      return
    }

    setFileCache((previous) => {
      const next = { ...previous }
      delete next[activeTab.path]
      return next
    })
  }

  function openCommentDialog(): void {
    if (!activeTab) {
      return
    }

    if (activeTab.kind === 'file') {
      if (!fileSelection?.text.trim()) {
        return
      }

      setCommentTarget({
        kind: 'file',
        path: activeTab.path,
        startLine: fileSelection.fromLine,
        endLine: fileSelection.toLine,
        text: fileSelection.text,
      })
    } else {
      const file = diff?.files.find(
        (item) => `diff:${item.id}` === activeTab.id,
      )

      if (!file || !diffSelection?.text.trim()) {
        return
      }

      setCommentTarget({
        kind: 'diff',
        path: file.path,
        repoPath: file.repoPath,
        startLine: diffSelection.startLine,
        endLine: diffSelection.endLine,
        side: diffSelection.side,
        text: diffSelection.text,
      })
    }

    setCommentText('')
    setCommentError(null)
    setCommentOpen(true)
    setFileSelection(null)
    setDiffSelection(null)
  }

  async function submitComment(): Promise<void> {
    if (!appId || !sessionId || !commentTarget || !commentText.trim()) {
      return
    }

    setCommentSaving(true)
    setCommentError(null)

    try {
      await api(`/apps/${appId}/sessions/${sessionId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          kind: commentTarget.kind,
          path: commentTarget.path,
          repoPath: commentTarget.repoPath,
          startLine: commentTarget.startLine,
          endLine: commentTarget.endLine,
          side: commentTarget.side,
          selection: commentTarget.text,
          comment: commentText.trim(),
        }),
      })

      setCommentOpen(false)
      setCommentText('')
      setCommentTarget(null)
      setNotice('コメントを保存しました')
      window.setTimeout(() => setNotice(null), 2000)
      void loadComments()
    } catch (submitError) {
      setCommentError(errorMessage(submitError))
    } finally {
      setCommentSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    )
  }

  if (error || !session || !appId) {
    if (
      detail.app.appType === 'codex' &&
      error &&
      /AppServer/i.test(error)
    ) {
      return <ConnectScreen detail={detail} />
    }

    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-medium">セッションを読み込めませんでした</p>
        <p className="text-muted-foreground max-w-sm text-xs break-words">
          {error ?? 'Not found'}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to={`/${appId ?? ''}/`}>
            <ArrowLeft />
            戻る
          </Link>
        </Button>
      </div>
    )
  }

  const backTo = session.project
    ? `/${appId}/?project=${encodeURIComponent(session.project.id)}`
    : `/${appId}/`

  return (
    <div className="flex min-h-0 flex-col">
      <header className="mb-3 flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 shrink-0">
          <Link to={backTo}>
            <ArrowLeft />
            戻る
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight">
            {session.session.title}
          </h1>
        </div>

        <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
          {appTypeLabels[detail.app.appType]}
        </Badge>
      </header>

      {roots.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">ワークスペースが見つかりません</p>
          <p className="text-muted-foreground mt-1 text-xs">
            セッションの作業ディレクトリを特定できませんでした。
          </p>
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-1">
            {roots.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => switchRoot(index)}
                title={item.path}
                className={cn(
                  'max-w-48 cursor-pointer truncate rounded-md border px-2 py-1 text-[11px] transition-colors',
                  index === rootIndex
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                )}
              >
                {item.name}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <aside className="flex flex-col gap-3 md:h-[64vh]">
              <section className="flex h-[30vh] min-h-[14rem] flex-col overflow-hidden rounded-xl border md:h-auto md:flex-1">
                <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
                  <h2 className="text-xs font-semibold tracking-tight">
                    ファイル
                  </h2>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label="ワークスペースのフォルダを開く"
                      title="ワークスペースのフォルダを開く"
                      onClick={() => void openWorkspaceFolder()}
                    >
                      <FolderOpen className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label="ファイルツリーを更新"
                      title="更新"
                      onClick={refreshTree}
                    >
                      <RefreshCw
                        className={cn(
                          'size-3.5',
                          (dirLoading.has('') || dirLoading.size > 0) &&
                            'animate-spin',
                        )}
                      />
                    </Button>
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto py-1">
                  {dirLoading.has('') && !dirEntries[''] ? (
                    <InlineSpinner />
                  ) : dirErrors[''] ? (
                    <p className="text-muted-foreground px-3 py-3 text-xs break-words">
                      {dirErrors['']}
                    </p>
                  ) : (
                    <FileTree
                      entries={dirEntries[''] ?? []}
                      depth={0}
                      dirEntries={dirEntries}
                      expanded={expanded}
                      loading={dirLoading}
                      errors={dirErrors}
                      activeFilePath={activeFilePath}
                      onToggle={toggleFolder}
                      onOpenFile={openFileTab}
                      onContextMenu={(entry, position) =>
                        setContextMenu({ ...position, entry })
                      }
                    />
                  )}
                </div>
              </section>

              <section className="flex h-[26vh] min-h-[12rem] flex-col overflow-hidden rounded-xl border md:h-auto md:flex-1">
                <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="text-xs font-semibold tracking-tight">
                      Git差分
                    </h2>
                    {diff && (
                      <span className="text-muted-foreground text-[10px]">
                        {diff.files.length}
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <div className="flex items-center gap-0.5 rounded-md border p-0.5">
                      <IconToggleButton
                        active={gitView === 'list'}
                        onClick={() => setGitView('list')}
                        label="リスト表示"
                        title="フラットなリストで表示"
                      >
                        <List className="size-3.5" />
                      </IconToggleButton>
                      <IconToggleButton
                        active={gitView === 'tree'}
                        onClick={() => setGitView('tree')}
                        label="ツリー表示"
                        title="フォルダツリーで表示"
                      >
                        <ListTree className="size-3.5" />
                      </IconToggleButton>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label="Git差分を更新"
                      title="更新"
                      onClick={() => void loadDiff(rootIndex)}
                    >
                      <RefreshCw
                        className={cn(
                          'size-3.5',
                          diffLoading && 'animate-spin',
                        )}
                      />
                    </Button>
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <GitChanges
                    diff={diff}
                    loading={diffLoading}
                    error={diffError}
                    activeTabId={activeTabId}
                    view={gitView}
                    onOpen={openDiffTab}
                  />
                </div>
              </section>
            </aside>

            <section className="flex h-[50vh] min-h-[24rem] overflow-hidden rounded-xl border md:h-[64vh]">
              <div
                ref={editorPaneRef}
                className="flex min-w-0 flex-1 flex-col"
              >
                {rightView === 'editor' ? (
                  <>
                    <EditorTabs
                      tabs={tabs}
                      activeTabId={activeTabId}
                      onActivate={setActiveTabId}
                      onClose={closeTab}
                    />

                    <EditorViewer
                      tab={activeTab}
                      diff={diff}
                      fileCache={fileCache}
                      fileLoadingPath={fileLoadingPath}
                      fileError={fileError}
                      diffLoading={diffLoading}
                      diffError={diffError}
                      diffMode={diffMode}
                      onDiffModeChange={setDiffMode}
                      onFileSelectionChange={setFileSelection}
                      onDiffSelectionChange={setDiffSelection}
                      workspaceBase={workspaceBase}
                      rootIndex={rootIndex}
                      onReloadFile={reloadActiveFile}
                      onOpenFile={openFileTab}
                    />
                  </>
                ) : rightView === 'comments' ? (
                  <CommentsPanel
                    comments={comments}
                    loading={commentsLoading}
                    error={commentsError}
                    onRefresh={() => void loadComments()}
                  />
                ) : (
                  <ProcessesPanel
                    processes={processes}
                    loading={processesLoading}
                    error={processesError}
                    openLogId={openLogId}
                    logs={processLogs}
                    logLoadingId={processLogLoading}
                    onRefresh={() => void loadProcesses()}
                    onStop={(id) => void stopManagedProcess(id)}
                    onRun={(process) => void rerunProcess(process)}
                    onToggleLog={(id) => void toggleProcessLog(id)}
                  />
                )}
              </div>

              <aside className="bg-muted/20 flex w-10 shrink-0 flex-col items-center gap-1 border-l p-1">
                <RailButton
                  active={rightView === 'editor'}
                  label="エディタ"
                  onClick={() => setRightView('editor')}
                >
                  <FileText className="size-4" />
                </RailButton>
                <RailButton
                  active={rightView === 'comments'}
                  label="コメント"
                  badge={unresolvedComments}
                  onClick={() => {
                    setRightView('comments')
                    void loadComments()
                  }}
                >
                  <MessageSquare className="size-4" />
                </RailButton>
                <RailButton
                  active={rightView === 'processes'}
                  label="プロセス"
                  badge={runningProcesses}
                  onClick={() => {
                    setRightView('processes')
                    void loadProcesses()
                  }}
                >
                  <Terminal className="size-4" />
                </RailButton>
              </aside>
            </section>
          </div>
        </>
      )}

      {showSelectionPopup && popupPosition && (
        <div
          ref={selectionPopupRef}
          style={{
            position: 'fixed',
            left: popupPosition.left,
            top: popupPosition.top,
            zIndex: 50,
          }}
          className="bg-background rounded-lg border p-1 shadow-lg"
        >
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={openCommentDialog}
            className="hover:bg-muted flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
          >
            <MessageSquarePlus className="size-3.5" />
            コメント
          </button>
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        files={workspaceFiles}
        loading={filesLoading}
        error={filesError}
        truncated={filesTruncated}
        onOpenFile={openFileTab}
      />

      <Dialog
        open={commentOpen}
        onOpenChange={(open) => {
          if (commentSaving) {
            return
          }
          setCommentOpen(open)
          if (!open) {
            setCommentError(null)
            setCommentTarget(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>選択範囲にコメント</DialogTitle>
            <DialogDescription>
              {commentTarget ? commentTargetLabel(commentTarget) : ''}
            </DialogDescription>
          </DialogHeader>

          {commentTarget && (
            <pre className="bg-muted/50 text-muted-foreground max-h-40 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
              {commentTarget.text}
            </pre>
          )}

          <Textarea
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            placeholder="この範囲についてのコメント"
            rows={4}
          />

          <p className="text-muted-foreground text-[11px] leading-relaxed">
            コメントは保存されます。右のコメント欄にあるプロンプトをコピーして会話に貼ると、未対応コメントの確認を依頼できます。
          </p>

          {commentError && (
            <p className="text-destructive text-xs break-words">
              {commentError}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCommentOpen(false)}
              disabled={commentSaving}
            >
              キャンセル
            </Button>
            <Button
              onClick={() => void submitComment()}
              disabled={commentSaving || !commentText.trim()}
            >
              {commentSaving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={entryDialog !== null}
        onOpenChange={(open) => {
          if (!open && !entrySaving) {
            setEntryDialog(null)
            setEntryError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entryDialogTitle}</DialogTitle>
            <DialogDescription>
              {entryDialog?.kind === 'rename'
                ? `${entryDialog.entry?.name ?? ''} の名前を変更します。`
                : `${entryDialogLocation} に作成します。`}
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            value={entryName}
            disabled={entrySaving}
            aria-label="名前"
            placeholder={
              entryDialog?.kind === 'create-directory'
                ? 'フォルダ名'
                : '名前'
            }
            onChange={(event) => setEntryName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submitEntryDialog()
              }
            }}
          />

          {entryError && (
            <p className="text-destructive text-xs break-words">{entryError}</p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEntryDialog(null)
                setEntryError(null)
              }}
              disabled={entrySaving}
            >
              キャンセル
            </Button>
            <Button
              onClick={() => void submitEntryDialog()}
              disabled={entrySaving || !entryName.trim()}
            >
              {entrySaving ? '処理中…' : entryDialogSubmitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteSaving) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>削除しますか？</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.path}」を削除します。
              {deleteTarget?.type === 'directory'
                ? 'フォルダの中身もすべて削除され、元に戻せません。'
                : '元に戻せません。'}
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <p className="text-destructive text-xs break-words">{deleteError}</p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null)
                setDeleteError(null)
              }}
              disabled={deleteSaving}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitDelete()}
              disabled={deleteSaving}
            >
              {deleteSaving ? '削除中…' : '削除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="bg-popover text-popover-foreground fixed z-50 min-w-48 rounded-md border p-1 shadow-md"
        >
          <p className="text-muted-foreground truncate px-2 py-1 font-mono text-[10px]">
            {contextMenu.entry.name}
          </p>
          <button
            type="button"
            role="menuitem"
            className="hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs"
            onClick={() => openEntryDialog('create-file', contextMenu.entry)}
          >
            <FilePlus className="size-3.5 shrink-0" />
            新規ファイル
          </button>
          <button
            type="button"
            role="menuitem"
            className="hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs"
            onClick={() => openEntryDialog('create-directory', contextMenu.entry)}
          >
            <FolderPlus className="size-3.5 shrink-0" />
            新規フォルダ
          </button>
          <div className="bg-border my-1 h-px" />
          <button
            type="button"
            role="menuitem"
            className="hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs"
            onClick={() => void revealEntry(contextMenu.entry)}
          >
            <FolderOpen className="size-3.5 shrink-0" />
            {revealLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            className="hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs"
            onClick={() => void copyEntryPath(contextMenu.entry)}
          >
            <Copy className="size-3.5 shrink-0" />
            パスをコピー
          </button>
          <div className="bg-border my-1 h-px" />
          <button
            type="button"
            role="menuitem"
            className="hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs"
            onClick={() => openEntryDialog('rename', contextMenu.entry)}
          >
            <Pencil className="size-3.5 shrink-0" />
            名前を変更
          </button>
          <button
            type="button"
            role="menuitem"
            className="hover:bg-destructive/10 text-destructive flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs"
            onClick={() => openDeleteDialog(contextMenu.entry)}
          >
            <Trash2 className="size-3.5 shrink-0" />
            削除
          </button>
        </div>
      )}

      {notice && (
        <div className="bg-foreground text-background fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md px-3 py-1.5 text-xs shadow-lg">
          {notice}
        </div>
      )}
    </div>
  )
}

function RailButton({
  active,
  label,
  badge,
  onClick,
  children,
}: {
  active: boolean
  label: string
  badge?: number
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'relative flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            'absolute -top-1 -right-1 min-w-4 rounded-full px-1 text-center text-[9px] leading-4',
            active
              ? 'bg-background text-foreground'
              : 'bg-foreground text-background',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

const COMMENT_CHECK_PROMPT =
  'agent-wrap MCP の reflect でこのセッションを確認し、list_comments で未対応コメントを取得してください。各コメントの内容を確認して対応し、対応したコメントは done_comment にその id を渡して完了にしてください。最後に、対応内容と残っているコメントを報告してください。'

function CommentsPanel({
  comments,
  loading,
  error,
  onRefresh,
}: {
  comments: SessionComment[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}) {
  const [promptCopied, setPromptCopied] = useState(false)

  const unresolved = comments.filter((comment) => !comment.doneAt).length

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(COMMENT_CHECK_PROMPT)
      setPromptCopied(true)
      window.setTimeout(() => setPromptCopied(false), 1500)
    } catch {
      setPromptCopied(false)
    }
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">コメント</h2>
          <span className="text-muted-foreground text-[10px]">
            {comments.length}
          </span>
          {unresolved > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              {unresolved} 未対応
            </Badge>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="コメントを更新"
          title="更新"
          onClick={onRefresh}
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </Button>
      </header>

      <div className="shrink-0 space-y-2 border-b px-4 py-2.5">
        <p className="text-muted-foreground text-[10px] leading-relaxed">
          次のプロンプトをコピーして会話に貼ると、未対応コメントの確認を依頼できます。
        </p>
        <pre className="bg-muted/40 text-muted-foreground max-h-28 overflow-auto rounded border p-2 font-mono text-[10px] leading-relaxed break-words whitespace-pre-wrap select-all">
          {COMMENT_CHECK_PROMPT}
        </pre>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-[11px]"
          aria-label="コメント確認プロンプトをコピー"
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && comments.length === 0 ? (
          <InlineSpinner />
        ) : error ? (
          <p className="text-muted-foreground p-4 text-xs break-words">
            {error}
          </p>
        ) : comments.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center p-6 text-center">
            <p className="text-muted-foreground text-xs">
              まだコメントはありません。ファイルや差分を選択して追加できます。
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function CommentItem({ comment }: { comment: SessionComment }) {
  const path =
    comment.repoPath === '.'
      ? comment.path
      : `${comment.repoPath}/${comment.path}`
  const range = comment.startLine
    ? `:${comment.startLine}${
        comment.endLine && comment.endLine !== comment.startLine
          ? `-${comment.endLine}`
          : ''
      }`
    : ''
  const side =
    comment.side === 'old'
      ? '変更前'
      : comment.side === 'new'
        ? '変更後'
        : comment.side === 'both'
          ? '変更前後'
          : null

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-2">
        <MessageSquare className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="max-w-full truncate font-mono text-[11px]">
              {path}
              {range}
            </span>
            <Badge
              variant={comment.doneAt ? 'outline' : 'secondary'}
              className="h-4 px-1 text-[9px]"
            >
              {comment.doneAt ? '対応済み' : '未対応'}
            </Badge>
          </div>

          <p className="mt-1 text-xs break-words whitespace-pre-wrap">
            {comment.comment}
          </p>

          <pre className="bg-muted/40 text-muted-foreground mt-1 max-h-24 overflow-auto rounded border p-2 font-mono text-[10px] break-all whitespace-pre-wrap">
            {comment.selection}
          </pre>

          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px]">
            <span>{comment.kind === 'diff' ? '差分' : 'ファイル'}</span>
            {side && <span>· {side}</span>}
            <span>· {formatRelative(comment.createdAt)}</span>
          </div>
        </div>
      </div>
    </li>
  )
}

const processStatusLabels: Record<ProcessDefinition['status'], string> = {
  registered: '未実行',
  starting: '起動中',
  running: '実行中',
  exited: '終了',
  failed: '失敗',
  killed: '停止',
}

function processStatusClass(status: ProcessDefinition['status']): string {
  switch (status) {
    case 'running':
      return 'bg-emerald-500 animate-pulse'
    case 'starting':
      return 'bg-amber-500 animate-pulse'
    case 'failed':
      return 'bg-destructive'
    case 'killed':
      return 'bg-amber-500'
    case 'registered':
      return 'bg-muted-foreground/40'
    default:
      return 'bg-muted-foreground/50'
  }
}

function ProcessesPanel({
  processes,
  loading,
  error,
  openLogId,
  logs,
  logLoadingId,
  onRefresh,
  onStop,
  onRun,
  onToggleLog,
}: {
  processes: ProcessDefinition[]
  loading: boolean
  error: string | null
  openLogId: string | null
  logs: Record<string, string[]>
  logLoadingId: string | null
  onRefresh: () => void
  onStop: (id: string) => void
  onRun: (process: ProcessDefinition) => void
  onToggleLog: (id: string) => void
}) {
  const isActive = (process: ProcessDefinition) =>
    process.status === 'running' || process.status === 'starting'

  const ordered = useMemo(() => {
    const time = (process: ProcessDefinition) =>
      new Date(process.startedAt ?? process.createdAt).getTime()
    const running = processes
      .filter(isActive)
      .sort((a, b) => time(a) - time(b))
    const stopped = processes
      .filter((process) => !isActive(process))
      .sort((a, b) => time(b) - time(a))

    return [...running, ...stopped]
  }, [processes])

  const running = processes.filter(isActive).length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">プロセス</h2>
          <span className="text-muted-foreground text-[10px]">
            {processes.length}
          </span>
          {running > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              {running} 実行中
            </Badge>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="プロセスを更新"
          title="更新"
          onClick={onRefresh}
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </Button>
      </header>

      <p className="text-muted-foreground shrink-0 border-b px-4 py-1.5 text-[10px] leading-relaxed">
        エージェントが MCP の run_process で起動したプロセスが表示されます。
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && processes.length === 0 ? (
          <InlineSpinner />
        ) : error ? (
          <p className="text-muted-foreground p-4 text-xs break-words">
            {error}
          </p>
        ) : processes.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center p-6 text-center">
            <p className="text-muted-foreground text-xs">
              プロセスはまだありません。run_process
              で起動すると、ここに表示されます。
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {ordered.map((process) => (
              <li key={process.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      processStatusClass(process.status),
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-medium">
                      {process.command}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label="ログを表示"
                    title="ログ"
                    onClick={() => onToggleLog(process.id)}
                  >
                    <ScrollText className="size-3.5" />
                  </Button>
                  {isActive(process) ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive size-7 shrink-0"
                      aria-label="プロセスを停止"
                      title="停止"
                      onClick={() => onStop(process.id)}
                    >
                      <Square className="fill-destructive size-3" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label="プロセスを実行"
                      title="実行"
                      onClick={() => onRun(process)}
                    >
                      <Play className="size-3.5" />
                    </Button>
                  )}
                </div>

                <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-[10px]">
                  <span>{processStatusLabels[process.status]}</span>
                  {process.pid !== null && <span>PID {process.pid}</span>}
                  {process.exitCode !== null && (
                    <span>exit {process.exitCode}</span>
                  )}
                  <span>
                    · {formatRelative(process.startedAt ?? process.createdAt)}
                  </span>
                </div>

                <p className="text-muted-foreground mt-0.5 truncate font-mono text-[10px]">
                  {process.cwd}
                </p>

                {openLogId === process.id && (
                  <pre className="bg-muted/40 text-muted-foreground mt-2 max-h-56 overflow-auto rounded border p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
                    {logLoadingId === process.id
                      ? '読み込み中…'
                      : logs[process.id]?.join('\n') || 'ログはありません'}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function FileTree({
  entries,
  depth,
  dirEntries,
  expanded,
  loading,
  errors,
  activeFilePath,
  onToggle,
  onOpenFile,
  onContextMenu,
}: {
  entries: WorkspaceEntry[]
  depth: number
  dirEntries: Record<string, WorkspaceEntry[]>
  expanded: Set<string>
  loading: Set<string>
  errors: Record<string, string>
  activeFilePath: string | null
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
  onContextMenu: (
    entry: WorkspaceEntry,
    position: { x: number; y: number },
  ) => void
}) {
  return (
    <>
      {entries.map((entry) => {
        const isDirectory = entry.type === 'directory'
        const open = expanded.has(entry.path)
        const style: CSSProperties = { paddingLeft: 8 + depth * 12 }

        return (
          <div key={entry.path}>
            <button
              type="button"
              style={style}
              onClick={() =>
                isDirectory ? onToggle(entry.path) : onOpenFile(entry.path)
              }
              onContextMenu={(event) => {
                event.preventDefault()
                onContextMenu(entry, {
                  x: Math.min(event.clientX, window.innerWidth - 240),
                  y: Math.min(event.clientY, window.innerHeight - 300),
                })
              }}
              className={cn(
                'flex w-full cursor-pointer items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors',
                activeFilePath === entry.path
                  ? 'bg-muted/70'
                  : 'hover:bg-muted/40',
              )}
            >
              {isDirectory ? (
                open ? (
                  <ChevronDown className="text-muted-foreground size-3 shrink-0" />
                ) : (
                  <ChevronRight className="text-muted-foreground size-3 shrink-0" />
                )
              ) : (
                <span className="size-3 shrink-0" />
              )}

              {isDirectory ? (
                <Folder className="text-muted-foreground size-3.5 shrink-0" />
              ) : (
                <FileText className="text-muted-foreground size-3.5 shrink-0" />
              )}

              <span className="truncate">{entry.name}</span>
            </button>

            {isDirectory && open && (
              <>
                {loading.has(entry.path) && !dirEntries[entry.path] ? (
                  <div
                    style={{ paddingLeft: 8 + (depth + 1) * 12 }}
                    className="py-1"
                  >
                    <Loader2 className="text-muted-foreground size-3 animate-spin" />
                  </div>
                ) : errors[entry.path] ? (
                  <p
                    style={{ paddingLeft: 8 + (depth + 1) * 12 }}
                    className="text-muted-foreground py-1 pr-2 text-[10px] break-words"
                  >
                    {errors[entry.path]}
                  </p>
                ) : (
                  <FileTree
                    entries={dirEntries[entry.path] ?? []}
                    depth={depth + 1}
                    dirEntries={dirEntries}
                    expanded={expanded}
                    loading={loading}
                    errors={errors}
                    activeFilePath={activeFilePath}
                    onToggle={onToggle}
                    onOpenFile={onOpenFile}
                    onContextMenu={onContextMenu}
                  />
                )}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}

function GitChanges({
  diff,
  loading,
  error,
  activeTabId,
  view,
  onOpen,
}: {
  diff: WorkspaceDiffResponse | null
  loading: boolean
  error: string | null
  activeTabId: string | null
  view: 'list' | 'tree'
  onOpen: (file: GitChangedFile) => void
}) {
  if (loading && !diff) {
    return <InlineSpinner />
  }

  if (error) {
    return (
      <p className="text-muted-foreground px-3 py-3 text-xs break-words">
        {error}
      </p>
    )
  }

  if (!diff?.git) {
    return (
      <p className="text-muted-foreground px-3 py-3 text-xs">
        Gitリポジトリではありません
      </p>
    )
  }

  if (diff.files.length === 0) {
    return (
      <p className="text-muted-foreground px-3 py-3 text-xs">
        変更はありません
      </p>
    )
  }

  if (view === 'tree') {
    return (
      <GitTreeChanges
        diff={diff}
        activeTabId={activeTabId}
        onOpen={onOpen}
      />
    )
  }

  return (
    <>
      {diff.repos.map((repo) => {
        const files = diff.files.filter(
          (file) => file.repoPath === repo.path,
        )

        if (files.length === 0) {
          return null
        }

        return (
          <section key={repo.path} className="border-b last:border-b-0">
            <GitRepoHeader repo={repo} />

            <ul className="pb-1">
              {files.map((file) => {
                const active = activeTabId === `diff:${file.id}`

                return (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(file)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-1.5 py-1 pr-2 pl-3 text-left text-xs transition-colors',
                        active ? 'bg-muted/70' : 'hover:bg-muted/40',
                      )}
                      title={file.path}
                    >
                      <span
                        className={cn(
                          'w-4 shrink-0 text-center font-mono text-[10px] font-semibold',
                          statusClass(file.status),
                        )}
                      >
                        {statusLabel(file.status)}
                      </span>
                      <span className="truncate">{file.path}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </>
  )
}

function GitRepoHeader({ repo }: { repo: GitRepoSummary }) {
  return (
    <header className="flex flex-wrap items-center gap-1.5 px-3 pt-2 pb-1">
      <span className="text-muted-foreground truncate text-[10px] font-medium">
        {repo.label}
      </span>
      {repo.kind === 'submodule' && (
        <Badge variant="outline" className="h-4 px-1 text-[9px]">
          submodule
        </Badge>
      )}
      {repo.branch && (
        <span className="text-muted-foreground/70 truncate text-[9px]">
          {repo.branch}
        </span>
      )}
    </header>
  )
}

interface GitTreeNode {
  name: string
  path: string
  type: 'directory' | 'file'
  file?: GitChangedFile
  children?: GitTreeNode[]
}

function buildGitTree(files: GitChangedFile[]): GitTreeNode[] {
  const root: GitTreeNode = {
    name: '',
    path: '',
    type: 'directory',
    children: [],
  }

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean)
    let current = root

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const path = parts.slice(0, index + 1).join('/')
      const isFile = index === parts.length - 1

      if (isFile) {
        current.children!.push({
          name: part,
          path,
          type: 'file',
          file,
        })
        break
      }

      let directory = current.children!.find(
        (node) => node.type === 'directory' && node.name === part,
      )

      if (!directory) {
        directory = { name: part, path, type: 'directory', children: [] }
        current.children!.push(directory)
      }

      current = directory
    }
  }

  const sort = (nodes: GitTreeNode[]) => {
    nodes.sort((a, b) =>
      a.type === b.type
        ? a.name.localeCompare(b.name)
        : a.type === 'directory'
          ? -1
          : 1,
    )

    for (const node of nodes) {
      if (node.children) {
        sort(node.children)
      }
    }
  }

  sort(root.children ?? [])
  return root.children ?? []
}

function GitTreeChanges({
  diff,
  activeTabId,
  onOpen,
}: {
  diff: WorkspaceDiffResponse
  activeTabId: string | null
  onOpen: (file: GitChangedFile) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggle(key: string): void {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <>
      {diff.repos.map((repo) => {
        const files = diff.files.filter(
          (file) => file.repoPath === repo.path,
        )

        if (files.length === 0) {
          return null
        }

        return (
          <section key={repo.path} className="border-b last:border-b-0">
            <GitRepoHeader repo={repo} />
            <div className="pb-1">
              <GitTreeNodes
                nodes={buildGitTree(files)}
                depth={0}
                repoPath={repo.path}
                collapsed={collapsed}
                onToggle={toggle}
                activeTabId={activeTabId}
                onOpen={onOpen}
              />
            </div>
          </section>
        )
      })}
    </>
  )
}

function GitTreeNodes({
  nodes,
  depth,
  repoPath,
  collapsed,
  onToggle,
  activeTabId,
  onOpen,
}: {
  nodes: GitTreeNode[]
  depth: number
  repoPath: string
  collapsed: Set<string>
  onToggle: (key: string) => void
  activeTabId: string | null
  onOpen: (file: GitChangedFile) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        const key = `${repoPath}:${node.path}`
        const style: CSSProperties = { paddingLeft: 8 + depth * 12 }

        if (node.type === 'directory') {
          const open = !collapsed.has(key)

          return (
            <div key={key}>
              <button
                type="button"
                style={style}
                onClick={() => onToggle(key)}
                className="hover:bg-muted/40 flex w-full cursor-pointer items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors"
              >
                {open ? (
                  <ChevronDown className="text-muted-foreground size-3 shrink-0" />
                ) : (
                  <ChevronRight className="text-muted-foreground size-3 shrink-0" />
                )}
                <Folder className="text-muted-foreground size-3.5 shrink-0" />
                <span className="truncate">{node.name}</span>
              </button>

              {open && (
                <GitTreeNodes
                  nodes={node.children ?? []}
                  depth={depth + 1}
                  repoPath={repoPath}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  activeTabId={activeTabId}
                  onOpen={onOpen}
                />
              )}
            </div>
          )
        }

        const file = node.file!
        const active = activeTabId === `diff:${file.id}`

        return (
          <button
            key={key}
            type="button"
            style={style}
            onClick={() => onOpen(file)}
            title={file.path}
            className={cn(
              'flex w-full cursor-pointer items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors',
              active ? 'bg-muted/70' : 'hover:bg-muted/40',
            )}
          >
            <span
              className={cn(
                'w-4 shrink-0 text-center font-mono text-[10px] font-semibold',
                statusClass(file.status),
              )}
            >
              {statusLabel(file.status)}
            </span>
            <span className="truncate">{node.name}</span>
          </button>
        )
      })}
    </>
  )
}

function EditorTabs({
  tabs,
  activeTabId,
  onActivate,
  onClose,
}: {
  tabs: EditorTab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
}) {
  if (tabs.length === 0) {
    return (
      <div className="text-muted-foreground flex h-9 shrink-0 items-center border-b px-3 text-[11px]">
        ファイルまたは差分を選択してください
      </div>
    )
  }

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId

        return (
          <div
            key={tab.id}
            className={cn(
              'flex shrink-0 items-center gap-1 border-r px-2 text-[11px]',
              active ? 'bg-muted/70' : 'hover:bg-muted/40',
            )}
          >
            <button
              type="button"
              onClick={() => onActivate(tab.id)}
              title={tab.path}
              className="flex min-w-0 cursor-pointer items-center gap-1"
            >
              {tab.kind === 'diff' ? (
                <GitBranch className="text-muted-foreground size-3 shrink-0" />
              ) : (
                <FileText className="text-muted-foreground size-3 shrink-0" />
              )}
              <span className="max-w-40 truncate">{tab.title}</span>
            </button>

            <button
              type="button"
              onClick={() => onClose(tab.id)}
              aria-label="タブを閉じる"
              className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-0.5"
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function UntrackedFileView({
  workspaceBase,
  rootIndex,
  path,
  onSelectionChange,
}: {
  workspaceBase: string
  rootIndex: number
  path: string
  onSelectionChange: (selection: CodeSelection | null) => void
}) {
  const [file, setFile] = useState<WorkspaceFileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({
      root: String(rootIndex),
      path,
    })

    setFile(null)
    setError(null)

    api<WorkspaceFileResponse>(`${workspaceBase}/file?${params}`)
      .then((result) => {
        if (!cancelled) {
          setFile(result)
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(errorMessage(loadError))
        }
      })

    return () => {
      cancelled = true
    }
  }, [workspaceBase, rootIndex, path])

  if (error) {
    return (
      <p className="text-muted-foreground p-4 text-xs break-words">{error}</p>
    )
  }

  if (!file) {
    return <InlineSpinner />
  }

  if (file.binary) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted-foreground text-xs">
          バイナリファイルのため表示できません
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {file.truncated && (
        <p className="text-muted-foreground shrink-0 border-b px-3 py-1.5 text-[10px]">
          大きいファイルのため先頭のみ表示しています
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<InlineSpinner />}>
          <CodeViewer
            path={file.path}
            value={file.content ?? ''}
            onSelectionChange={onSelectionChange}
          />
        </Suspense>
      </div>
    </div>
  )
}

function EditorViewer({
  tab,
  diff,
  fileCache,
  fileLoadingPath,
  fileError,
  diffLoading,
  diffError,
  diffMode,
  onDiffModeChange,
  onFileSelectionChange,
  onDiffSelectionChange,
  workspaceBase,
  rootIndex,
  onReloadFile,
  onOpenFile,
}: {
  tab: EditorTab | null
  diff: WorkspaceDiffResponse | null
  fileCache: Record<string, WorkspaceFileResponse>
  fileLoadingPath: string | null
  fileError: string | null
  diffLoading: boolean
  diffError: string | null
  diffMode: 'split' | 'unified'
  onDiffModeChange: (mode: 'split' | 'unified') => void
  onFileSelectionChange: (selection: CodeSelection | null) => void
  onDiffSelectionChange: (selection: DiffSelection | null) => void
  workspaceBase: string
  rootIndex: number
  onReloadFile: () => void
  onOpenFile: (path: string) => void
}) {
  if (!tab) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted-foreground text-xs">
          左のファイルまたは差分を選択してください
        </p>
      </div>
    )
  }

  if (tab.kind === 'diff') {
    if (diffLoading && !diff) {
      return <InlineSpinner />
    }

    if (diffError) {
      return (
        <p className="text-muted-foreground p-4 text-xs break-words">
          {diffError}
        </p>
      )
    }

    const file = diff?.files.find((item) => `diff:${item.id}` === tab.id)

    if (!file) {
      return (
        <p className="text-muted-foreground p-4 text-xs">
          差分が見つかりません。Git差分を更新してください。
        </p>
      )
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <span
            className={cn(
              'shrink-0 font-mono text-[10px] font-semibold',
              statusClass(file.status),
            )}
          >
            {statusLabel(file.status)}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
            {file.repoPath === '.' ? '' : `${file.repoPath}/`}
            {file.path}
          </span>

          {file.diff.trim() && (
            <div className="flex shrink-0 items-center gap-0.5 rounded-md border p-0.5">
              <IconToggleButton
                active={diffMode === 'split'}
                onClick={() => onDiffModeChange('split')}
                label="分割表示"
                title="左右に分割して表示"
              >
                <Columns2 className="size-3.5" />
              </IconToggleButton>
              <IconToggleButton
                active={diffMode === 'unified'}
                onClick={() => onDiffModeChange('unified')}
                label="統合表示"
                title="1カラムで表示"
              >
                <AlignJustify className="size-3.5" />
              </IconToggleButton>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="ファイルの内容を開く"
            title="内容を開く"
            onClick={() =>
              onOpenFile(
                file.repoPath === '.'
                  ? file.path
                  : `${file.repoPath}/${file.path}`,
              )
            }
          >
            <FileText className="size-3.5" />
          </Button>
        </header>

        {file.untracked ? (
          <UntrackedFileView
            workspaceBase={workspaceBase}
            rootIndex={rootIndex}
            path={
              file.repoPath === '.'
                ? file.path
                : `${file.repoPath}/${file.path}`
            }
            onSelectionChange={(selection) =>
              onDiffSelectionChange(
                selection
                  ? {
                      text: selection.text,
                      startLine: selection.fromLine,
                      endLine: selection.toLine,
                      side: 'new',
                      rect: selection.rect,
                    }
                  : null,
              )
            }
          />
        ) : file.diff.trim() ? (
          <>
            <DiffViewer text={file.diff} mode={diffMode} />
            {file.truncated && (
              <p className="text-muted-foreground shrink-0 border-t px-3 py-1.5 text-[10px]">
                差分が大きいため一部のみ表示しています
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground p-4 text-xs">
            差分はありません
          </p>
        )}
      </div>
    )
  }

  const file = fileCache[tab.path]

  if (fileLoadingPath === tab.path && !file) {
    return <InlineSpinner />
  }

  if (fileError && !file) {
    return (
      <p className="text-muted-foreground p-4 text-xs break-words">
        {fileError}
      </p>
    )
  }

  if (!file) {
    return <InlineSpinner />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
          {file.path}
        </span>
        <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
          {formatBytes(file.size)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="ファイルを再読み込み"
          title="再読み込み"
          onClick={onReloadFile}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </header>

      {file.binary ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
          <p className="text-muted-foreground text-xs">
            バイナリファイルのため表示できません
          </p>
        </div>
      ) : (
        <>
          {file.truncated && (
            <p className="text-muted-foreground shrink-0 border-b px-3 py-1.5 text-[10px]">
              大きいファイルのため先頭のみ表示しています
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<InlineSpinner />}>
              <CodeViewer
                path={file.path}
                value={file.content ?? ''}
                onSelectionChange={onFileSelectionChange}
              />
            </Suspense>
          </div>
        </>
      )}
    </div>
  )
}

function IconToggleButton({
  active,
  onClick,
  label,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  title: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={title}
      className={cn(
        'cursor-pointer rounded p-1 transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

interface DiffLine {
  kind: 'context' | 'add' | 'del' | 'meta'
  text: string
  oldNumber?: number
  newNumber?: number
}

interface DiffHunk {
  header: string
  lines: DiffLine[]
}

interface ParsedDiff {
  meta: string[]
  hunks: DiffHunk[]
}

interface SplitRow {
  old: DiffLine | null
  new: DiffLine | null
  meta?: string
}

function parseDiff(text: string): ParsedDiff {
  const meta: string[] = []
  const hunks: DiffHunk[] = []
  let hunk: DiffHunk | null = null
  let oldNumber = 0
  let newNumber = 0

  for (const raw of text.split('\n')) {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)

    if (header) {
      oldNumber = Number(header[1])
      newNumber = Number(header[2])
      hunk = { header: raw, lines: [] }
      hunks.push(hunk)
      continue
    }

    if (!hunk) {
      if (
        raw.startsWith('diff --git ') ||
        raw.startsWith('index ') ||
        raw.startsWith('--- ') ||
        raw.startsWith('+++ ')
      ) {
        continue
      }
      if (raw.trim()) {
        meta.push(raw)
      }
      continue
    }

    if (raw.startsWith('+')) {
      hunk.lines.push({ kind: 'add', text: raw.slice(1), newNumber })
      newNumber += 1
    } else if (raw.startsWith('-')) {
      hunk.lines.push({ kind: 'del', text: raw.slice(1), oldNumber })
      oldNumber += 1
    } else if (raw.startsWith(' ')) {
      hunk.lines.push({
        kind: 'context',
        text: raw.slice(1),
        oldNumber,
        newNumber,
      })
      oldNumber += 1
      newNumber += 1
    } else if (raw.startsWith('\\')) {
      hunk.lines.push({ kind: 'meta', text: raw })
    } else if (raw.trim()) {
      meta.push(raw)
    }
  }

  return { meta, hunks }
}

function splitRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = []
  let deletions: DiffLine[] = []
  let additions: DiffLine[] = []

  const flush = () => {
    const count = Math.max(deletions.length, additions.length)

    for (let index = 0; index < count; index += 1) {
      rows.push({
        old: deletions[index] ?? null,
        new: additions[index] ?? null,
      })
    }

    deletions = []
    additions = []
  }

  for (const line of hunk.lines) {
    if (line.kind === 'del') {
      deletions.push(line)
      continue
    }
    if (line.kind === 'add') {
      additions.push(line)
      continue
    }

    flush()

    if (line.kind === 'meta') {
      rows.push({ old: null, new: null, meta: line.text })
    } else {
      rows.push({ old: line, new: line })
    }
  }

  flush()
  return rows
}

function DiffViewer({
  text,
  mode,
}: {
  text: string
  mode: 'split' | 'unified'
}) {
  const parsed = useMemo(() => parseDiff(text), [text])

  if (parsed.hunks.length === 0) {
    if (parsed.meta.length > 0) {
      return (
        <div className="min-h-0 flex-1 overflow-auto">
          <pre className="text-muted-foreground p-4 font-mono text-[11px] leading-relaxed whitespace-pre">
            {parsed.meta.join('\n')}
          </pre>
        </div>
      )
    }

    return <p className="text-muted-foreground p-4 text-xs">差分はありません</p>
  }

  if (mode === 'split') {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse font-mono text-[11px] leading-relaxed">
          <colgroup>
            <col className="w-1/2" />
            <col className="w-1/2" />
          </colgroup>
          <tbody>
            {parsed.meta.length > 0 && (
              <tr>
                <td
                  colSpan={2}
                  className="text-muted-foreground px-3 py-1 whitespace-pre-wrap break-all"
                >
                  {parsed.meta.join('\n')}
                </td>
              </tr>
            )}

            {parsed.hunks.map((hunk, hunkIndex) => (
              <Fragment key={hunkIndex}>
                <tr>
                  <td
                    colSpan={2}
                    className="bg-muted/60 px-3 py-1 text-sky-600 whitespace-pre-wrap break-all"
                  >
                    {hunk.header}
                  </td>
                </tr>

                {splitRows(hunk).map((row, rowIndex) =>
                  row.meta ? (
                    <tr key={rowIndex}>
                      <td
                        colSpan={2}
                        className="text-muted-foreground px-3 whitespace-pre-wrap break-all"
                      >
                        {row.meta}
                      </td>
                    </tr>
                  ) : (
                    <tr key={rowIndex}>
                      <td
                        className={cn(
                          'border-border border-r align-top',
                          row.old?.kind === 'del' && 'bg-red-500/5',
                        )}
                      >
                        <SplitCell line={row.old} side="old" />
                      </td>
                      <td
                        className={cn(
                          'align-top',
                          row.new?.kind === 'add' && 'bg-emerald-500/5',
                        )}
                      >
                        <SplitCell line={row.new} side="new" />
                      </td>
                    </tr>
                  ),
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="font-mono text-[11px] leading-relaxed">
        {parsed.meta.length > 0 && (
          <div className="text-muted-foreground px-3 py-1 whitespace-pre-wrap break-all">
            {parsed.meta.join('\n')}
          </div>
        )}

        {parsed.hunks.map((hunk, hunkIndex) => (
          <div key={hunkIndex}>
            <div className="bg-muted/60 px-3 py-1 text-sky-600 whitespace-pre-wrap break-all">
              {hunk.header}
            </div>

            {hunk.lines.map((line, lineIndex) =>
              line.kind === 'meta' ? (
                <div
                  key={lineIndex}
                  className="text-muted-foreground px-3 whitespace-pre-wrap break-all"
                >
                  {line.text}
                </div>
              ) : (
                <UnifiedLine key={lineIndex} line={line} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function UnifiedLine({ line }: { line: DiffLine }) {
  return (
    <div
      data-diff-line
      data-old-line={line.oldNumber ?? ''}
      data-new-line={line.newNumber ?? ''}
      className={cn(
        'flex',
        line.kind === 'add' && 'bg-emerald-500/5',
        line.kind === 'del' && 'bg-red-500/5',
      )}
    >
      <span className="text-muted-foreground w-10 shrink-0 pr-2 text-right tabular-nums">
        {line.oldNumber ?? ''}
      </span>
      <span className="text-muted-foreground w-10 shrink-0 pr-2 text-right tabular-nums">
        {line.newNumber ?? ''}
      </span>
      <span
        className={cn(
          'w-4 shrink-0 text-center',
          line.kind === 'add' && 'text-emerald-600',
          line.kind === 'del' && 'text-red-600',
        )}
      >
        {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
      </span>
      <span
        data-diff-text
        className={cn(
          'min-w-0 flex-1 pr-3 whitespace-pre-wrap break-all',
          line.kind === 'add' && 'text-emerald-700',
          line.kind === 'del' && 'text-red-700',
        )}
      >
        {line.text || ' '}
      </span>
    </div>
  )
}

function SplitCell({
  line,
  side,
}: {
  line: DiffLine | null
  side: 'old' | 'new'
}) {
  if (!line) {
    return <div className="min-h-[1.25rem]" />
  }

  const number = side === 'old' ? line.oldNumber : line.newNumber
  const isAdd = line.kind === 'add'
  const isDel = line.kind === 'del'

  return (
    <div
      data-diff-line
      data-old-line={side === 'old' ? (number ?? '') : ''}
      data-new-line={side === 'new' ? (number ?? '') : ''}
      className="flex min-w-0"
    >
      <span className="text-muted-foreground w-10 shrink-0 pr-2 text-right tabular-nums">
        {number ?? ''}
      </span>
      <span
        className={cn(
          'w-4 shrink-0 text-center',
          isAdd && 'text-emerald-600',
          isDel && 'text-red-600',
        )}
      >
        {isAdd ? '+' : isDel ? '-' : ' '}
      </span>
      <span
        data-diff-text
        className={cn(
          'min-w-0 flex-1 pr-3 whitespace-pre-wrap break-all',
          isAdd && 'text-emerald-700',
          isDel && 'text-red-700',
        )}
      >
        {line.text || ' '}
      </span>
    </div>
  )
}

function InlineSpinner() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center py-8">
      <Loader2 className="text-muted-foreground size-4 animate-spin" />
    </div>
  )
}

function selectionPopupPosition(rect: {
  left: number
  top: number
  bottom: number
}): { left: number; top: number } {
  const width = 120
  const height = 40
  const left = Math.min(
    Math.max(8, rect.left),
    Math.max(8, window.innerWidth - width - 8),
  )
  const top =
    rect.bottom + 8 + height > window.innerHeight
      ? Math.max(8, rect.top - height - 8)
      : rect.bottom + 8

  return { left, top }
}

function diffLineInfo(
  node: Node,
): { old?: number; new?: number } | null {
  const element = node instanceof Element ? node : node.parentElement
  const row = element?.closest<HTMLElement>('[data-diff-line]')

  if (!row) {
    return null
  }

  return {
    old: row.dataset.oldLine ? Number(row.dataset.oldLine) : undefined,
    new: row.dataset.newLine ? Number(row.dataset.newLine) : undefined,
  }
}

function extractDiffSelectionText(range: Range): string {
  const container = document.createElement('div')
  container.appendChild(range.cloneContents())

  const parts = [
    ...container.querySelectorAll<HTMLElement>('[data-diff-text]'),
  ].map((element) => element.textContent ?? '')

  return (parts.length > 0 ? parts.join('\n') : range.toString()).trim()
}

function commentTargetLabel(target: CommentTarget): string {
  const path =
    target.repoPath && target.repoPath !== '.'
      ? `${target.repoPath}/${target.path}`
      : target.path
  const range = target.startLine
    ? `:${target.startLine}${
        target.endLine && target.endLine !== target.startLine
          ? `-${target.endLine}`
          : ''
      }`
    : ''

  return `${target.kind === 'diff' ? '差分' : 'ファイル'} ${path}${range}`
}

function statusLabel(status: string): string {
  if (status === '??') {
    return 'U'
  }
  return status.charAt(0) || 'M'
}

function statusClass(status: string): string {
  if (status === '??' || status.startsWith('A')) {
    return 'text-emerald-600'
  }
  if (status.startsWith('D')) {
    return 'text-red-600'
  }
  if (status.startsWith('R') || status.startsWith('C')) {
    return 'text-sky-600'
  }
  return 'text-amber-600'
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`
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
