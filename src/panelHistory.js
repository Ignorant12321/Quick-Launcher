import { isGroupActive } from './data.js'
import { isPanelEligible } from './groupActions.js'

export function rememberPanel (history, current, targetId) {
  if (!current?.groupId || current.groupId === targetId) return history
  return [...history, { groupId: current.groupId, query: current.query || '' }].slice(-30)
}

export function previousPanel (history, groups) {
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index]
    const group = groups.find((candidate) => candidate.id === entry.groupId)
    if (!group || !isGroupActive(group) || !isPanelEligible(group, groups)) continue
    return { group, query: entry.query, history: history.slice(0, index) }
  }
  return null
}
