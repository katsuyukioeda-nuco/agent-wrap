import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Todo, User } from '../schema'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : '不明なエラーが発生しました'
}

export default function App() {
  const [users, setUsers] = useState<User[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [userList, todoList] = await Promise.all([
          api<User[]>('/users'),
          api<Todo[]>('/todos'),
        ])

        if (cancelled) {
          return
        }

        setUsers(userList)
        setTodos(todoList)
        setAuthorId((current) => current || userList[0]?.id || '')
      } catch (loadError) {
        if (!cancelled) {
          setError(toMessage(loadError))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = title.trim()

    if (!trimmed || !authorId) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const todo = await api<Todo>('/todos', {
        method: 'POST',
        body: JSON.stringify({ title: trimmed, authorId }),
      })
      setTodos((current) => [todo, ...current])
      setTitle('')
    } catch (submitError) {
      setError(toMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError(null)

    try {
      await api<void>(`/todos/${id}`, { method: 'DELETE' })
      setTodos((current) => current.filter((todo) => todo.id !== id))
    } catch (deleteError) {
      setError(toMessage(deleteError))
    } finally {
      setDeletingId(null)
    }
  }

  function authorName(id: string): string {
    return users.find((user) => user.id === id)?.name ?? '不明なユーザー'
  }

  return (
    <div className="bg-muted/30 min-h-screen">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Todos</h1>
          <p className="text-muted-foreground text-sm">
            Vite + React + Hono + MySQL + shadcn/ui
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>新しい Todo</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="やることを入力"
                aria-label="タイトル"
                maxLength={255}
              />
              <div className="flex gap-3">
                <select
                  value={authorId}
                  onChange={(event) => setAuthorId(event.target.value)}
                  aria-label="投稿者"
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 min-w-0 flex-1 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                >
                  {users.length === 0 && <option value="">ユーザーがいません</option>}
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="submit"
                  disabled={submitting || !title.trim() || !authorId}
                >
                  <Plus />
                  {submitting ? '追加中…' : '追加'}
                </Button>
              </div>
            </form>

            {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>一覧</CardTitle>
            <span className="text-muted-foreground text-sm">{todos.length} 件</span>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">読み込み中…</p>
            ) : todos.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Todo はまだありません。上のフォームから追加してください。
              </p>
            ) : (
              <ul className="divide-y">
                {todos.map((todo) => (
                  <li
                    key={todo.id}
                    className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="font-medium break-words">{todo.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {authorName(todo.authorId)} ·{' '}
                        {dateFormatter.format(new Date(todo.createdAt))}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${todo.title} を削除`}
                      disabled={deletingId === todo.id}
                      onClick={() => void handleDelete(todo.id)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
