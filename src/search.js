import PinyinMatch from 'pinyin-match'
// 带扩展名：这个模块也会被 node 直接跑（tests/ 下的用例），Node 的 ESM 不补 .js
import { ITEM_TYPES, getGroupKeywords, getVisibleGroupItems } from './data.js'

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

// groupsById 既可能是 Map，也可能是数组：两种都在用，统一在这里取
function findGroup (groupsById, id) {
  if (!groupsById || !id) return null
  if (typeof groupsById.get === 'function') return groupsById.get(id) || null
  return groupsById.find?.((entry) => entry?.id === id) || null
}

// 分组入口能匹配的关键词：条目自己存的名字快照 + 目标分组本身的名字和别名。
// 别名只存在分组上，条目里没有抄一份，所以按别名搜某个分组必须回查目标分组
function groupEntryKeywords (item, groupsById) {
  const target = findGroup(groupsById, item?.groupId)
  if (!target) return []
  return [target.name, ...(target.aliases || [])]
}

export function matchesSearchItem (item, keyword, groupsById) {
  if (!String(keyword || '').trim()) return true
  if (
    matchesText(item.name, keyword) ||
    matchesText(item.path, keyword) ||
    matchesText(item.command || '', keyword)
  ) return true
  // 只认「指向某个分组的入口」：普通条目的 groupId 是所属分组，不是一个可以进去的分组
  if (item.type !== ITEM_TYPES.GROUP) return false
  return groupEntryKeywords(item, groupsById).some((text) => matchesText(text, keyword))
}

// 优先认完整分组名 / 别名，再认唯一的模糊匹配。按最长前缀尝试，兼容名字本身带空格。
function resolvePanelScope (group, groupsById, query) {
  const candidates = new Map([[group.id, group]])
  getVisibleGroupItems(group, groupsById).forEach((item) => {
    if (item.type !== ITEM_TYPES.GROUP) return
    const target = findGroup(groupsById, item.groupId)
    if (target) candidates.set(target.id, target)
  })
  const prefixes = [{ head: query, rest: '' }]
  for (const match of query.matchAll(/\s+/g)) {
    prefixes.push({ head: query.slice(0, match.index), rest: query.slice(match.index).trim() })
  }
  prefixes.sort((a, b) => b.head.length - a.head.length)
  for (const exact of [true, false]) {
    for (const { head, rest } of prefixes) {
      // 单独的模糊词仍按项目搜索，只有带空格的输入才尝试模糊限定分组。
      if (!exact && !rest) continue
      const hits = [...candidates.values()].filter((target) => getGroupKeywords(target).some((name) => (
        exact
          ? name.toLocaleLowerCase() === head.toLocaleLowerCase()
          : matchesText(name, head)
      )))
      if (hits.length === 1) return { target: hits[0], rest }
    }
  }
  return null
}

// 盒子、列表、键盘导航和图标预取共用这一份结果；子分组只展开一层。
// 每个盒子直接携带筛好的 items，避免渲染时再次用分组名过滤盒子内容。
export function searchGroupPanel (group, groupsById, query, expandGroups = true) {
  const text = String(query || '').trim()
  const scope = text ? resolvePanelScope(group, groupsById, text) : null
  const keyword = scope?.target.id === group.id ? scope.rest : text
  const own = []
  const boxes = []
  const items = []
  const owners = new Map()
  const append = (item, owner) => {
    items.push(item)
    owners.set(item.id, owner.id)
  }

  getVisibleGroupItems(group, groupsById).forEach((item) => {
    const scopedChild = scope && scope.target.id !== group.id
    if (scopedChild && (item.type !== ITEM_TYPES.GROUP || item.groupId !== scope.target.id)) return
    const target = item.type === ITEM_TYPES.GROUP ? findGroup(groupsById, item.groupId) : null
    const children = target && target.id !== group.id ? getVisibleGroupItems(target, groupsById) : []
    if ((expandGroups || scopedChild) && children.length) {
      const childKeyword = scopedChild
        ? scope.rest
        : matchesSearchItem(item, keyword, groupsById) ? '' : keyword
      const listed = children.filter((child) => matchesSearchItem(child, childKeyword, groupsById))
      if (!listed.length) return
      boxes.push({ key: item.id, entry: item, target, items: listed })
      listed.forEach((child) => append(child, target))
    } else if ((!scopedChild || !scope.rest) && matchesSearchItem(item, keyword, groupsById)) {
      own.push(item)
      append(item, group)
    }
  })
  return { own, boxes, items, owners }
}
