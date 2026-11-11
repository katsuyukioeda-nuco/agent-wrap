import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Bot,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Send,
  Square,
  XCircle,
} from 'lucide-react'
import type { AgentStreamEvent } from '../../shared/agents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useApp } from '@/hooks/use-app'
import { api } from '@/lib/api'
import { providerLabels, sessionStorageKey } from '@/lib/app'
import { streamChat } from '@/lib/chat'
import { cn } from '@/lib/utils'

interface ToolState {
  id: string
  name: string
  status: 'running' | 'ok' | 'failed'
  detail?: string
  output?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  reasoning: string
  tools: ToolState[]
}

const suggestions = [
  'このリポジトリの構成を説明して',
  '未コミットの差分をレビューして',
  'README の改善案を出して',
]

export default function ChatScreen() {
  const { detail } = useApp()
  const appId = detail.app.id
  const storageKey = sessionStorageKey(appId)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | undefined>(() => {
    return window.localStorage.getItem(storageKey) ?? undefined
  })
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  function updateAssistant(
    id: string,
    updater: (message: ChatMessage) => ChatMessage,
  ): void {
    setMessages((current) =>
      current.map((message) => (message.id === id ? updater(message) : message)),
    )
  }

  function handleEvent(event: AgentStreamEvent, assistantId: string): void {
    switch (event.type) {
      case 'session':
        setSessionId(event.sessionId)
        window.localStorage.setItem(storageKey, event.sessionId)
        break
      case 'delta':
        updateAssistant(assistantId, (message) => ({
          ...message,
          text: message.text + event.text,
        }))
        break
      case 'reasoning':
        updateAssistant(assistantId, (message) => ({
          ...message,
          reasoning: message.reasoning + event.text,
        }))
        break
      case 'tool.started':
        updateAssistant(assistantId, (message) => {
          const existing = event.id
            ? message.tools.find((tool) => tool.id === event.id)
            : undefined
          if (existing) {
            return {
              ...message,
              tools: message.tools.map((tool) =>
                tool.id === event.id
                  ? { ...tool, status: 'running', name: event.name, detail: event.detail }
                  : tool,
              ),
            }
          }
          return {
            ...message,
            tools: [
              ...message.tools,
              {
                id: event.id ?? `tool-${message.tools.length}`,
                name: event.name,
                status: 'running',
                detail: event.detail,
              },
            ],
          }
        })
        break
      case 'tool.output':
        updateAssistant(assistantId, (message) => ({
          ...message,
          tools: message.tools.map((tool) =>
            event.id && tool.id !== event.id
              ? tool
              : { ...tool, output: (tool.output ?? '') + event.text },
          ),
        }))
        break
      case 'tool.completed':
        updateAssistant(assistantId, (message) => {
          const existing = event.id
            ? message.tools.find((tool) => tool.id === event.id)
            : undefined
          if (!existing) {
            return {
              ...message,
              tools: [
                ...message.tools,
                {
                  id: event.id ?? `tool-${message.tools.length}`,
                  name: event.name,
                  status: event.ok === false ? 'failed' : 'ok',
                },
              ],
            }
          }
          return {
            ...message,
            tools: message.tools.map((tool) =>
              tool.id === existing.id
                ? { ...tool, status: event.ok === false ? 'failed' : 'ok' }
                : tool,
            ),
          }
        })
        break
      case 'permission':
        setPermission(event.message)
        break
      case 'error':
        setError(event.message)
        break
    }
  }

  async function sendMessage(): Promise<void> {
    const text = input.trim()
    if (!text || streaming) {
      return
    }

    setInput('')
    setError(null)
    setPermission(null)

    const assistantId = crypto.randomUUID()
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      reasoning: '',
      tools: [],
    }
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      reasoning: '',
      tools: [],
    }

    setMessages((current) => [...current, userMessage, assistantMessage])
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat(
        appId,
        { message: text, sessionId },
        (event) => handleEvent(event, assistantId),
        controller.signal,
      )
    } catch (streamError) {
      if (controller.signal.aborted) {
        return
      }
      setError(
        streamError instanceof Error ? streamError.message : String(streamError),
      )
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void sendMessage()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void sendMessage()
    }
  }

  async function handleStop(): Promise<void> {
    abortRef.current?.abort()
    if (sessionId) {
      await api<void>(`/apps/${appId}/chat/interrupt`, {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }).catch(() => undefined)
    }
  }

  function handleReset(): void {
    abortRef.current?.abort()
    if (sessionId) {
      void api<void>(`/apps/${appId}/chat/interrupt`, {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }).catch(() => undefined)
    }
    window.localStorage.removeItem(storageKey)
    setSessionId(undefined)
    setMessages([])
    setError(null)
    setPermission(null)
    setInput('')
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Chat</h1>
          <Badge variant="secondary">{providerLabels[detail.app.provider]}</Badge>
          {sessionId && (
            <span className="text-muted-foreground font-mono text-[11px]">
              {sessionId.slice(0, 20)}…
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleReset} disabled={streaming}>
          <RotateCcw />
          新しい会話
        </Button>
      </header>

      <Card className="min-h-[28rem]">
        <CardContent className="flex flex-col gap-6 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
              <div className="bg-secondary flex size-12 items-center justify-center rounded-full">
                <Bot className="size-6" />
              </div>
              <div>
                <p className="font-medium">{detail.app.name} と会話する</p>
                <p className="text-muted-foreground mt-1 max-w-md text-sm">
                  {detail.app.workingDir} を作業ディレクトリとして{' '}
                  {providerLabels[detail.app.provider]} に接続します。
                </p>
              </div>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInput(suggestion)
                      textareaRef.current?.focus()
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                streaming={streaming}
                isLast={message.id === messages[messages.length - 1]?.id}
              />
            ))
          )}

          {permission && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
              {permission} OpenCode 側で許可すると続行します。
            </div>
          )}

          {error && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="bg-background rounded-xl border p-3 shadow-sm">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力（Enter で送信、Shift+Enter で改行）"
          className="min-h-20 resize-none border-0 shadow-none focus-visible:ring-0"
          disabled={streaming}
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            {providerLabels[detail.app.provider]} に接続しています
          </p>
          <div className="flex items-center gap-2">
            {streaming && (
              <Button type="button" variant="outline" size="sm" onClick={() => void handleStop()}>
                <Square />
                停止
              </Button>
            )}
            <Button type="submit" size="sm" disabled={streaming || !input.trim()}>
              {streaming ? <Loader2 className="animate-spin" /> : <Send />}
              送信
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

function MessageBubble({
  message,
  streaming,
  isLast,
}: {
  message: ChatMessage
  streaming: boolean
  isLast: boolean
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    )
  }

  const thinking = streaming && isLast && !message.text && message.tools.length === 0

  return (
    <div className="flex gap-3">
      <div className="bg-secondary flex size-8 shrink-0 items-center justify-center rounded-full">
        <Bot className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        {message.reasoning && (
          <details className="text-muted-foreground mb-2 text-xs">
            <summary className="cursor-pointer select-none">推論</summary>
            <pre className="mt-1 font-sans whitespace-pre-wrap">{message.reasoning}</pre>
          </details>
        )}

        {message.tools.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {message.tools.map((tool) => (
              <div
                key={tool.id}
                className="bg-muted/60 flex flex-col gap-1 rounded-md px-2 py-1.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  {tool.status === 'running' ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  ) : tool.status === 'ok' ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="text-destructive size-3.5 shrink-0" />
                  )}
                  <span className="font-mono">{tool.name}</span>
                  {tool.detail && (
                    <span className="text-muted-foreground truncate">{tool.detail}</span>
                  )}
                </div>
                {tool.output && (
                  <details className="text-muted-foreground">
                    <summary className="cursor-pointer select-none">出力</summary>
                    <pre className="mt-1 max-h-56 overflow-auto font-mono whitespace-pre-wrap">
                      {tool.output}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {thinking ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-3.5 animate-spin" />
            考え中…
          </div>
        ) : (
          message.text && (
            <div className={cn('text-sm leading-relaxed whitespace-pre-wrap')}>
              {message.text}
            </div>
          )
        )}
      </div>
    </div>
  )
}
