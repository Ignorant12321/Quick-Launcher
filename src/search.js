import PinyinMatch from 'pinyin-match'

export function matchesText (text, keyword) {
  const needle = String(keyword || '').trim().toLocaleLowerCase()
  if (!needle) return true

  const value = typeof text === 'string' ? text : ''
  if (!value) return false
  if (value.toLocaleLowerCase().includes(needle)) return true

  try {
    return Boolean(PinyinMatch.match(value, needle))
  } catch {
    return false
  }
}

export function matchesSearchItem (item, keyword) {
  if (!String(keyword || '').trim()) return true
  return (
    matchesText(item.name, keyword) ||
    matchesText(item.path, keyword) ||
    matchesText(item.command || '', keyword)
  )
}
