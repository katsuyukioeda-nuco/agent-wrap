import type { AgentStreamEvent } from '../../shared/agents'

function findBoundary(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf('\n\n')
  const crlf = buffer.indexOf('\r\n\r\n')

  if (crlf !== -1 && (lf === -1 || crlf < lf)) {
    return { index: crlf, length: 4 }
  }
  if (lf !== -1) {
    return { index: lf, length: 2 }
  }
  return null
}

function parseChunk(chunk: string): AgentStreamEvent | null {
  const data: string[] = []

  for (const line of chunk.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) {
      continue
    }
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) {
      value = value.slice(1)
    }
    if (field === 'data') {
      data.push(value)
    }
  }

  if (data.length === 0) {
    return null
  }

  try {
    return JSON.parse(data.join('\n')) as AgentStreamEvent
  } catch {
    return null
  }
}

export async function streamChat(
  appId: string,
  input: { message: string; sessionId?: string },
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/apps/${appId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? `Request failed: ${response.status}`)
  }

  if (!response.body) {
    throw new Error('Streaming is not supported by this browser')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      let boundary = findBoundary(buffer)
      while (boundary) {
        const chunk = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary.length)
        const event = parseChunk(chunk)
        if (event) {
          onEvent(event)
        }
        boundary = findBoundary(buffer)
      }
    }

    if (buffer.trim()) {
      const event = parseChunk(buffer)
      if (event) {
        onEvent(event)
      }
    }
  } finally {
    reader.releaseLock()
  }
}
