import { ITEM_TYPES, getVisibleGroupItems, isGroupActive } from './data.js'

export const OPEN_GROUP_PREFIX = '进入分组：'
export const LAUNCH_GROUP_PREFIX = '启动分组：'

export function getLaunchTargets (group) {
  return (group?.items || []).filter((item) => item.type !== ITEM_TYPES.GROUP)
}

export function isPanelEligible (group, groupList) {
  if (!group || !isGroupActive(group)) return false
  const byId = new Map((groupList || []).map((entry) => [entry.id, entry]))
  return getVisibleGroupItems(group, byId).length > 0
}

export function getGroupPushActions (group, { query = '', scope = null, soloTarget = null, hasEntries = true } = {}) {
  const hasQuery = Boolean(query.trim())
  const soloQuickLaunch = hasQuery && soloTarget?.quickLaunch && isGroupActive(soloTarget)
  if (hasQuery && hasEntries && !soloQuickLaunch) return []

  const target = soloQuickLaunch ? soloTarget : (scope?.target || group)
  const enterQuery = soloQuickLaunch ? '' : (scope?.rest ?? query)
  const actions = []
  if ((!hasQuery || soloQuickLaunch) && target.quickLaunch && getLaunchTargets(target).length) {
    actions.push({
      icon: 'push-icons/launch.png',
      text: `${LAUNCH_GROUP_PREFIX}${target.name}`,
      title: `一键启动「${target.name}」`,
      selection: { launchGroup: true, ownerId: target.id }
    })
  }
  actions.push({
    icon: 'push-icons/group.png',
    text: `${OPEN_GROUP_PREFIX}${target.name}`,
    title: hasQuery && !soloQuickLaunch
      ? (scope ? `「${target.name}」里没有匹配项，进入该分组搜索` : '没有匹配项，进入分组搜索')
      : '进入分组并使用搜索',
    selection: { enterGroup: true, ownerId: target.id, query: enterQuery }
  })
  return actions
}
