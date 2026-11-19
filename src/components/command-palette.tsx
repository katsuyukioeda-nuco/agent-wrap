import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { FileText, Loader2, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const MAX_RESULTS = 100

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  files: string[]
  loading: boolean
  error: string | null
  truncated?: boolean
  onOpenFile: (path: string) => void
}

export default function CommandPalette({
  open,
  onOpenChange,
  files,
  loading,
  error,
  truncated,
  onOpenFile,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  const results = useMemo(() => {
    const scored: { path: string; score: number }[] = []

    for (const path of files) {
      const score = scorePath(path, query)
      if (score !== null) {
        scored.push({ path, score })
      }
    }

    scored.sort(
      (a, b) => b.score - a.score || a.path.length - b.path.length,
    )

    return scored.slice(0, MAX_RESULTS).map((item) => item.path)
  }, [files, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, results])

  function openFile(path: string): void {
    onOpenFile(path)
    onOpenChange(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) =>
        results.length === 0 ? 0 : Math.min(index + 1, results.length - 1),
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const path = results[activeIndex]
      if (path) {
        openFile(path)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden sm:max-w-xl">
        <DialogTitle className="sr-only">ファイルを開く</DialogTitle>
        <DialogDescription className="sr-only">
          ワークスペース内のファイルを検索して開きます。
        </DialogDescription>

        <div className="flex items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <Input
            autoFocus
            value={query}
            aria-label="ファイル名で検索"
            placeholder="ファイル名で検索…"
            className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div
          ref={listRef}
          role="listbox"
          aria-label="ファイル"
          className="max-h-[min(24rem,50vh)] overflow-y-auto p-1"
        >
          {error ? (
            <p className="text-muted-foreground px-2 py-3 text-xs break-words">
              {error}
            </p>
          ) : loading && files.length === 0 ? (
            <p className="text-muted-foreground flex items-center gap-2 px-2 py-3 text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              読み込み中…
            </p>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">
              {query
                ? '一致するファイルがありません'
                : 'ファイルがありません'}
            </p>
          ) : (
            results.map((path, index) => {
              const active = index === activeIndex
              const directory = parentPath(path)

              return (
                <button
                  key={path}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  onMouseMove={() => {
                    if (activeIndex !== index) {
                      setActiveIndex(index)
                    }
                  }}
                  onClick={() => openFile(path)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs',
                    active ? 'bg-muted text-foreground' : 'hover:bg-muted/50',
                  )}
                >
                  <FileText className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{basename(path)}</span>
                    {directory && (
                      <span className="text-muted-foreground ml-2 font-mono text-[10px]">
                        {directory}
                      </span>
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="text-muted-foreground flex items-center justify-between gap-2 border-t px-3 py-1.5 text-[10px]">
          <span>
            {loading
              ? '読み込み中…'
              : `${results.length}${truncated ? '+' : ''} 件`}
          </span>
          <span>↑↓ 移動 · Enter 開く · Esc 閉じる</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function scorePath(path: string, rawQuery: string): number | null {
  const query = rawQuery.trim().toLowerCase()

  if (!query) {
    return 0
  }

  const name = basename(path).toLowerCase()
  const lower = path.toLowerCase()

  if (name === query) {
    return 100
  }

  if (name.startsWith(query)) {
    return 90
  }

  const nameIndex = name.indexOf(query)
  if (nameIndex !== -1) {
    return 80 - Math.min(nameIndex, 20)
  }

  const pathIndex = lower.indexOf(query)
  if (pathIndex !== -1) {
    return 50 - Math.min(pathIndex, 20)
  }

  // 部分列一致（例: "sss" → SessionScreen.tsx）
  let cursor = 0
  for (const char of query) {
    cursor = name.indexOf(char, cursor)
    if (cursor === -1) {
      return null
    }
    cursor += 1
  }

  return 20
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}
