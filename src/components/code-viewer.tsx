import { useEffect, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { LanguageDescription } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { languages } from '@codemirror/language-data'

export default function CodeViewer({
  path,
  value,
}: {
  path: string
  value: string
}) {
  const [language, setLanguage] = useState<Extension | null>(null)

  useEffect(() => {
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
  }, [path])

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
    />
  )
}
