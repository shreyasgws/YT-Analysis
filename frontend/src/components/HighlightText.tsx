interface HighlightTextProps {
  text: string
  query: string
}

export function HighlightText({ text, query }: HighlightTextProps) {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return <>{text}</>

  const lowerText = text.toLowerCase()
  const lowerQuery = trimmedQuery.toLowerCase()
  const parts: React.ReactNode[] = []
  let cursor = 0
  let key = 0

  while (cursor < text.length) {
    const found = lowerText.indexOf(lowerQuery, cursor)
    if (found === -1) {
      parts.push(text.slice(cursor))
      break
    }
    if (found > cursor) {
      parts.push(text.slice(cursor, found))
    }
    parts.push(<mark key={key++}>{text.slice(found, found + trimmedQuery.length)}</mark>)
    cursor = found + trimmedQuery.length
  }

  return <>{parts}</>
}
