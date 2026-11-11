export interface ServerSentEvent {
  event?: string
  data: string
}

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

async function dispatch(
  chunk: string,
  onEvent: (event: ServerSentEvent) => void | Promise<void>,
): Promise<void> {
  let event: string | undefined
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

    if (field === 'event') {
      event = value
    } else if (field === 'data') {
      data.push(value)
    }
  }

  if (data.length > 0) {
    await onEvent({ event, data: data.join('\n') })
  }
}

export async function readServerSentEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ServerSentEvent) => void | Promise<void>,
): Promise<void> {
  const reader = body.getReader()
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
        await dispatch(chunk, onEvent)
        boundary = findBoundary(buffer)
      }
    }

    if (buffer.trim()) {
      await dispatch(buffer, onEvent)
    }
  } finally {
    reader.releaseLock()
  }
}
