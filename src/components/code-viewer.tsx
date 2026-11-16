import { useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { LanguageDescription } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import type { ViewUpdate } from '@codemirror/view'
import { languages } from '@codemirror/language-data'

export interface CodeSelection {
  text: string
  fromLine: number
  toLine: number
}

export default function CodeViewer({
  path,
  value,
  onSelectionChange,
}: {
  path: string
  value: string
  onSelectionChange?: (selection: CodeSelection | null) => void
}) {
  const [language, setLanguage] = useState<Extension | null>(null)
  const lastSelection = useRef('')

  useEffect(() => {
    lastSelection.current = ''
    onSelectionChange?.(null)

    const filename = path.split('/').pop() ?? path
    const description = LanguageDescription.matchFilename(languages, filename)

    if (!description) {
      setLanguage(null)
      return
    }

    let cancelled = false

    description
      .load()
      .then((extension) => {
        if (!cancelled) {
          setLanguage(extension)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLanguage(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [path, onSelectionChange])

  function handleUpdate(update: ViewUpdate): void {
    const selection = update.state.selection.main
    const key = `${selection.from}:${selection.to}`

    if (key === lastSelection.current) {
      return
    }
    lastSelection.current = key

    if (selection.empty) {
      onSelectionChange?.(null)
      return
    }

    const text = update.state.sliceDoc(selection.from, selection.to)

    if (!text.trim()) {
      onSelectionChange?.(null)
      return
    }

    const end = selection.to > selection.from ? selection.to - 1 : selection.to

    onSelectionChange?.({
      text,
      fromLine: update.state.doc.lineAt(selection.from).number,
      toLine: update.state.doc.lineAt(end).number,
    })
  }

  return (
    <CodeMirror
      value={value}
      height="100%"
      theme="light"
      editable={false}
      readOnly
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        highlightSelectionMatches: false,
        autocompletion: false,
        closeBrackets: false,
        history: false,
        indentOnInput: false,
        syntaxHighlighting: true,
        bracketMatching: true,
        drawSelection: true,
        allowMultipleSelections: false,
        rectangularSelection: false,
        crosshairCursor: false,
        dropCursor: false,
      }}
      extensions={language ? [language] : []}
      className="text-[12px]"
      onUpdate={handleUpdate}
    />
  )
}
