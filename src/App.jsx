import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ThemeProvider } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded'
import { createAppTheme, getSurfaces } from './theme'
import {
  BACKUP_VERSION,
  GROUP_COLORS,
  GROUPS_KEY,
  ITEM_TYPES,
  ADD_TO_GROUP_FEATURE_CODE,
  createAppItem,
  createFileItem,
  createGroup,
  createGroupItem,
  createId,
  createPluginItem,
  createUrlItem,
  dropGroupEntries,
  extractGroupQuery,
  getGroupIdFromFeatureCode,
  getVisibleGroupItems,
  isApplicationTarget,
  isGroupActive,
  isHiddenGroupEntry,
  loadGroups,
  loadFullHeight,
  loadCompactHeights,
  loadSidebarCollapsed,
  loadThemeMode,
  loadViewMode,
  MAIN_PUSH_LIMIT,
  mergeImportedGroups,
  normalizeIconRadius,
  normalizeUrl,
  parseBackup,
  removeGroupFeature,
  resolveThemeMode,
  saveGroups,
  saveFullHeight,
  saveCompactHeights,
  saveSidebarCollapsed,
  saveThemeMode,
  saveViewMode,
  syncGroupFeatures,
  syncGroupEntrySnapshots,
  syncAllGroupEntries,
  validateGroupKeywords
} from './data'
import { matchesSearchItem } from './search'
import { BACKGROUND_MAX_BYTES } from './imageScale'
import Sidebar from './components/Sidebar'
import GroupContent from './components/GroupContent'
import CompactGroupPanel from './components/CompactGroupPanel'
import GroupEditorDialog from './components/GroupEditorDialog'
import GroupPickerDialog from './components/GroupPickerDialog'
import ExportGroupsDialog from './components/ExportGroupsDialog'
import EditItemDialog from './components/EditItemDialog'
import AddSoftwareDialog from './components/AddSoftwareDialog'
import { AddPluginDialog, AddUrlDialog } from './components/AddItemDialogs'
import { cacheCustomIcon, getFileIconDataUrl, getGroupFeatureIcon, getPluginLogos, refreshCustomIcons, rasterizeIconDataUrl } from './icons'
import { usePresence, useRetainedValue } from './usePresence'

function nowToastId () {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function isUtoolsMainWindow () {
  return typeof window.utools?.getWindowType !== 'function' ||
    window.utools.getWindowType() === 'main'
}

const LAUNCH_GAP = 150
const COMPACT_MIN_HEIGHT = 220
// 紧凑面板里弹窗时要临时把窗口撑回主界面高度；关掉弹窗后等退出动画走完再收回
const COMPACT_DIALOG_RESTORE_MS = 240
// 紧凑面板最高能到多少：跟屏幕可用高度走。固定 440 会把 5×5 的嵌套盒子裁掉半截
function resolveCompactMaxHeight () {
  const avail = (typeof window !== 'undefined' && window.screen?.availHeight) || 900
  return Math.max(440, Math.min(760, Math.round(avail - 120)))
}
const COMPACT_MAX_HEIGHT = resolveCompactMaxHeight()
const OPEN_GROUP_PREFIX = '进入分组：'

// 「分组关键词 + 空格 + 查询」的搜索范围：分组自己的条目 + 直接子分组里的条目，只摊开一层。
// 子分组自己的名字命中时只留一条「进入分组」，不把里面的条目全倒出来；
// 子分组的条目命中时才按命中项列出来，而且不再往下一层递归 —— 和盒子视图的搜索层级保持一致。
// 「指向已关闭分组的入口算不存在」统一走 data.js 的 isHiddenGroupEntry，这里不再自己判一遍
function collectPushEntries (group, groupsById, query) {
  const entries = []
  const own = group.items || []
  // 已在当前分组里直接放了一份入口的子分组：展开别处那一份时不再重复列它的内容。
  // 只认「自己这一层」的入口，和下面展开时用的是同一个范围
  const claimed = new Set()
  own.forEach((item) => {
    if (item.type === ITEM_TYPES.GROUP && item.groupId) claimed.add(item.groupId)
  })
  // 同一个分组实例可能在别的子分组里被展开时又遇到一次：摊开的一层里，同一个目标只展开一次
  const expanded = new Set()
  const emitted = new Set()

  const push = (item, owner) => {
    const key = item.type === ITEM_TYPES.GROUP && item.groupId
      ? `group:${item.groupId}`
      : `item:${owner.id}:${item.id}`
    if (emitted.has(key)) return
    emitted.add(key)
    entries.push({ item, owner })
  }

  // 把一层子分组里的条目按查询筛出来（不再往下递归）
  const pushChildren = (target) => {
    getVisibleGroupItems(target, groupsById)
      .filter((child) => matchesSearchItem(child, query))
      .forEach((child) => {
        // 这个子分组在当前分组里已经有一个入口了，展开的这份是重复的
        if (child.type === ITEM_TYPES.GROUP && claimed.has(child.groupId)) return
        // 摊开的一层里同一个分组只展开一次，避免「入口套入口」把同一批条目列两遍
        if (child.type === ITEM_TYPES.GROUP && child.groupId && expanded.has(child.groupId)) return
        if (child.type === ITEM_TYPES.GROUP && child.groupId) expanded.add(child.groupId)
        push(child, target)
      })
  }

  own.forEach((item) => {
    // 指向已关闭的分组：那个分组等于不存在，入口和它里面的东西都不该出现在结果里
    if (isHiddenGroupEntry(item, groupsById)) return
    if (item.type === ITEM_TYPES.GROUP && item.groupId) {
      const target = groupsById.get(item.groupId)
      const children = target?.items || []
      // 目标分组被删了 / 是空的 / 指回自己：当成普通入口，只按自己的名字匹配（不再往里展开）
      if (target && target.id !== group.id && children.length) {
        if (matchesSearchItem(item, query)) {
          push(item, group)
          return
        }
        pushChildren(target)
        return
      }
    }
    if (matchesSearchItem(item, query)) push(item, group)
  })
  return entries
}

// 在当前分组里找出唯一对应的子分组入口：先认全名，认不出再按匹配（拼音 / 包含）找，
// 只有唯一命中才算数 —— 用来做「限定范围」和「只命中一个分组时给前几条预览」
function findSubgroupEntry (group, groupsById, head) {
  const text = String(head || '').trim().toLocaleLowerCase()
  if (!text) return null
  const candidates = (group.items || []).filter((item) => {
    if (item.type !== ITEM_TYPES.GROUP || !item.groupId) return false
    // 关闭的子分组不算范围：它在 uTools 里等于不存在
    if (isHiddenGroupEntry(item, groupsById)) return false
    return Boolean(groupsById.get(item.groupId)) && item.groupId !== group.id
  })
  const exact = candidates.find((item) => item.name.trim().toLocaleLowerCase() === text)
  const fuzzy = candidates.filter((item) => matchesSearchItem(item, text))
  const picked = exact || (fuzzy.length === 1 ? fuzzy[0] : null)
  return picked ? { entry: picked, target: groupsById.get(picked.groupId) } : null
}

// 「分组关键词 + 空格 + 子分组 + 空格 + 查询」：把范围限定到那个子分组，只在它自己的条目里搜。
// 认不出子分组、或者后面没跟查询（只打到分组名）就返回 null，交回「当前分组 + 一层展开」
function pickScopedGroup (group, groupsById, query) {
  const text = String(query || '').trim()
  const spaceIndex = text.search(/\s/)
  if (spaceIndex < 1) return null
  const rest = text.slice(spaceIndex).trim()
  if (!rest) return null
  const hit = findSubgroupEntry(group, groupsById, text.slice(0, spaceIndex))
  return hit ? { target: hit.target, rest } : null
}

// 一个分组在 uTools 搜索里实际能摊到的条目：自己的条目 + 直接子分组里的条目，只摊一层，
// 而且子分组里的条目只算一次 —— 同一个子分组可能在好几个地方都放了入口。
// 这里同时服务于两件事，必须是同一个函数：
//   ① 图标同步 / 回收：搜索能列出哪些条目，就得为哪些条目准备好图标；
//   ② onMainPush 里展开一层去匹配查询。
// 不共用会怎样：搜索能搜到子分组里的条目，但图标从没生成过，推送结果就掉到 PUSH_ICONS 的通用占位图
function collectPushScopeEntries (group, groupsById) {
  const entries = []
  const seenItemIds = new Set()
  const seenGroupIds = new Set()
  const push = (item, owner) => {
    if (!item?.id || seenItemIds.has(item.id)) return
    seenItemIds.add(item.id)
    entries.push({ item, owner })
  }

  ;(group?.items || []).forEach((item) => {
    if (isHiddenGroupEntry(item, groupsById)) return
    if (item.type !== ITEM_TYPES.GROUP || !item.groupId) {
      push(item, group)
      return
    }
    const target = groupsById.get(item.groupId)
    // 已删 / 指回自己：当普通入口，只算它自己
    if (!target || target.id === group.id) {
      push(item, group)
      return
    }
    // 同一个子分组只展开一次（在别处还放了同一个入口的话，展开的内容是一样的）
    if (!seenGroupIds.has(target.id)) {
      seenGroupIds.add(target.id)
      getVisibleGroupItems(target, groupsById).forEach((child) => push(child, target))
    }
    // 入口本身也算一条：它的名字能命中查询
    push(item, group)
  })
  return entries
}

// 分组数据里的全部「分组入口」本身（不是它指向的子分组里的条目）。
// 图标同步要它：入口在推送里也是一条结果，图标得跟目标分组对齐
function collectGroupEntryItems (group, groupsById) {
  return (group?.items || []).filter((item) => (
    item.type === ITEM_TYPES.GROUP && !isHiddenGroupEntry(item, groupsById)
  ))
}

// 把展示用的文本还原成条目本名：「kjcmd」分组 · test → kjcmd。选中映射丢了时用它兜底查找
function stripPushDecoration (text) {
  // 去掉来源分组后缀（· 「kjcmd」）和同名计数后缀（(2)） —— 都是我们自己加的装饰
  const value = String(text || '')
    .replace(/\s·\s[^·]*$/, '')
    .replace(/\s\(\d+\)$/, '')
  const groupLabel = /^「(.+)」分组$/.exec(value)
  return groupLabel ? groupLabel[1] : value
}

// 一个分组能不能进紧凑面板：启用 + 不是一键启动 + 有真正画得出来的条目。
// 「有几个条目」一律按可见条目算（指向已关闭分组的入口在面板里不存在），
// 否则一个只剩死入口的分组会开出一块空面板
function isPanelEligible (group, groupList) {
  if (!group || !isGroupActive(group) || group.quickLaunch) return false
  const byId = new Map((groupList || []).map((entry) => [entry.id, entry]))
  return getVisibleGroupItems(group, byId).length > 0
}

// 进入面板时先用哪个高度：分组条目没变就沿用上次实测值（尺寸不跳），
// 否则按「112 + 行数 × 行高」估一个，等面板实测后再微调。
// 条目数一律按「可见条目」算：指向已关闭分组的入口在面板里画不出来，
// 直接数 group.items.length 会把面板撑到没人用的高度（甚至空分组也按有内容展开）
function resolveCompactHeight (group, remembered, width, groupsById) {
  if (!group) return 0
  const count = getVisibleGroupItems(group, groupsById).length
  const cached = remembered?.[group.id]
  if (cached && (cached.n < 0 || cached.n === count)) {
    return Math.min(COMPACT_MAX_HEIGHT, Math.max(COMPACT_MIN_HEIGHT, cached.h))
  }
  const isList = group.compactView === 'list'
  const columns = Math.max(1, Math.floor((Math.round(width || 720) - 30) / 80))
  // 列表视图最多铺 9 行（和面板里的上限一致），再多就滚动
  const rows = isList
    ? Math.min(count || 1, 9)
    : Math.ceil(count / columns)
  // 88 = 头部 + 内外边距（底部提示条已移除）；盒子 92 / 列表 46 = 单行高度
  return Math.min(
    COMPACT_MAX_HEIGHT,
    Math.max(COMPACT_MIN_HEIGHT, 88 + Math.max(1, rows) * (isList ? 46 : 92))
  )
}
const PUSH_ICONS = {
  [ITEM_TYPES.FILE]: 'push-icons/file.png',
  [ITEM_TYPES.FOLDER]: 'push-icons/folder.png',
  [ITEM_TYPES.APP]: 'push-icons/app.png',
  [ITEM_TYPES.URL]: 'push-icons/url.png',
  [ITEM_TYPES.PLUGIN]: 'push-icons/plugin.png',
  // 分组入口：图标没生成好之前先用通用的分组图标（之前这里缺这一项，
  // 只能落到链尾那个三元表达式上，意图看不出来）
  [ITEM_TYPES.GROUP]: 'push-icons/group.png'
}

function hashSignature (value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

function collectIconRefs (groupList) {
  const refs = new Set()
  groupList.forEach((group) => {
    if (group.customIconRef) refs.add(group.customIconRef)
    if (group.backgroundRef) refs.add(group.backgroundRef)
    group.items?.forEach((item) => {
      if (item.customIconRef) refs.add(item.customIconRef)
    })
  })
  return refs
}

function releaseUnusedIconRefs (refs, groupList) {
  const used = collectIconRefs(groupList)
  refs.filter(Boolean).forEach((ref) => {
    if (used.has(ref)) return
    cacheCustomIcon(ref, null)
    window.services?.deleteCustomIcon?.(ref)
  })
}

export default function App () {
  const [themeMode, setThemeMode] = useState(loadThemeMode)
  const [mode, setMode] = useState(() => resolveThemeMode(loadThemeMode()))
  const [groups, setGroups] = useState(loadGroups)
  const [activeId, setActiveId] = useState(() => groups[0]?.id || null)
  const [viewMode, setViewMode] = useState(loadViewMode)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)
  const [query, setQuery] = useState('')
  const [subInputSession, setSubInputSession] = useState(0)
  const [pluginActive, setPluginActive] = useState(false)
  const [compactMode, setCompactMode] = useState(false)
  const [compactOverlay, setCompactOverlay] = useState(false)
  const [entryReady, setEntryReady] = useState(() => (
    typeof window.utools?.onPluginEnter !== 'function' || !isUtoolsMainWindow()
  ))
  const [editor, setEditor] = useState(null)
  const [groupPicker, setGroupPicker] = useState(null)
  // 从「添加到分组 → 新建分组」进来的待添加项目：新分组保存后要把它们塞进去
  const [pendingPickerCreate, setPendingPickerCreate] = useState(null)
  const [editItemTarget, setEditItemTarget] = useState(null)
  const [editPluginTarget, setEditPluginTarget] = useState(null)
  // 「修改」对话框里的这一条属于哪个分组：紧凑面板的盒子会列出别的分组的条目，
  // 保存 / 删除不能一律按当前激活分组来
  const [editEntryGroupId, setEditEntryGroupId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [adding, setAdding] = useState(false)
  const [launchingId, setLaunchingId] = useState(null)
  const [toast, setToast] = useState(null)
  const [urlDialogOpen, setUrlDialogOpen] = useState(false)
  // 网址弹窗要加进哪个分组：紧凑面板盒子右键时是那个盒子，主界面 + 菜单是当前分组。
  // 存在 state 里随 props 传进弹窗、提交时原路带回，不再依赖「打开时写 ref、关闭时清 ref」那一套——
  // 提交跨了一次 await，中途关窗会把 ref 清掉，落点就漂了
  const [urlTargetGroupId, setUrlTargetGroupId] = useState(null)
  const [pluginDialogOpen, setPluginDialogOpen] = useState(false)
  const [softwareDialogOpen, setSoftwareDialogOpen] = useState(false)
  const [transferBusy, setTransferBusy] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  // 「导出配置」的分组挑选弹窗：全部 / 个别分组
  const [exportPickerOpen, setExportPickerOpen] = useState(false)

  const groupsRef = useRef(groups)
  const queryRef = useRef(query)
  const subInputActiveRef = useRef(false)
  const compactModeRef = useRef(false)
  const compactHeightRef = useRef(0)
  // 紧凑面板里为了弹窗临时撑大窗口的状态：撑大期间不跟随面板实测高度缩回去
  const compactDialogExpandedRef = useRef(false)
  const dialogRoomTimerRef = useRef(null)
  // 各分组上次实测的面板高度（离开插件 / 再次进入时复用，避免窗口先大后小）
  const compactHeightsRef = useRef(loadCompactHeights())
  // 高度先只写内存，攒 500ms 再落盘一次：拖窗口改宽时测量会连续触发，
  // 每次都读一遍 db + localStorage 再写两处太浪费
  const compactHeightsDirtyRef = useRef(false)
  const compactHeightSaveTimerRef = useRef(null)
  const activeIdRef = useRef(activeId)
  const compactOverlayTimerRef = useRef(null)
  const fullHeightRef = useRef(loadFullHeight())
  const dragDepth = useRef(0)
  const addBusyRef = useRef(false)
  const launchingRef = useRef(false)
  const themeTransitionRef = useRef(null)
  const viewTransitionRef = useRef(null)
  const shortcutMigrationRef = useRef(false)
  const mainPushSelectionRef = useRef(new Map())
  const itemFeatureIconsRef = useRef(new Map())
  const itemFeatureSignaturesRef = useRef(new Map())
  const pendingGroupQueryRef = useRef(null)
  // 在 uTools 搜索结果里点了别的分组的入口：等插件进入时落到这个分组（带时间戳，防止过期残留）
  const pendingGroupSwitchRef = useRef(null)
  const pluginActiveRef = useRef(false)
  // showToast 定义在下面（useCallback），而它上面的 effect 也可能要弹提示：
  // 渲染阶段直接引用会落进 TDZ、整棵树白屏，所以那些地方统一走这个 ref
  const showToastRef = useRef(() => {})

  // 高度落盘：先只更新内存，停手 500ms 写一次；插件退出 / 组件卸载时强制 flush
  const flushCompactHeights = useCallback(() => {
    if (compactHeightSaveTimerRef.current) {
      window.clearTimeout(compactHeightSaveTimerRef.current)
      compactHeightSaveTimerRef.current = null
    }
    if (!compactHeightsDirtyRef.current) return
    compactHeightsDirtyRef.current = false
    saveCompactHeights(compactHeightsRef.current)
  }, [])

  const scheduleCompactHeightsSave = useCallback(() => {
    compactHeightsDirtyRef.current = true
    if (compactHeightSaveTimerRef.current) return
    compactHeightSaveTimerRef.current = window.setTimeout(() => {
      compactHeightSaveTimerRef.current = null
      flushCompactHeights()
    }, 500)
  }, [flushCompactHeights])

  const theme = useMemo(() => createAppTheme(mode), [mode])
  const surfaces = useMemo(() => getSurfaces(mode), [mode])
  const activeGroup = groups.find((group) => group.id === activeId) || null
  // 分组 id → 分组。搜索推送、入口过滤、面板高度都要按 id 查目标分组是否还启用，
  // 这里算一次共用，别在每个回调里各 map 一遍
  const groupsById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups]
  )
  // 当前分组里真正用得上（目标分组仍然启用）的条目数。面板头部的「N 项」、
  // 能不能进面板、要开多高都以它为准，不能直接数 items
  const activeItemCount = activeGroup ? getVisibleGroupItems(activeGroup, groupsById).length : 0
  const anyDialogOpen = Boolean(
    editor ||
    groupPicker ||
    editItemTarget ||
    editPluginTarget ||
    deleteTarget ||
    importPreview ||
    urlDialogOpen ||
    pluginDialogOpen ||
    softwareDialogOpen
  )

  // 面板里只该出现「启用 + 有可见条目」的分组：在已关闭的当前分组上停留、
  // 或者从紧凑面板点进一个已关闭分组时，都退回完整界面 ——
  // 面板没有「已关闭」这类信息，进去只会看到一片空白，还容易以为分组被删了。
  // 注意：这里只能调 showToastRef.current —— showToast 定义在下面（useCallback），
  // 在渲染阶段直接引用会落到 TDZ 里，整棵组件树白屏
  useEffect(() => {
    if (!compactMode || !pluginActive) return
    if (isPanelEligible(activeGroup, groups)) return
    if (activeGroup) {
      try {
        window.utools?.setExpandHeight?.(fullHeightRef.current)
      } catch {}
      showToastRef.current(
        isGroupActive(activeGroup)
          ? `「${activeGroup.name}」里没有可显示的内容，已切回主界面`
          : `「${activeGroup.name}」已关闭，已切回主界面`,
        'warning'
      )
    }
    compactModeRef.current = false
    setCompactMode(false)
  }, [activeGroup, compactMode, groups, pluginActive])

  const editorPresence = usePresence(Boolean(editor), 220, entryReady)
  const retainedEditor = useRetainedValue(editor)
  const pickerPresence = usePresence(Boolean(groupPicker), 220, entryReady)
  const retainedGroupPicker = useRetainedValue(groupPicker)
  const editItemPresence = usePresence(Boolean(editItemTarget), 220, entryReady)
  const retainedEditItem = useRetainedValue(editItemTarget)
  const editPluginPresence = usePresence(Boolean(editPluginTarget), 220, entryReady)
  const retainedEditPlugin = useRetainedValue(editPluginTarget)
  const urlDialogPresence = usePresence(urlDialogOpen, 220, entryReady)
  const pluginDialogPresence = usePresence(pluginDialogOpen, 220, entryReady)
  const softwareDialogState = softwareDialogOpen
    ? { mode: 'add', target: null }
    : null
  const softwareDialogPresence = usePresence(Boolean(softwareDialogState), 220, entryReady)
  const deletePresence = usePresence(Boolean(deleteTarget), 220, entryReady)
  const retainedDeleteTarget = useRetainedValue(deleteTarget)
  const importPresence = usePresence(Boolean(importPreview), 220, entryReady)
  const retainedImportPreview = useRetainedValue(importPreview)

  useEffect(() => {
    groupsRef.current = groups
  }, [groups])

  useEffect(() => {
    queryRef.current = query
  }, [query])

  useEffect(() => {
    compactModeRef.current = compactMode
  }, [compactMode])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  useEffect(() => {
    pluginActiveRef.current = pluginActive
  }, [pluginActive])

  useEffect(() => {
    if (compactOverlayTimerRef.current) {
      window.clearTimeout(compactOverlayTimerRef.current)
      compactOverlayTimerRef.current = null
    }
    setCompactOverlay(false)
  }, [activeGroup?.id, pluginActive])

  useEffect(() => () => {
    if (compactOverlayTimerRef.current) {
      window.clearTimeout(compactOverlayTimerRef.current)
      compactOverlayTimerRef.current = null
    }
    if (dialogRoomTimerRef.current) {
      window.clearTimeout(dialogRoomTimerRef.current)
      dialogRoomTimerRef.current = null
    }
    // 卸载（插件进程结束）前把还没落盘的高度补上
    flushCompactHeights()
  }, [flushCompactHeights])

  useEffect(() => {
    let timer = null
    const handleResize = () => {
      if (compactModeRef.current) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const height = Math.round(window.innerHeight)
        if (height < 500) return
        fullHeightRef.current = height
        saveFullHeight(height)
      }, 250)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const showToast = useCallback((message, severity = 'success') => {
    setToast({ id: nowToastId(), message, severity })
  }, [])
  // 上面那些「定义在 showToast 之前」的 effect 通过它弹提示（见声明处的注释）
  showToastRef.current = showToast

  const syncFeatures = useCallback((nextGroups, options) => {
    syncGroupFeatures(nextGroups, getGroupFeatureIcon, options).then((featureError) => {
      if (featureError) showToast(`关键词功能同步失败：${featureError}`, 'warning')
    })
  }, [showToast])

  const persistGroups = useCallback((nextGroups) => {
    try {
      saveGroups(nextGroups)
      groupsRef.current = nextGroups
      setGroups(nextGroups)
      return { ok: true }
    } catch {
      showToast('保存失败，请检查应用存储空间', 'error')
      return { ok: false }
    }
  }, [showToast])

  const commitGroups = useCallback((nextGroups) => {
    const result = persistGroups(nextGroups)
    if (result.ok) syncFeatures(nextGroups)
    return result
  }, [persistGroups, syncFeatures])

  // 只拦「A 里再放一条指向 A 的入口」：那是同一层里自己套自己，点进去还是原地。
  // A 里有 B、B 里有 A 这种互相包含是允许的（渲染层用 ancestors 只展开一次，不会无限套娃），
  // 所以这里不做环路检测，只看目标是不是宿主自己。
  const groupNestError = useCallback((source, host) => (
    source?.id && host?.id && source.id === host.id
      ? `不能把「${source.name}」放进它自己`
      : ''
  ), [])

  useEffect(() => {
    if (shortcutMigrationRef.current) return
    shortcutMigrationRef.current = true

    const run = async () => {
      const targets = []
      groupsRef.current.forEach((group) => {
        group.items.forEach((item) => {
          if (!/\.lnk$/i.test(item.path)) return
          if (![ITEM_TYPES.FILE, ITEM_TYPES.FOLDER, ITEM_TYPES.APP].includes(item.type)) return
          targets.push(item.path)
        })
      })
      if (!targets.length || !window.services?.describePaths) return

      const uniquePaths = [...new Set(targets)]
      let described = []
      try {
        described = await window.services.describePaths(uniquePaths)
      } catch {
        return
      }
      if (!Array.isArray(described)) return

      const resolvedByPath = new Map()
      uniquePaths.forEach((original, index) => {
        const entry = described[index]
        if (!entry || entry.error || entry.path === original) return
        resolvedByPath.set(original, entry)
      })
      if (!resolvedByPath.size) return

      let changed = 0
      const nextGroups = groupsRef.current.map((group) => {
        let groupChanged = false
        const items = group.items.map((item) => {
          const resolved = resolvedByPath.get(item.path)
          if (!resolved) return item
          groupChanged = true
          changed += 1
          const type = isApplicationTarget(resolved)
            ? ITEM_TYPES.APP
            : (resolved.isDirectory ? ITEM_TYPES.FOLDER : ITEM_TYPES.FILE)
          return { ...item, path: resolved.path, type }
        })
        return groupChanged ? { ...group, items } : group
      })

      if (!changed) return
      const saved = commitGroups(nextGroups)
      if (saved.ok) showToast(`已自动修正 ${changed} 个快捷方式路径`)
    }

    run()
  }, [commitGroups, showToast])

  const handleViewChange = useCallback((nextView) => {
    if (nextView === viewMode) return
    const apply = () => {
      setViewMode(nextView)
      saveViewMode(nextView)
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (
      reduceMotion ||
      typeof document.startViewTransition !== 'function' ||
      themeTransitionRef.current ||
      viewTransitionRef.current
    ) {
      apply()
      return
    }

    const root = document.documentElement
    root.classList.add('view-switching')
    const transition = document.startViewTransition(() => {
      flushSync(apply)
    })
    viewTransitionRef.current = transition
    const settle = () => {
      if (viewTransitionRef.current === transition) viewTransitionRef.current = null
      root.classList.remove('view-switching')
    }
    transition.finished.then(settle, settle)
  }, [viewMode])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((previous) => {
      saveSidebarCollapsed(!previous)
      return !previous
    })
  }, [])

  const handleQueryChange = useCallback((text) => {
    setQuery(text)
    queryRef.current = text
    if (subInputActiveRef.current) {
      try {
        window.utools?.setSubInputValue?.(text)
      } catch {}
    }
  }, [])

  const handleExpandCompact = useCallback(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    compactModeRef.current = false
    if (compactOverlayTimerRef.current) {
      window.clearTimeout(compactOverlayTimerRef.current)
      compactOverlayTimerRef.current = null
    }
    if (!reduceMotion && activeGroup) {
      setCompactOverlay(true)
      compactOverlayTimerRef.current = window.setTimeout(() => {
        compactOverlayTimerRef.current = null
        setCompactOverlay(false)
      }, 170)
    } else {
      setCompactOverlay(false)
    }
    setCompactMode(false)
    try {
      window.utools?.setExpandHeight?.(fullHeightRef.current)
    } catch {}
  }, [activeGroup])

  // 主界面 → 当前分组的搜索面板：在搜索框主窗口里把窗口收成面板高度再切界面，
  // 和上面的 handleExpandCompact 正好反着来（那边是先切界面、再撑回主界面高度）。
  // 分离出来的独立窗口里 setExpandHeight 一定失败（uTools 只允许调主窗口高度），
  // 那边就只切界面、不动窗口 —— 不能直接 return，否则按钮点了像坏了。
  // 注意：这个回调要放进 launchGroup 之后的 handleRunGroup 里用（一键启动分支），
  // 位置挪到那边，别在这里定义，否则依赖数组会在 TDZ 里读 launchGroup
  const enterCompactPanel = useCallback((group) => {
    if (!group || !getVisibleGroupItems(group, groupsById).length) return
    const mainWindow = isUtoolsMainWindow()
    const height = Math.round(window.innerHeight || 0)
    // 收起前把主界面高度存下来，面板里点「展开完整界面」才能回到原来的大小。
    // 独立窗口的高度和主界面高度不是一回事，别拿它覆盖掉存好的值
    if (mainWindow && height >= 500) {
      fullHeightRef.current = height
      saveFullHeight(height)
    }
    const target = resolveCompactHeight(group, compactHeightsRef.current, window.innerWidth, groupsById)
    compactHeightRef.current = target
    compactModeRef.current = true
    if (compactOverlayTimerRef.current) {
      window.clearTimeout(compactOverlayTimerRef.current)
      compactOverlayTimerRef.current = null
    }
    setCompactOverlay(false)
    // 窗口先收，再换界面：面板一出现就是最终尺寸，不会先按主界面高度铺开再缩回去
    if (mainWindow) {
      try {
        window.utools?.setExpandHeight?.(target)
      } catch {}
    }
    // 面板里的搜索走 uTools 搜索框（subInput），主界面这份输入框的搜索词带不过去，
    // 留着只会把面板过滤成半空的样子，还没有地方清空
    setQuery('')
    setCompactMode(true)
  }, [groupsById])

  // 紧凑面板实测内容高度后回收窗口 —— 列数随窗口宽度变化，高度不能再用固定公式算
  const handleCompactHeight = useCallback((height) => {
    if (!compactModeRef.current) return
    // 独立窗口里改不了窗口高度；这里量到的还是「独立窗口宽度」下的高度，
    // 存下来会污染分组记住的面板高度，干脆整个跳过
    if (!isUtoolsMainWindow()) return
    const target = Math.round(
      Math.min(COMPACT_MAX_HEIGHT, Math.max(COMPACT_MIN_HEIGHT, height))
    )
    if (!target || Math.abs(target - compactHeightRef.current) < 3) return
    compactHeightRef.current = target
    // 记住这个分组的实际高度：下次进入 / 离开时直接用，窗口不用先大后小。
    // 记的是「可见条目数」：面板画出来的就是这个数，resolveCompactHeight 也按同一个数比对
    const group = groupsRef.current.find((item) => item.id === activeIdRef.current)
    if (group) {
      const byId = new Map(groupsRef.current.map((entry) => [entry.id, entry]))
      const count = getVisibleGroupItems(group, byId).length
      compactHeightsRef.current = {
        ...compactHeightsRef.current,
        [group.id]: { h: target, n: count }
      }
      scheduleCompactHeightsSave()
    }
    try {
      if (!compactDialogExpandedRef.current) {
        window.utools?.setExpandHeight?.(target)
      }
    } catch {}
  }, [scheduleCompactHeightsSave])

  // 紧凑面板里打开弹窗（修改分组 / 修改条目 / 选择分组…）时，窗口只有面板那么高，
  // 对话框会被压得很扁。这里临时把窗口撑回主界面高度，弹窗全部关掉后再收回面板高度。
  // 收回延迟到退出动画之后：否则窗口缩小的瞬间会把还在淡出的对话框裁掉。
  // 只影响窗口尺寸，compactMode 不变 —— 面板仍在后面，不用真的进主界面
  useLayoutEffect(() => {
    const clearRoomTimer = () => {
      if (!dialogRoomTimerRef.current) return
      window.clearTimeout(dialogRoomTimerRef.current)
      dialogRoomTimerRef.current = null
    }
    // 非主窗口（分离窗口）/ 不在紧凑面板 / 面板已经隐藏时不接管窗口尺寸
    if (!pluginActive || !compactMode || !isUtoolsMainWindow()) {
      clearRoomTimer()
      compactDialogExpandedRef.current = false
      return undefined
    }
    if (anyDialogOpen) {
      clearRoomTimer()
      if (compactDialogExpandedRef.current) return undefined
      compactDialogExpandedRef.current = true
      // 面板本身可能比记住的主界面高度还高（条目多时能到 760），别反而把窗口缩小
      const target = Math.max(Math.round(window.innerHeight || 0), fullHeightRef.current)
      try {
        window.utools?.setExpandHeight?.(target)
      } catch {}
      return undefined
    }
    if (!compactDialogExpandedRef.current) return undefined
    clearRoomTimer()
    dialogRoomTimerRef.current = window.setTimeout(() => {
      dialogRoomTimerRef.current = null
      if (!compactDialogExpandedRef.current) return
      compactDialogExpandedRef.current = false
      try {
        window.utools?.setExpandHeight?.(
          compactHeightRef.current || COMPACT_MIN_HEIGHT
        )
      } catch {}
    }, COMPACT_DIALOG_RESTORE_MS)
    return undefined
  }, [anyDialogOpen, compactMode, pluginActive])

  // 盒子里的平铺 / 列表：存在那条分组入口条目上，随分组数据一起导出。
  // （面板顶上「当前分组」的视图切换是临时的、不落盘 —— 真正的默认值在「搜索外观设置」里）
  const handleCompactBoxView = useCallback((entry, nextView) => {
    if (!entry?.id) return
    const groupId = activeIdRef.current
    if (!groupId) return
    const value = nextView === 'list' ? 'list' : 'grid'
    const nextGroups = groupsRef.current.map((group) => (
      group.id === groupId
        ? {
            ...group,
            items: group.items.map((item) => (
              item.id === entry.id ? { ...item, boxView: value } : item
            ))
          }
        : group
    ))
    persistGroups(nextGroups)
  }, [persistGroups])

  const applyThemeMode = useCallback((nextMode, nextPreference, event) => {
    const root = document.documentElement
    const source = event?.currentTarget || root.querySelector('.theme-toggle-icon')
    const rect = source?.getBoundingClientRect?.()
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
    const radius = Math.ceil(Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    ))

    root.style.setProperty('--theme-reveal-x', `${x}px`)
    root.style.setProperty('--theme-reveal-y', `${y}px`)
    root.style.setProperty('--theme-reveal-r', `${radius}px`)

    const apply = () => {
      flushSync(() => {
        setMode(nextMode)
        if (nextPreference) setThemeMode(nextPreference)
      })
      if (nextPreference) saveThemeMode(nextPreference)
      root.dataset.theme = nextMode
      root.style.colorScheme = nextMode
    }

    if (nextMode === mode) {
      if (nextPreference && nextPreference !== themeMode) {
        flushSync(() => setThemeMode(nextPreference))
        saveThemeMode(nextPreference)
      }
      return
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (typeof document.startViewTransition !== 'function' || reduceMotion) {
      const icon = root.querySelector('.theme-toggle-icon')
      if (icon && !reduceMotion) {
        icon.classList.remove('anim-rotate')
        void icon.offsetWidth
        icon.classList.add('anim-rotate')
        window.setTimeout(() => icon.classList.remove('anim-rotate'), 520)
      }
      apply()
      return
    }

    if (themeTransitionRef.current) {
      try {
        themeTransitionRef.current.skipTransition()
      } catch {}
      themeTransitionRef.current = null
    }

    root.classList.add('theme-no-transition')
    const themeIcon = root.querySelector('.theme-toggle-icon')
    if (themeIcon) themeIcon.style.viewTransitionName = 'theme-toggle-icon'
    try {
      const transition = document.startViewTransition(apply)
      themeTransitionRef.current = transition
      const settle = () => {
        if (themeTransitionRef.current === transition) themeTransitionRef.current = null
        root.classList.remove('theme-no-transition')
        if (themeIcon) themeIcon.style.viewTransitionName = ''
      }
      transition.finished.then(settle, settle)
      if (transition.ready) transition.ready.catch(() => {})
      if (transition.updateCallbackDone) transition.updateCallbackDone.catch(() => {})
      if (transition.skipped) transition.skipped.catch(() => {})
    } catch {
      root.classList.remove('theme-no-transition')
      if (themeIcon) themeIcon.style.viewTransitionName = ''
      apply()
    }
  }, [mode, themeMode])

  const handleThemeChange = useCallback((nextPreference, event) => {
    applyThemeMode(resolveThemeMode(nextPreference), nextPreference, event)
  }, [applyThemeMode])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return undefined

    const handleChange = (event) => {
      if (themeMode !== 'auto') return
      applyThemeMode(event.matches ? 'dark' : 'light', null, null)
    }

    media.addEventListener?.('change', handleChange)
    return () => media.removeEventListener?.('change', handleChange)
  }, [themeMode, applyThemeMode])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = mode
    document.documentElement.style.colorScheme = mode
  }, [mode])

  const launchItem = useCallback(async (item) => {
    // 分组入口：不启动任何东西，直接切到那个分组
    if (item.type === ITEM_TYPES.GROUP) {
      const target = groupsRef.current.find((group) => group.id === item.groupId)
      if (!target) return '该分组已不存在'
      setActiveId(target.id)
      setQuery('')
      return ''
    }

    if (item.type === ITEM_TYPES.URL) {
      if (item.browserMode && item.browserMode !== 'default') {
        return window.services.openUrlWithBrowser(item.path, item.browserMode)
      }
      if (item.openWith) {
        return window.services.openPathWith(item.path, item.openWith)
      }
      try {
        await window.utools.shellOpenExternal(item.path)
        return ''
      } catch {
        return '无法打开网址，请检查链接是否有效'
      }
    }

    if (item.type === ITEM_TYPES.PLUGIN) {
      const redirect = window.utools?.redirect
      if (typeof redirect !== 'function') return '当前环境无法跳转 uTools 插件'
      try {
        const label = item.command || item.path
        if (item.path && item.command && item.path !== item.command) {
          redirect([item.path, item.command])
        } else {
          redirect(label)
        }
        return ''
      } catch {
        return '无法跳转到该插件，请检查名称和指令'
      }
    }

    if (item.type === ITEM_TYPES.APP) {
      if (item.openWith) {
        return window.services.openPathWith(item.path, item.openWith)
      }
      return window.services.openPath(item.path)
    }

    if (item.openWith) {
      return window.services.openPathWith(item.path, item.openWith)
    }
    return window.services.openPath(item.path)
  }, [])

  const launchGroup = useCallback(async (group) => {
    const utools = window.utools
    // 关闭的分组不启动任何东西（分组头部按钮 / 进入事件都走这里兜一层）
    if (!isGroupActive(group)) return
    utools?.hideMainWindow?.()

    // 插件跳转会离开当前插件应用，因此放到最后处理；分组入口不是启动目标，直接跳过
    const plainItems = (group.items || []).filter((item) => (
      item.type !== ITEM_TYPES.PLUGIN && item.type !== ITEM_TYPES.GROUP
    ))
    const pluginItems = (group.items || []).filter((item) => item.type === ITEM_TYPES.PLUGIN)

    for (const item of [...plainItems, ...pluginItems]) {
      try {
        await launchItem(item)
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, LAUNCH_GAP))
    }

    utools?.outPlugin?.()
  }, [launchItem])

  // 分组头部的「运行」：两条出路，按这个分组自己的开关走 ——
  // 一键启动开着：直接把分组里的条目全部启动（和从 uTools 搜索进入这个分组时同一套行为），不进面板；
  // 否则：进本分组的搜索面板，搜索 / 逐个启动都在里面
  const handleRunGroup = useCallback(() => {
    const group = activeGroup
    if (!group || !activeItemCount) return
    if (!isGroupActive(group)) {
      showToast(`「${group.name}」已关闭`, 'warning')
      return
    }
    if (group.quickLaunch) {
      launchGroup(group)
      return
    }
    enterCompactPanel(group)
  }, [activeGroup, activeItemCount, enterCompactPanel, launchGroup, showToast])

  useEffect(() => {
    // 首帧也走立即同步：此时分组是同步加载好的，可以马上清掉 uTools 里已经没有对应分组的旧功能
    syncFeatures(groupsRef.current, { immediate: true })
  }, [syncFeatures])

  useEffect(() => {
    let active = true
    const icons = itemFeatureIconsRef.current
    const signatures = itemFeatureSignaturesRef.current
    const alive = new Set()
    let pluginLogosPromise = null

    const loadPluginLogos = () => {
      if (!pluginLogosPromise) pluginLogosPromise = getPluginLogos()
      return pluginLogosPromise
    }

    // 删掉的条目不会自己清图标：改动停下来 1.5s 后回收一次旧图 / 孤儿文件（失败不影响功能）。
    // 只保留「开启搜索」的分组条目图标：关掉搜索后旧图会在下一次清理时回收；
    // 分组被删光时也要清一次，否则 push-icons 会一直留着。
    // 只有 dbStorage 里确实是分组数组时才清：冷启动读取失败会退回「初始分组」，
    // 那种空列表不能拿来当清理依据，否则会把图标缓存整个抹掉。
    let storedGroups = null
    try {
      storedGroups = window.utools?.dbStorage?.getItem(GROUPS_KEY)
    } catch {}

    // 搜索能列出哪些条目，就得为哪些条目准备图标 —— 和 onMainPush 用同一个「摊开一层」的规则。
    // 这里以前只遍历 group.items，于是子分组里的条目从来没生成过推送图标：
    // 搜索能搜到它们，选中前预览却只能显示 PUSH_ICONS 的通用占位图
    const groupsById = new Map(groups.map((group) => [group.id, group]))
    const pushScopes = groups
      .filter((group) => isGroupActive(group) && group.keywordMatch)
      .map((group) => ({
        group,
        entries: collectPushScopeEntries(group, groupsById)
      }))
    // 回收用的 id 集合必须和生成用的完全一致：少一个就会把刚生成的图当孤儿删掉，
    // 表现成「图标今天有、明天又变回占位图」
    const activePushItemIds = [...new Set(
      pushScopes.flatMap(({ group, entries }) => [
        // 分组入口本身在推送里也是一条结果，它的图标要一起保住
        ...collectGroupEntryItems(group, groupsById).map((item) => item.id),
        ...entries.map(({ item }) => item.id)
      ])
    )]
    const pruneTimer = Array.isArray(storedGroups) && isUtoolsMainWindow()
      ? setTimeout(() => {
        Promise.resolve(window.services?.prunePushIcons?.(activePushItemIds)).catch(() => {})
      }, 1500)
      : 0

    pushScopes.forEach(({ group, entries }) => {
      // 分组入口本身也要算进来：它在推送里是一条「进入 XX 分组」的结果。
      // 画的是它自己身上那份外观（建入口时从目标分组抄过来的 icon / color / customIconRef），
      // 所以和分组本体看起来一致，这里不需要再按 groupId 去解析目标分组
      const targets = [
        ...collectGroupEntryItems(group, groupsById),
        ...entries.map(({ item }) => item)
      ]
      targets.forEach((item) => {
        alive.add(item.id)
        const source = item.iconSource ||
          (item.type === ITEM_TYPES.URL ? 'builtin' : 'native')
        const signature = [
          item.type,
          item.path,
          item.icon || '',
          item.color || '',
          source,
          item.customIconRef || '',
          item.customIconRadius || 0,
          item.iconRadius ?? ''
        ].join('|')
        const name = `push-${item.id}-${hashSignature(signature)}`
        // 签名一致 ≠ 图标真的在：上一版会在中断时把签名记下来却没落盘（见下），
        // 所以这里再确认一次「内存里或磁盘上确实有这张图」，缺了就重新生成一遍。
        // 已经有内存映射的不必再去 stat，正常情况下这里不会多花任何代价
        if (signatures.get(item.id) === signature) {
          if (icons.get(item.id) || window.services?.getPushIconUrl?.(name)) return
        }
        // 这里刻意「先不记账」。上一版是先生成签名、再异步落盘，于是这套流程有个致命的中断窗口：
        // 进入插件时 reloadGroups 会 setGroups 出一个新数组，[groups] 的 effect 立刻重跑、
        // 把上一轮的 active 置 false；上一轮已经花出去的那 36 条签名却留在签名表里。
        // 结果只有纯 canvas 绘制的分组入口来得及写完，所有要走 getFileIconDataUrl（IPC）的条目
        // 都在第一个 await 之后被丢掉，而新一轮运行看到签名已在册会整批跳过 —— 这些图标就再也没机会生成。
        // 现在改成「只有真的拿到结果才记账」，被中断的条目会在下一次运行里自然重试。

        // 搜索功能不认识 Data URL，先把条目图标栅格化并落盘成 PNG 文件
        const prepare = async () => {
          let dataUrl = ''
          if (source === 'native') {
            let nativeSrc = ''
            if (item.type === ITEM_TYPES.PLUGIN) {
              const logos = await loadPluginLogos()
              nativeSrc = logos[String(item.path).toLocaleLowerCase()] || ''
            } else if (
              item.type === ITEM_TYPES.FILE ||
              item.type === ITEM_TYPES.FOLDER ||
              item.type === ITEM_TYPES.APP
            ) {
              nativeSrc = await getFileIconDataUrl(item.path)
            }
            dataUrl = nativeSrc
              ? await rasterizeIconDataUrl(nativeSrc, 64, normalizeIconRadius(item.iconRadius))
              : ''
          } else {
            dataUrl = await getGroupFeatureIcon({
              ...item,
              customIconRef: source === 'custom' ? item.customIconRef : null
            }, 64)
          }

          // 签名被改写了，说明已经有更新的一轮接手了这条例目的图标，这份旧结果直接丢掉
          if (signatures.get(item.id) !== undefined && signatures.get(item.id) !== signature) return
          if (!dataUrl) {
            // 取不到图标（死链 / 系统不给这类文件图标）：同样不留签名，
            // 下一次运行会再试一遍 —— 文件修好之后图标会自己补上
            if (active) icons.delete(item.id)
            return
          }
          const saved = await window.services?.savePushIcon?.(name, dataUrl)
          if (signatures.get(item.id) !== undefined && signatures.get(item.id) !== signature) return
          if (saved?.ok && saved.url) {
            signatures.set(item.id, signature)
            // 内存映射只是省一次 stat：这轮被中断过（active 为 false）就不动它，
            // 下一次取图会走 getPushIconUrl 从磁盘命中，效果一样
            if (active) icons.set(item.id, saved.url)
            return
          }
          // 写盘失败：同样不记账，留到下一次运行再试
          if (active) icons.delete(item.id)
        }
        prepare().catch(() => {})
      })
    })

    for (const id of [...signatures.keys()]) {
      if (alive.has(id)) continue
      signatures.delete(id)
      icons.delete(id)
    }

    return () => {
      active = false
      clearTimeout(pruneTimer)
    }
  }, [groups])

  const reloadGroups = useCallback(() => {
    const latest = loadGroups()
    groupsRef.current = latest
    setGroups(latest)
    // 进入插件时立刻全量对一次账，把上次异常退出 / 同步竞态留下的旧动态功能扫掉
    syncFeatures(latest, { immediate: true })
    const iconRefs = []
    latest.forEach((group) => {
      if (group.customIconRef) iconRefs.push(group.customIconRef)
      if (group.backgroundRef) iconRefs.push(group.backgroundRef)
      group.items.forEach((item) => {
        if (item.customIconRef) iconRefs.push(item.customIconRef)
      })
    })
    if (iconRefs.length) {
      window.services?.ensureCustomIconsSynced?.(iconRefs)?.catch?.(() => {})
    }
    // 兜底回收：换设备同步删除分组 / 异常退出留下的本地图标，只清一周前的。
    // 只有确认读到分组数组时才执行，避免 db 读取异常时把图标全部删掉
    let storedGroups = null
    try {
      storedGroups = window.utools?.dbStorage?.getItem(GROUPS_KEY)
    } catch {}
    if (Array.isArray(storedGroups) && isUtoolsMainWindow() &&
      (iconRefs.length > 0 || storedGroups.length === 0)) {
      Promise.resolve(window.services?.pruneCustomIcons?.(iconRefs)).catch(() => {})
    }
    refreshCustomIcons()
    return latest
  }, [syncFeatures])

  useEffect(() => {
    const handleEnter = ({ code, type, payload }) => {
      const latestGroups = reloadGroups()
      const pendingSwitch = pendingGroupSwitchRef.current
      pendingGroupSwitchRef.current = null
      // 从搜索结果里点了别的分组的入口：以目标分组为准，而不是本次进入的那个分组。
      // 只在刚点完的几秒内生效，避免残留下来把后面某次普通进入带偏
      const switchFresh = Boolean(pendingSwitch) && Date.now() - pendingSwitch.at < 5000
      const groupId = (switchFresh ? pendingSwitch.id : '') || getGroupIdFromFeatureCode(code)
      const pending = pendingGroupQueryRef.current
      pendingGroupQueryRef.current = null
      const group = groupId
        ? latestGroups.find((item) => item.id === groupId)
        : null
      // 直接在搜索框里按 Enter 进「在「xx」中搜索」这条功能时，把空格后面的查询带进面板。
      // 但从推送结果跳进别的分组（switchFresh）时，payload 是属于来源分组的输入，
      // 不能带过去 —— 否则 cy cm 会原封不动压到 kjcmd 上，一条都匹配不到
      const payloadText = typeof payload === 'string' ? payload : ''
      const strippedQuery = group && payloadText ? extractGroupQuery(group, payloadText) : ''
      const payloadQuery = group && !switchFresh && strippedQuery !== payloadText.trim()
        ? strippedQuery
        : ''
      // 文件匹配指令进入：携带选中的文件/目录，弹出分组选择
      const pushedFiles = code === ADD_TO_GROUP_FEATURE_CODE && type === 'files' && Array.isArray(payload)
        ? payload.map((file) => file?.path).filter(Boolean)
        : []
      // 搜索面板已恒开：除了「一键启动」的分组，有可见内容的分组都进紧凑面板
      const useCompact = isPanelEligible(group, latestGroups) && isUtoolsMainWindow()
      const currentHeight = Math.round(window.innerHeight || 0)
      // 面板高度：这个分组上次实测过就直接沿用（尺寸不会跳），否则按内容估算
      const compactHeight = useCompact
        ? resolveCompactHeight(
            group,
            compactHeightsRef.current,
            window.innerWidth,
            new Map(latestGroups.map((entry) => [entry.id, entry]))
          )
        : 0

      if (!compactModeRef.current && currentHeight >= 500) {
        fullHeightRef.current = currentHeight
        saveFullHeight(currentHeight)
      }
      compactModeRef.current = useCompact
      dragDepth.current = 0
      mainPushSelectionRef.current.clear()

      // 先把窗口调到目标高度，再渲染内容：尺寸变化发生在空白占位上，
      // 面板 / 主界面一出现就是最终大小，不会「先按主界面高度铺开再缩回去」
      if (useCompact) {
        compactHeightRef.current = compactHeight
        try {
          window.utools?.setExpandHeight?.(compactHeight)
        } catch {}
      } else if (currentHeight < 500) {
        try {
          window.utools?.setExpandHeight?.(fullHeightRef.current)
        } catch {}
      }

      flushSync(() => {
        setPluginActive(true)
        setQuery(pending ? (pending.groupId === groupId ? pending.query : '') : payloadQuery)
        setEditor(null)
        setGroupPicker(pushedFiles.length ? { kind: 'add-files', paths: pushedFiles } : null)
        setDeleteTarget(null)
        setDragActive(false)
        setUrlDialogOpen(false)
        setUrlTargetGroupId(null)
        setPluginDialogOpen(false)
        setSoftwareDialogOpen(false)
        setImportPreview(null)
        setTransferBusy(false)
        setSubInputSession((value) => value + 1)
        setCompactMode(useCompact)
        if (group) setActiveId(groupId)
        setEntryReady(true)
      })

      // 通过分组入口跳进来的，不要再把目标分组的一键启动跑一遍。
      // launchGroup 自己会拒绝已关闭的分组，这里只补一句说明，免得点了没反应
      if (!switchFresh && group?.quickLaunch && group.items.length > 0) {
        if (isGroupActive(group)) launchGroup(group)
        else showToast(`「${group.name}」已关闭`, 'warning')
      }
    }

    if (typeof window.services?.onPluginEnter === 'function') {
      return window.services.onPluginEnter(handleEnter)
    }
    if (typeof window.utools?.onPluginEnter !== 'function') return undefined
    window.utools.onPluginEnter(handleEnter)
    return undefined
  }, [launchGroup, reloadGroups, showToast])

  // 开启搜索推送后插件会被 uTools 后台预加载，此时没有进入事件，兜底直接渲染
  useEffect(() => {
    if (entryReady) return undefined
    const timer = window.setTimeout(() => {
      // 没有进入事件就走兜底：这时一律按主界面呈现，窗口也得先撑回主界面高度，
      // 否则会以退出时收起的面板高度显示一副主界面
      if (!compactModeRef.current) {
        try {
          window.utools?.setExpandHeight?.(fullHeightRef.current)
        } catch {}
      }
      setEntryReady(true)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [entryReady])

  useEffect(() => {
    if (typeof window.utools?.onDbPull !== 'function') return undefined
    window.utools.onDbPull(() => {
      reloadGroups()
    })

    return undefined
  }, [reloadGroups])

  useEffect(() => {
    const utools = window.utools
    if (typeof utools?.onPluginOut !== 'function') return undefined

    utools.onPluginOut(() => {
      setPluginActive(false)
      if (isUtoolsMainWindow()) setEntryReady(false)
      subInputActiveRef.current = false
      const height = Math.round(window.innerHeight)
      if (!compactModeRef.current && height >= 500) {
        fullHeightRef.current = height
        saveFullHeight(height)
      }
      // 窗口已经隐藏，这时把它收成「该分组搜索面板」的高度：
      // 下次进入就是面板尺寸，不会先闪一个主界面大小的大窗再缩回来。
      // 只有当前确实在看紧凑面板时才收——在完整界面退出时要把大窗尺寸留住，
      // 否则下次进完整界面会先从面板高度弹开，看起来像主界面「自己变大变小」
      const group = groupsRef.current.find((item) => item.id === activeIdRef.current)
      const compactEligible = compactModeRef.current && isUtoolsMainWindow() &&
        isPanelEligible(group, groupsRef.current)
      if (compactEligible) {
        const target = resolveCompactHeight(
          group,
          compactHeightsRef.current,
          window.innerWidth,
          new Map(groupsRef.current.map((entry) => [entry.id, entry]))
        )
        compactHeightRef.current = target
        try {
          utools.setExpandHeight?.(target)
        } catch {}
      }
      // 退出插件：把防抖期间还没写的高度立刻补上
      flushCompactHeights()
      try {
        utools.removeSubInput?.()
      } catch {}

      // 面板已经隐藏，把紧凑态复位。uTools 对开启了搜索推送的插件会后台预加载，
      // 再次显示时有可能不再派发进入事件；如果保留 compactMode，兜底渲染就会
      // 把「上次停留的那个分组的搜索面板」当成主界面弹出来
      pendingGroupSwitchRef.current = null
      compactModeRef.current = false
      if (compactOverlayTimerRef.current) {
        window.clearTimeout(compactOverlayTimerRef.current)
        compactOverlayTimerRef.current = null
      }
      setCompactOverlay(false)
      setCompactMode(false)
    })

    return undefined
  }, [flushCompactHeights])

  useEffect(() => {
    const utools = window.utools
    if (typeof utools?.onPluginDetach !== 'function') return undefined

    utools.onPluginDetach(() => {
      compactModeRef.current = false
      setCompactMode(false)
      setEntryReady(true)
      try {
        utools.setExpandHeight?.(fullHeightRef.current)
      } catch {}
    })

    return undefined
  }, [])

  useEffect(() => {
    const utools = window.utools
    subInputActiveRef.current = false

    if (
      !pluginActive ||
      !compactMode ||
      !activeGroup ||
      activeGroup.quickLaunch ||
      !activeGroup.items.length ||
      anyDialogOpen ||
      // 子输入框是「搜索框主窗口」的东西：分离窗口里调它不会生效，
      // 却可能把主窗口的搜索框抢过去，所以只认主窗口
      !isUtoolsMainWindow()
    ) {
      try {
        utools?.removeSubInput?.()
      } catch {}
      return undefined
    }
    if (typeof utools?.setSubInput !== 'function') return undefined

    try {
      utools.removeSubInput?.()
    } catch {}

    let active = false
    try {
      const result = utools.setSubInput(({ text }) => {
        setQuery(text)
        queryRef.current = text
      }, '搜索当前分组', true)
      active = result !== false
      if (active) {
        utools.setSubInputValue?.(queryRef.current)
      }
    } catch {}
    subInputActiveRef.current = active

    return () => {
      subInputActiveRef.current = false
      try {
        utools.removeSubInput?.()
      } catch {}
    }
  }, [pluginActive, compactMode, activeGroup?.id, activeGroup?.quickLaunch, activeGroup?.items.length, anyDialogOpen, subInputSession])

  useEffect(() => {
    if (typeof window.utools?.onMainPush !== 'function') return undefined

    window.utools.onMainPush((action) => {
      const code = action?.code
      const groupId = getGroupIdFromFeatureCode(code)
      if (!groupId) return []
      const group = groupsRef.current.find((item) => item.id === groupId)
      if (!group || !isGroupActive(group) || !group.keywordMatch) return []

      const rawPayload = typeof action.payload === 'string' ? action.payload : ''
      const query = extractGroupQuery(group, rawPayload)
      const hasQuery = Boolean(query.trim())
      // 空格后保持前 5 条预览；继续输入查询时搜索分组本身 + 直接子分组（只摊一层）。
      // 查询形如「子分组 + 空格 + 关键词」时（cy kjcmd 显示）只在那个子分组里搜
      const groupsById = new Map(groupsRef.current.map((entry) => [entry.id, entry]))
      const scope = hasQuery ? pickScopedGroup(group, groupsById, query) : null
      const matched = scope
        ? getVisibleGroupItems(scope.target, groupsById)
          .filter((item) => matchesSearchItem(item, scope.rest))
          .map((item) => ({ item, owner: scope.target }))
        : hasQuery
          ? collectPushEntries(group, groupsById, query)
          : group.items
            .filter((item) => !isHiddenGroupEntry(item, groupsById))
            .slice(0, MAIN_PUSH_LIMIT)
            .map((item) => ({ item, owner: group }))
      // 只命中了「一个分组入口」时（cy kjcmd / cy kj），顺手把这个分组的前几条摊出来，
      // 省得还要先点进去；条目仍按同一套归属分组逻辑处理
      const soloGroup = !scope && matched.length === 1 &&
        matched[0].item.type === ITEM_TYPES.GROUP
        ? matched[0]
        : null
      // 指回当前分组自己的入口不用预览（那会把当前分组的内容再抄一遍）；已关闭的分组也不展开
      const soloTarget = soloGroup && soloGroup.item.groupId !== group.id
        ? groupsById.get(soloGroup.item.groupId)
        : null
      const soloEnabled = soloTarget && isGroupActive(soloTarget) ? soloTarget : null
      const rawEntries = soloEnabled
        ? [
            soloGroup,
            ...getVisibleGroupItems(soloTarget, groupsById)
              .slice(0, MAIN_PUSH_LIMIT)
              .map((item) => ({ item, owner: soloTarget }))
          ]
        : matched
      // 指向已关闭分组的入口：那个分组在 uTools 里等于不存在，搜索结果里一条都不留
      const entries = rawEntries.filter(({ item }) => !isHiddenGroupEntry(item, groupsById))

      const results = []
      if (!hasQuery || !entries.length) {
        // 没结果的兜底直接落到「正在搜的那个分组」：限定搜索时就是子分组，否则是当前分组
        const enterTarget = scope ? scope.target : group
        const enterQuery = scope ? scope.rest : query
        const enterText = `${OPEN_GROUP_PREFIX}${enterTarget.name}`
        mainPushSelectionRef.current.set(`${code}\u0000${enterText}`, {
          enterGroup: true,
          ownerId: enterTarget.id,
          query: enterQuery
        })
        results.push({
          icon: 'push-icons/group.png',
          text: enterText,
          title: hasQuery
            ? (scope
              ? `「${enterTarget.name}」里没有匹配项，进入该分组搜索`
              : '没有匹配项，进入分组搜索')
            : '进入分组并使用搜索'
        })
      }
      const counts = new Map()
      entries.forEach(({ item, owner }) => {
        // 分组入口套上「」，一眼能看出这行点下去是进分组、而不是启动某个东西
        const base = item.type === ITEM_TYPES.GROUP ? `「${item.name}」分组` : item.name
        const count = (counts.get(base) || 0) + 1
        counts.set(base, count)
        const label = count === 1 ? base : `${base} (${count})`
        // 推送结果只有 text / title 两个字段（title 只是悬停提示），没有右侧独立标签可用，
        // 所以来源分组直接跟在名字后面：显示IP · 「kjcmd」，和「」分组 的写法保持一致。
        // 分组入口不写来源：同一个分组可能在好几个子分组里都放了入口，选谁都一样，
        // 标一个具体的出处反而误导；「只命中一个分组」摊出来的预览条目也不用重复写
        const plain = item.type === ITEM_TYPES.GROUP ||
          owner.id === group.id ||
          owner.id === soloTarget?.id
          ? label
          : `${label} · 「${owner.name}」`
        // 「只命中一个分组」时摊出来的预览条目是上面那条分组入口的子项；
        // uTools 的推送结果没有缩进/层级字段，就靠上面那行「XXX」分组 说明它们属于谁
        mainPushSelectionRef.current.set(`${code}\u0000${plain}`, {
          ownerId: owner.id,
          itemId: item.id
        })
        const source = item.iconSource ||
          (item.type === ITEM_TYPES.URL ? 'builtin' : 'native')
        const signature = [
          item.type,
          item.path,
          item.icon || '',
          item.color || '',
          source,
          item.customIconRef || '',
          item.customIconRadius || 0,
          item.iconRadius ?? ''
        ].join('|')
        const iconUrl = itemFeatureIconsRef.current.get(item.id) ||
          window.services?.getPushIconUrl?.(
            `push-${item.id}-${hashSignature(signature)}`
          ) ||
          PUSH_ICONS[item.type] ||
          (item.type === ITEM_TYPES.GROUP ? 'push-icons/group.png' : 'logo.png')
        results.push({
          icon: iconUrl,
          text: plain,
          // 悬停提示给完整路径；子分组里摊出来的条目带上来源分组（和结果行同样用「」包起来）
          title: item.type === ITEM_TYPES.GROUP
            ? `进入「${item.name}」分组`
            : owner.id === group.id
              ? item.path
              : [`「${owner.name}」`, item.path].filter(Boolean).join(' · ')
        })
      })
      return results
    }, (action) => {
      const code = action?.code
      const groupId = getGroupIdFromFeatureCode(code)
      if (!groupId) return false
      const group = groupsRef.current.find((item) => item.id === groupId)
      // 推送阶段已经拦过关闭的分组，这里再兜一层：功能可能是在上一次同步里注册的，
      // 选中的瞬间分组刚好被关掉（多设备同步 / 正在改设置）时不该再把结果跑出来
      if (!group || !isGroupActive(group)) return false
      const text = action?.option?.text
      if (!text) return false

      const selection = mainPushSelectionRef.current.get(`${code}\u0000${text}`)

      // 兜底行「进入分组」：限定搜索（cy kjcmd 显示）时落到那个子分组，否则落到当前分组
      if (selection?.enterGroup || text === `${OPEN_GROUP_PREFIX}${group.name}`) {
        const targetGroup = (selection?.enterGroup &&
          groupsRef.current.find((entry) => entry.id === selection.ownerId)) || group
        const payload = typeof action?.payload === 'string' ? action.payload.trim() : ''
        const nextQuery = selection?.enterGroup
          ? (selection.query || '')
          : (payload === text ? '' : extractGroupQuery(targetGroup, payload))
        // 目标是别的分组：进入事件得落到那个分组上，否则会回到关键词所属的分组
        pendingGroupSwitchRef.current = targetGroup.id === group.id
          ? null
          : { id: targetGroup.id, at: Date.now() }
        pendingGroupQueryRef.current = {
          groupId: targetGroup.id,
          query: nextQuery
        }
        // 这里提前把界面切好：万一 uTools 只是把预加载的窗口显示出来、不再派发进入事件，
        // 界面也是对的（否则会残留上一次的紧凑面板 / 主界面）
        const compactEligible = isPanelEligible(targetGroup, groupsRef.current) &&
          isUtoolsMainWindow()
        compactModeRef.current = compactEligible
        flushSync(() => {
          setActiveId(targetGroup.id)
          setQuery(nextQuery)
          setCompactMode(compactEligible)
          setEntryReady(true)
        })
        return true
      }

      // 命中项可能来自摊开一层的子分组：按记录里的归属分组去取；
      // 映射丢了就按展示文本还原名字再兜底找一遍（子分组预览项可能来自任意分组，最后兜到全部分组里找）
      const owner = (selection && groupsRef.current.find((entry) => entry.id === selection.ownerId)) || group
      const plainName = stripPushDecoration(text)
      const findByText = (list) => (list || []).find((entry) => entry.name === plainName)
      const item = (selection && owner.items.find((entry) => entry.id === selection.itemId)) ||
        findByText(owner.items) ||
        findByText(group.items) ||
        groupsRef.current.map((entry) => findByText(entry.items)).find(Boolean)
      if (!item) return false

      // 分组入口：不启动任何东西，进入插件后落到那个分组
      if (item.type === ITEM_TYPES.GROUP) {
        const target = groupsRef.current.find((entry) => entry.id === item.groupId)
        // 目标分组已经不在了 / 刚被关掉：这条结果不该再把人带过去
        if (!target || !isGroupActive(target)) return true
        pendingGroupSwitchRef.current = { id: target.id, at: Date.now() }
        // 插件已经打开时先把界面切过去；还在搜索框里选结果时交给进入事件处理，
        // 免得窗口没打开就先把 activeId 改了
        if (pluginActiveRef.current) {
          const compactEligible = isPanelEligible(target, groupsRef.current) &&
            isUtoolsMainWindow()
          compactModeRef.current = compactEligible
          flushSync(() => {
            setActiveId(target.id)
            setQuery('')
            setCompactMode(compactEligible)
            setEntryReady(true)
          })
          return true
        }
        // uTools 只有在 onSelect 返回 true 时才进入插件并派发 onPluginEnter，
        // 返回 false 等于「这条结果没人处理」——点了毫无反应。
        // 这里必须返回 true，真正的分组切换交给 handleEnter 用 pendingGroupSwitchRef 完成。
        return true
      }

      launchItem(item)
        .then((error) => {
          if (error) {
            window.utools?.showNotification?.(`无法打开「${item.name}」：${error}`)
            return
          }
          if (item.type !== ITEM_TYPES.PLUGIN) {
            setPluginActive(false)
            try {
              window.utools?.removeSubInput?.()
            } catch {}
            window.utools?.hideMainWindow?.()
          }
        })
        .catch(() => {
          window.utools?.showNotification?.(`无法打开「${item.name}」`)
        })
      return false
    })

    return undefined
  }, [launchItem])

  useEffect(() => {
    if (!groups.some((group) => group.id === activeId)) {
      setActiveId(groups[0]?.id || null)
      setQuery('')
    }
  }, [groups, activeId])

  useEffect(() => {
    const resetDrag = () => {
      dragDepth.current = 0
      setDragActive(false)
    }
    const preventFileDrop = (event) => {
      if (Array.from(event.dataTransfer?.types || []).includes('Files')) {
        event.preventDefault()
      }
      if (event.type === 'drop') resetDrag()
    }
    const handleWindowDragLeave = (event) => {
      const outside = event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth - 1 ||
        event.clientY >= window.innerHeight - 1
      if (outside) resetDrag()
    }
    window.addEventListener('dragover', preventFileDrop)
    window.addEventListener('drop', preventFileDrop)
    window.addEventListener('dragleave', handleWindowDragLeave)
    window.addEventListener('dragend', resetDrag)
    return () => {
      window.removeEventListener('dragover', preventFileDrop)
      window.removeEventListener('drop', preventFileDrop)
      window.removeEventListener('dragleave', handleWindowDragLeave)
      window.removeEventListener('dragend', resetDrag)
    }
  }, [])

  // 「启用 / 关闭」改变的是 uTools 里这个分组存不存在，收尾必须走同一套：
  // 先同步删掉动态功能（立刻从搜索结果消失），再跑一次立即对账兜底；
  // 关掉的是正在看的那个就切走。开关胶囊、右键菜单、编辑器三处都调它，
  // 不能一处走 removeGroupFeature + 立即对账、另一处只靠 300ms 防抖等对账
  const applyGroupEnabledEffect = useCallback((groupId, wasActive, nextGroups) => {
    removeGroupFeature(groupId)
    // 重新启用后要真的注册回去，否则命令行 / 推送要等到下一次对账才出现
    syncFeatures(nextGroups, { immediate: true })
    if (!wasActive) return
    const fallback = nextGroups.find((item) => item.id !== groupId && isGroupActive(item))
    // 全都关了就先留在原地：还能看、能改，只是不可运行
    if (!fallback) return
    setActiveId(fallback.id)
    setQuery('')
    compactModeRef.current = false
    setCompactMode(false)
    try {
      window.utools?.setExpandHeight?.(fullHeightRef.current)
    } catch {}
  }, [syncFeatures])

  const handleSaveGroup = (nextGroup, options = {}) => {
    const previous = groups.find((group) => group.id === nextGroup.id)
    const exists = Boolean(previous)
    let nextGroups = exists
      ? groups.map((group) => (group.id === nextGroup.id ? nextGroup : group))
      : [...groups, nextGroup]
    // 改名 / 换图标后，别处指向它的分组入口同步刷新
    if (exists) nextGroups = syncGroupEntrySnapshots(nextGroups, nextGroup)

    // 关键词冲突由编辑器统一校验（GroupEditorDialog 保存前那次 validateGroupKeywords），
    // 这里不再重复校验：编辑一个「本来就重名」的老分组时，重复校验会把人卡在保存上

    const saved = commitGroups(nextGroups)
    if (!saved.ok) return false

    // 编辑器里把「启用」关掉 / 打开，和胶囊、右键菜单改的是同一件事，收尾也必须一样。
    // 启用时是「先登记再落盘」的对象，这里补一次立即对账（commitGroups 里那次是 300ms 防抖）
    const turnedOff = Boolean(previous) && isGroupActive(previous) && !isGroupActive(nextGroup)
    const turnedOn = Boolean(previous) && !isGroupActive(previous) && isGroupActive(nextGroup)
    if (turnedOff) applyGroupEnabledEffect(nextGroup.id, nextGroup.id === activeIdRef.current, nextGroups)
    else if (turnedOn) syncFeatures(nextGroups, { immediate: true })

    // 从分组入口里「修改」别的分组时不要把人跳走：只有新建、或改的就是当前分组才切过去。
    // 关掉的当前分组已经由 applyGroupEnabledEffect 切到了别的分组，这里不要再拉回来
    if ((!exists || nextGroup.id === activeIdRef.current) && isGroupActive(nextGroup)) {
      setActiveId(nextGroup.id)
      setQuery('')
    }
    setEditor(null)
    if (options.silent) return true
    if (turnedOff) showToast(`已关闭「${nextGroup.name}」`)
    else if (turnedOn) showToast(`已启用「${nextGroup.name}」`)
    // 建组后紧接着还要往里加文件时，让「已添加 N 个快捷方式」这条提示单独出现就够了
    else showToast(exists ? '分组已更新' : '分组已创建')
    return true
  }

  const handleUpdateGroupFlags = useCallback((groupId, patch) => {
    const group = groupsRef.current.find((item) => item.id === groupId)
    if (!group) return false

    const enabled = patch.enabled ?? isGroupActive(group)
    const keywordMatch = patch.keywordMatch ?? group.keywordMatch
    // 一键启动要求关键词匹配；搜索面板已恒开，utoolsSearch 不再由界面上切换
    const quickLaunch = keywordMatch ? (patch.quickLaunch ?? group.quickLaunch) : false
    const candidate = {
      ...group,
      ...patch,
      enabled,
      keywordMatch,
      quickLaunch,
      utoolsSearch: true
    }

    const keywordError = validateGroupKeywords(groupsRef.current, candidate)
    if (keywordError) {
      showToast(keywordError, 'warning')
      return false
    }

    const nextGroups = groupsRef.current.map((item) => (
      item.id === groupId ? candidate : item
    ))
    const saved = commitGroups(nextGroups)
    if (!saved.ok) return false

    // 只有牵动「注册 / 取消注册」的开关才要立刻落地：
    // 关掉（不再注册）和重新启用（注册回去）都必须马上对账，其余开关走防抖同步就够
    const turnedOff = !isGroupActive(candidate) && isGroupActive(group)
    const turnedOn = isGroupActive(candidate) && !isGroupActive(group)
    if (turnedOff) {
      applyGroupEnabledEffect(groupId, activeIdRef.current === groupId, nextGroups)
    } else if (turnedOn || patch.keywordMatch !== undefined) {
      syncFeatures(nextGroups, { immediate: true })
    }

    if (patch.enabled !== undefined) {
      showToast(patch.enabled ? `已启用「${group.name}」` : `已关闭「${group.name}」`)
    } else if (patch.keywordMatch !== undefined) {
      showToast(patch.keywordMatch ? '已开启 uTools 搜索框' : '已关闭 uTools 搜索框')
    } else if (patch.quickLaunch !== undefined) {
      showToast(patch.quickLaunch ? '已开启一键启动' : '已关闭一键启动')
    }

    return true
  }, [activeIdRef, applyGroupEnabledEffect, commitGroups, showToast, syncFeatures])

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return
    const target = deleteTarget
    // 别的分组里指向它的入口一并移除，避免留下点不开的死链
    const nextGroups = dropGroupEntries(
      groups.filter((group) => group.id !== target.id),
      target.id
    )
    const saved = commitGroups(nextGroups)
    if (!saved.ok) return

    // 删除分组：先当场删掉它的动态功能（立刻从搜索结果消失），
    // 再跑一次立即对账——万一刚才有一次 setFeature 正在写、把功能又写回来了，也能马上清掉
    removeGroupFeature(target.id)
    syncFeatures(nextGroups, { immediate: true })

    releaseUnusedIconRefs(
      [target.customIconRef, target.backgroundRef, ...target.items.map((item) => item.customIconRef)],
      nextGroups
    )
    if (activeId === target.id) {
      setActiveId(nextGroups[0]?.id || null)
      setQuery('')
    }
    setDeleteTarget(null)
    showToast('分组已删除')
  }

  // groupId 可省略：默认加到当前分组；紧凑面板里对着盒子添加时要指定那个盒子的分组
  const appendItems = useCallback((newItems, groupId) => {
    const targetId = groupId || activeId
    if (!targetId || !newItems.length) return false

    const latestGroup = groupsRef.current.find((group) => group.id === targetId)
    if (!latestGroup) return false

    const existing = new Set(latestGroup.items.map((item) => `${item.type}:${item.path}:${item.command || ''}`))
    const fresh = newItems.filter((item) => {
      const key = `${item.type}:${item.path}:${item.command || ''}`
      if (existing.has(key)) return false
      existing.add(key)
      return true
    })

    if (!fresh.length) {
      showToast(
        targetId === activeId ? '这些项目已在当前分组中' : `这些项目已在「${latestGroup.name}」中`,
        'warning'
      )
      return false
    }

    const nextGroups = groupsRef.current.map((group) => (
      group.id === targetId
        ? { ...group, items: [...group.items, ...fresh] }
        : group
    ))
    return commitGroups(nextGroups).ok
  }, [activeId, commitGroups, showToast])

  const addPaths = useCallback(async (paths, targetGroupId = activeId) => {
    if (!paths?.length) return false
    const targetId = targetGroupId
    if (!targetId) return false
    if (addBusyRef.current) {
      showToast('正在添加，请稍候', 'warning')
      return false
    }

    addBusyRef.current = true
    setAdding(true)
    try {
      const described = await window.services.describePaths(paths)
      const valid = described.filter((item) => !item.error)
      const failed = described.length - valid.length
      const latestGroup = groupsRef.current.find((group) => group.id === targetId)
      if (!latestGroup) return false

      const existing = new Set(latestGroup.items.map((item) => item.path))
      const fresh = valid.filter((item) => !existing.has(item.path))
      const skipped = valid.length - fresh.length

      if (fresh.length === 0) {
        showToast(
          failed > 0
            ? '无法读取所选项目，请确认文件仍然存在'
            : `这些项目已在「${latestGroup.name}」中`,
          'warning'
        )
        return false
      }

      const nextGroup = {
        ...latestGroup,
        items: [
          ...latestGroup.items,
          ...fresh.map(createFileItem)
        ]
      }
      const nextGroups = groupsRef.current.map((group) => (
        group.id === targetId ? nextGroup : group
      ))
      const result = commitGroups(nextGroups)
      if (!result.ok) return false

      const skippedCount = failed + skipped
      showToast(
        `已添加 ${fresh.length} 个快捷方式${skippedCount > 0 ? `，跳过 ${skippedCount} 个` : ''}`
      )
      return true
    } catch {
      showToast('添加失败，请重试', 'error')
      return false
    } finally {
      addBusyRef.current = false
      setAdding(false)
    }
  }, [activeId, commitGroups, showToast])

  // 「添加」的落点分组：默认当前分组；紧凑面板里对着盒子右键时，加进那个盒子对应的分组
  // （弹窗式的添加要跨一次异步，先把目标存这里，提交 / 取消时清掉）
  const addTargetRef = useRef(null)
  const takeAddTargetId = () => addTargetRef.current || activeId

  const handleAddFiles = async (targetGroupId) => {
    try {
      const paths = await window.services.pickFiles()
      if (paths?.length) await addPaths(paths, targetGroupId || activeId)
    } catch {
      showToast('无法打开文件选择器', 'error')
    }
  }

  const handleAddFolders = async (targetGroupId) => {
    try {
      const paths = await window.services.pickFolders()
      if (paths?.length) await addPaths(paths, targetGroupId || activeId)
    } catch {
      showToast('无法打开目录选择器', 'error')
    }
  }

  const handleAddSoftware = (targetGroupId) => {
    if (!activeGroup) return
    addTargetRef.current = targetGroupId || null
    setSoftwareDialogOpen(true)
  }

  const handleAddSoftwarePaths = async (paths) => {
    const targetId = takeAddTargetId()
    addTargetRef.current = null
    return addPaths(paths, targetId)
  }

  const handleAddUrl = ({ name, url, targetGroupId, ...appearance }) => {
    const normalized = normalizeUrl(url)
    if (!normalized) {
      showToast('请输入有效的网址', 'error')
      return false
    }
    // 落点用提交时带回的分组 id，取不到才退回当前分组
    const saved = appendItems([createUrlItem(normalized, name, appearance)], targetGroupId || activeId)
    addTargetRef.current = null
    if (saved) showToast('已添加网址')
    return saved
  }

  const handleAddPlugin = ({ pluginName, command, name }) => {
    if (!pluginName.trim()) {
      showToast('请输入 uTools 插件应用名称', 'error')
      return false
    }
    const saved = appendItems([createPluginItem(pluginName, command, name)], takeAddTargetId())
    addTargetRef.current = null
    if (saved) showToast('已添加 uTools 插件')
    return saved
  }

  const handleLaunch = async (item) => {
    if (launchingRef.current) return
    // 分组入口只是界面跳转，不退出插件
    if (item.type === ITEM_TYPES.GROUP) {
      const target = groupsRef.current.find((group) => group.id === item.groupId)
      if (!target) {
        showToast('该分组已不存在', 'warning')
        return
      }
      setActiveId(target.id)
      setQuery('')
      // 点分组图标 / 名称 = 一键进入这个分组本身（紧凑面板就地切过去，主界面切侧边栏选中项）；
      // 想跳去完整界面看它，走右键菜单的「进入分组」（handleEnterGroup）。
      // 唯一的例外是空分组：面板里什么都点不到，直接展开完整界面让人往里加东西
      if (compactModeRef.current && !target.items.length) handleExpandCompact()
      return
    }
    launchingRef.current = true
    setLaunchingId(item.id)
    try {
      const error = await launchItem(item)
      if (error) {
        showToast(`无法打开「${item.name}」：${error}`, 'error')
        return
      }
      if (item.type !== ITEM_TYPES.PLUGIN) {
        setPluginActive(false)
        window.utools.outPlugin?.()
      }
    } catch {
      showToast(`无法打开「${item.name}」`, 'error')
    } finally {
      launchingRef.current = false
      setLaunchingId(null)
    }
  }

  // 右键菜单的「进入分组」：切到那个分组，并展开完整界面（紧凑面板里点它就是想看大图）
  const handleEnterGroup = useCallback((item) => {
    const target = groupsRef.current.find((group) => group.id === item?.groupId)
    if (!target) {
      showToast('该分组已不存在', 'warning')
      return
    }
    setActiveId(target.id)
    setQuery('')
    if (compactModeRef.current) handleExpandCompact()
  }, [handleExpandCompact, showToast])

  // groupId 省略时就是当前激活分组；紧凑面板里的盒子会列出别的分组的条目，
  // 那种情况要把条目所属的分组传进来
  const patchItem = useCallback((itemId, patch, groupId) => {
    const targetId = groupId || activeId
    const latestGroup = groupsRef.current.find((group) => group.id === targetId)
    if (!latestGroup) return false
    const nextGroups = groupsRef.current.map((group) => (
      group.id === latestGroup.id
        ? {
            ...group,
            items: group.items.map((item) => (
              item.id === itemId ? { ...item, ...patch } : item
            ))
          }
        : group
    ))
    return commitGroups(nextGroups).ok
  }, [activeId, commitGroups])

  const handleEditPlugin = useCallback(({ pluginName, command, name }) => {
    if (!editPluginTarget || !pluginName.trim()) return false
    const plugin = pluginName.trim()
    const saved = patchItem(editPluginTarget.id, {
      path: plugin,
      command: (command || '').trim() || plugin,
      name: name.trim() || plugin
    }, editEntryGroupId)
    if (saved) showToast('uTools 插件已更新')
    return saved
  }, [editPluginTarget, editEntryGroupId, patchItem, showToast])

  const handleCopyItemToGroup = useCallback((payload, targetGroupId) => {
    const sourceGroupId = payload?.sourceGroupId
    const incoming = Array.isArray(payload?.items)
      ? payload.items
      : (payload?.item ? [payload.item] : [])
    if (!incoming.length || !targetGroupId) return false
    if (sourceGroupId === targetGroupId) {
      showToast('条目已经在当前分组', 'warning')
      return false
    }
    const target = groupsRef.current.find((group) => group.id === targetGroupId)
    if (!target) return false
    // 和「选择分组」弹窗保持同一套规则：已关闭的分组不作为加入目标
    // （加进去在 uTools 里也用不上），否则拖放能进、选择器进不去，两个入口说法不一
    if (!isGroupActive(target)) {
      showToast(`「${target.name}」已关闭，先启用再加`, 'warning')
      return false
    }

    // 分组入口没有路径，用 groupId 区分，避免两个不同分组被当成同一条
    const keyOf = (entry) => `${entry.type}\u0000${entry.path}\u0000${entry.command || ''}\u0000${entry.groupId || ''}`
    const existingKeys = new Set(target.items.map(keyOf))
    const fresh = []
    const blocked = []
    incoming.forEach((entry) => {
      // 复制过去正好变成「目标分组里放它自己」的那条入口，留着也点不进去
      if (entry.type === ITEM_TYPES.GROUP && entry.groupId === targetGroupId) {
        blocked.push(entry)
        return
      }
      const key = keyOf(entry)
      if (existingKeys.has(key)) return
      existingKeys.add(key)
      fresh.push({ ...entry, id: createId() })
    })

    if (!fresh.length) {
      if (blocked.length === incoming.length) {
        showToast(
          blocked.length === 1
            ? `不能把「${blocked[0].name}」复制进它自己`
            : `不能把这些分组入口复制进它自己`,
          'warning'
        )
        return false
      }
      showToast(
        `「${target.name}」已包含${incoming.length > 1 ? '这些条目' : '该条目'}`,
        'warning'
      )
      return false
    }

    const nextGroups = groupsRef.current.map((group) => (
      group.id === targetGroupId
        ? { ...group, items: [...group.items, ...fresh] }
        : group
    ))
    const result = commitGroups(nextGroups)
    if (result.ok) {
      const skipped = incoming.length - fresh.length - blocked.length
      const note = [
        skipped ? `跳过 ${skipped} 个已存在条目` : '',
        blocked.length ? `忽略 ${blocked.length} 个指向该分组自己的入口` : ''
      ].filter(Boolean).join('，')
      showToast(
        fresh.length === 1
          ? `已复制「${fresh[0].name}」到「${target.name}」${note ? `（${note}）` : ''}`
          : `已复制 ${fresh.length} 个条目到「${target.name}」${note ? `，${note}` : ''}`
      )
    }
    return result.ok
  }, [commitGroups, showToast])

  const handleCopyItems = useCallback((ids) => {
    if (!ids?.length || !activeId) return
    setGroupPicker({ kind: 'copy-items', ids, sourceGroupId: activeId })
  }, [activeId])

  const runGroupPickerAction = useCallback(async (picker, target) => {
    if (!picker || !target) return
    if (picker.kind === 'add-group') {
      const host = groupsRef.current.find((group) => group.id === picker.hostGroupId)
      if (!host) return
      // 「添加分组」是多选：一次可以往宿主里塞好几条入口，所以先筛出能加的那些，再一次性写入
      const targets = [...new Set(Array.isArray(target) ? target : [target])]
      const existed = new Set(
        host.items
          .filter((item) => item.type === ITEM_TYPES.GROUP)
          .map((item) => item.groupId)
      )
      const skipped = []
      const accepted = []
      targets.forEach((id) => {
        const source = groupsRef.current.find((group) => group.id === id)
        if (!source) return
        // 分组入口不能指向宿主分组自己（点进去还是同一个分组）；指向别的分组随便套，
        // 哪怕那个分组里也有本分组的入口，也只是互为入口而已
        if (existed.has(source.id) || groupNestError(source, host)) {
          skipped.push(source.name)
          return
        }
        accepted.push(source)
      })
      if (!accepted.length) {
        if (skipped.length) showToast(`「${skipped[0]}」不能加入「${host.name}」`, 'warning')
        return
      }
      const nextGroups = groupsRef.current.map((group) => (
        group.id === host.id
          ? { ...group, items: [...group.items, ...accepted.map(createGroupItem)] }
          : group
      ))
      if (commitGroups(nextGroups).ok) {
        if (accepted.length === 1) {
          showToast(`已把「${accepted[0].name}」加入「${host.name}」`)
        } else {
          showToast(`已把 ${accepted.length} 个分组加入「${host.name}」${skipped.length ? `，${skipped.length} 个跳过` : ''}`)
        }
      }
      return
    }
    const targetGroupId = Array.isArray(target) ? target[0] : target
    if (!targetGroupId) return
    if (picker.kind === 'copy-items') {
      const source = groupsRef.current.find((group) => group.id === picker.sourceGroupId)
      if (!source) return
      const idSet = new Set(picker.ids)
      handleCopyItemToGroup({
        sourceGroupId: picker.sourceGroupId,
        items: source.items.filter((item) => idSet.has(item.id))
      }, targetGroupId)
      return
    }
    const added = await addPaths(picker.paths, targetGroupId)
    if (added) {
      setActiveId(targetGroupId)
      setQuery('')
    }
  }, [addPaths, commitGroups, groupNestError, handleCopyItemToGroup, showToast])

  const handlePickerSelect = useCallback((target) => {
    const picker = groupPicker
    setGroupPicker(null)
    runGroupPickerAction(picker, target)
  }, [groupPicker, runGroupPickerAction])

  // 「+ → 添加分组」：选一个（或多个）已有分组，作为入口放进 hostGroupId（默认当前分组）
  const handleAddGroupRequest = useCallback((hostGroupId) => {
    const host = hostGroupId || activeId
    if (!host) return
    setGroupPicker({ kind: 'add-group', hostGroupId: host })
  }, [activeId])

  // 右键分组入口（内容区 / 紧凑面板的盒子标题）→「修改分组」：打开那个分组自己的编辑器
  const handleEditGroupEntry = useCallback((item) => {
    const target = groupsRef.current.find((group) => group.id === item?.groupId)
    if (!target) {
      showToast('该分组已不存在', 'warning')
      return
    }
    setQuery('')
    setEditor(target)
  }, [showToast])

  // 从侧边栏把分组拖进内容区：按落点位置插入一条分组入口
  const handleDropGroupEntry = useCallback((sourceGroupId, hostGroupId, beforeItemId, after) => {
    const host = groupsRef.current.find((group) => group.id === hostGroupId)
    const source = groupsRef.current.find((group) => group.id === sourceGroupId)
    if (!host || !source) return
    // 拖回自己身上：分组里再套一条指向自己的入口，没有任何意义
    const nestError = groupNestError(source, host)
    if (nestError) {
      showToast(nestError, 'warning')
      return
    }
    if (host.items.some((item) => (
      item.type === ITEM_TYPES.GROUP && item.groupId === source.id
    ))) {
      showToast(`「${source.name}」已在当前分组中`, 'warning')
      return
    }
    const items = [...host.items]
    const at = beforeItemId ? items.findIndex((item) => item.id === beforeItemId) : -1
    const insertAt = at < 0 ? items.length : (after ? at + 1 : at)
    items.splice(insertAt, 0, createGroupItem(source))
    const nextGroups = groupsRef.current.map((group) => (
      group.id === host.id ? { ...group, items } : group
    ))
    if (commitGroups(nextGroups).ok) {
      showToast(`已把「${source.name}」加入「${host.name}」`)
    }
  }, [commitGroups, groupNestError, showToast])

  // 新建分组的空白草稿：颜色按现有分组数轮换
  const makeBlankGroup = () => createGroup({
    name: '',
    color: GROUP_COLORS[groupsRef.current.length % GROUP_COLORS.length],
    keywordMatch: true,
    utoolsSearch: true
  })

  // 点「新建分组」不再填个名字就完事，直接复用完整的分组编辑器（图标、别名、搜索外观都能设）；
  // 编辑器保存后由 handleSaveGroup 的包装层把待添加的项目补进新分组
  const handlePickerCreateRequest = useCallback(() => {
    const picker = groupPicker
    if (!picker) return
    setPendingPickerCreate(picker)
    setGroupPicker(null)
    setEditor(makeBlankGroup())
  }, [groupPicker])

  const handleRemoveItem = (item, groupId) => {
    // 紧凑面板里的盒子会把别的分组的条目也画出来，删的时候得认「它自己属于哪个分组」，
    // 不能一律按当前激活分组来
    const targetId = groupId || activeId
    const group = groupsRef.current.find((current) => current.id === targetId)
    if (!group) return
    const nextGroups = groupsRef.current.map((current) => (
      current.id === group.id
        ? { ...current, items: current.items.filter((entry) => entry.id !== item.id) }
        : current
    ))
    const result = commitGroups(nextGroups)
    if (result.ok) {
      releaseUnusedIconRefs([item.customIconRef], nextGroups)
      showToast(group.id === activeId ? '已从分组移除' : `已从「${group.name}」移除`)
    }
  }

  const handleRemoveItems = useCallback((ids) => {
    if (!Array.isArray(ids) || !ids.length) return
    const group = groupsRef.current.find((current) => current.id === activeId)
    if (!group) return

    const idSet = new Set(ids)
    const removedItems = group.items.filter((item) => idSet.has(item.id))
    const remaining = group.items.filter((item) => !idSet.has(item.id))
    const removed = group.items.length - remaining.length
    if (!removed) return

    const nextGroups = groupsRef.current.map((current) => (
      current.id === group.id ? { ...current, items: remaining } : current
    ))
    const result = commitGroups(nextGroups)
    if (result.ok) {
      releaseUnusedIconRefs(removedItems.map((item) => item.customIconRef), nextGroups)
      showToast(`已删除 ${removed} 个快捷方式`)
    }
  }, [activeId, commitGroups, showToast])

  // groupId 可省略：默认改当前分组；紧凑面板里拖的是「盒子里的条目」（属于别的分组）时要指定
  const handleReorderItems = useCallback((itemId, targetId, placeAfter, groupId) => {
    if (!itemId || !targetId || itemId === targetId) return false
    const group = groupsRef.current.find((current) => current.id === (groupId || activeId))
    if (!group) return false

    const items = [...group.items]
    const fromIndex = items.findIndex((item) => item.id === itemId)
    if (fromIndex < 0) return false
    const [moved] = items.splice(fromIndex, 1)

    let targetIndex = items.findIndex((item) => item.id === targetId)
    if (targetIndex < 0) return false
    if (placeAfter) targetIndex += 1
    items.splice(targetIndex, 0, moved)

    const nextGroups = groupsRef.current.map((current) => (
      current.id === group.id ? { ...current, items } : current
    ))
    return commitGroups(nextGroups).ok
  }, [activeId, commitGroups])

  // 把条目拖到另一个分组的盒子里 = 移动过去（可以指定插入到哪一条前后）
  const handleMoveItem = useCallback((item, target) => {
    const targetGroupId = target?.groupId
    if (!item?.id || !targetGroupId) return false
    const source = groupsRef.current.find((group) => group.items.some((entry) => entry.id === item.id))
    if (!source) return false
    if (source.id === targetGroupId) {
      if (!target.targetId) return false
      return handleReorderItems(item.id, target.targetId, target.placeAfter, source.id)
    }

    const moved = source.items.find((entry) => entry.id === item.id)
    const targetGroup = groupsRef.current.find((group) => group.id === targetGroupId)
    if (!moved || !targetGroup) return false
    // 分组入口不能移进它自己指向的那个分组（A 里放 A）；A↔B 互为入口是允许的
    if (moved.type === ITEM_TYPES.GROUP && moved.groupId) {
      const nestError = groupNestError(
        { id: moved.groupId, name: moved.name },
        targetGroup
      )
      if (nestError) {
        showToast(nestError, 'warning')
        return false
      }
    }
    // 同一个分组里指向同一目标的两条入口没有意义，直接挡住
    if (moved.type === ITEM_TYPES.GROUP && targetGroup.items.some((entry) => (
      entry.type === ITEM_TYPES.GROUP && entry.groupId === moved.groupId
    ))) {
      showToast(`「${targetGroup.name}」里已经有「${moved.name}」了`, 'warning')
      return false
    }

    const nextGroups = groupsRef.current.map((group) => (
      group.id === source.id
        ? { ...group, items: group.items.filter((entry) => entry.id !== item.id) }
        : group
    )).map((group) => {
      if (group.id !== targetGroupId) return group
      const items = [...group.items]
      let index = target.targetId ? items.findIndex((entry) => entry.id === target.targetId) : -1
      if (index < 0) index = items.length
      else if (target.placeAfter) index += 1
      items.splice(index, 0, moved)
      return { ...group, items }
    })

    const result = commitGroups(nextGroups)
    if (result.ok) showToast(`已移动到「${targetGroup.name}」`)
    return result.ok
  }, [commitGroups, groupNestError, handleReorderItems, showToast])

  const handleReorderGroups = useCallback((draggedId, targetId, placeAfter) => {
    if (!draggedId || !targetId || draggedId === targetId) return false
    const groups = [...groupsRef.current]
    const fromIndex = groups.findIndex((group) => group.id === draggedId)
    if (fromIndex < 0) return false
    const [moved] = groups.splice(fromIndex, 1)
    let targetIndex = groups.findIndex((group) => group.id === targetId)
    if (targetIndex < 0) return false
    if (placeAfter) targetIndex += 1
    groups.splice(targetIndex, 0, moved)
    return commitGroups(groups).ok
  }, [commitGroups])

  const exportGroups = async (groupsToExport, label = '') => {
    if (transferBusy) return
    if (!window.services?.saveBackup) {
      showToast('当前环境不支持导出', 'error')
      return
    }
    if (!Array.isArray(groupsToExport) || !groupsToExport.length) {
      showToast('没有可导出的分组', 'warning')
      return
    }

    setTransferBusy(true)
    try {
      let iconFailures = 0
      const exportedIds = new Set(groupsToExport.map((group) => group.id))
      const payloadGroups = await Promise.all(groupsToExport.map(async (group) => {
        const { customIconRef, backgroundRef, items: groupItems, ...rest } = group
        let customIcon = ''
        if (customIconRef) {
          try {
            customIcon = await window.services.readCustomIcon?.(customIconRef) || ''
          } catch {}
          if (!customIcon) iconFailures += 1
        }
        let backgroundImage = ''
        if (backgroundRef) {
          try {
            backgroundImage = await window.services.readCustomIcon?.(backgroundRef) || ''
          } catch {}
          if (!backgroundImage) iconFailures += 1
        }

        const items = await Promise.all((groupItems || []).map(async (item) => {
          const { customIconRef: itemIconRef, ...itemRest } = item
          // 分组入口只是个引用：它的图标由目标分组继承（运行时主界面里共用同一个图标文件）。
          // 目标分组也在本次导出里时，再内联一份同样的图片纯属浪费——一张图会被重复塞进 JSON
          if (item.type === ITEM_TYPES.GROUP && item.groupId && exportedIds.has(item.groupId)) {
            return itemRest
          }
          let itemIcon = ''
          if (itemIconRef) {
            try {
              itemIcon = await window.services.readCustomIcon?.(itemIconRef) || ''
            } catch {}
            if (!itemIcon) iconFailures += 1
          }
          return { ...itemRest, customIcon: itemIcon }
        }))

        return { ...rest, items, customIcon, backgroundImage }
      }))

      const now = new Date()
      const pad = (value) => String(value).padStart(2, '0')
      const safeLabel = String(label || '').replace(/[\\/:*?"<>|]/g, '-').trim()
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
      const fileName = `quick-launcher-${safeLabel ? `${safeLabel}-` : ''}${timestamp}.json`
      const payload = {
        app: 'quick-launcher',
        version: BACKUP_VERSION,
        exportedAt: now.toISOString(),
        groups: payloadGroups
      }
      const result = await window.services.saveBackup(JSON.stringify(payload, null, 2), fileName)
      if (!result?.ok) {
        showToast(result?.error || '导出失败', 'error')
        return
      }
      if (result.canceled) return
      showToast(
        `已导出 ${payloadGroups.length} 个分组${iconFailures ? `，${iconFailures} 个图标未能读取` : ''}`,
        iconFailures ? 'warning' : 'success'
      )
    } catch {
      showToast('导出失败，请重试', 'error')
    } finally {
      setTransferBusy(false)
    }
  }

  const handleExportGroup = (group) => {
    if (!group) return
    return exportGroups([group], group.name)
  }
  // 侧边栏「导出配置…」：先让用户挑范围，再真正导出
  const handleExportRequest = () => {
    if (transferBusy) return
    if (!groupsRef.current.length) {
      showToast('没有可导出的分组', 'warning')
      return
    }
    setExportPickerOpen(true)
  }
  const handleExportConfirm = (groupsToExport) => {
    const list = Array.isArray(groupsToExport) ? groupsToExport : []
    if (!list.length) return
    setExportPickerOpen(false)
    // 单个分组用它的名字当文件名，多选 / 全部就只带时间戳
    return exportGroups(list, list.length === 1 ? list[0].name : '')
  }

  const handleImport = async () => {
    if (transferBusy) return
    if (!window.services?.loadBackup) {
      showToast('当前环境不支持导入', 'error')
      return
    }

    setTransferBusy(true)
    try {
      const result = await window.services.loadBackup()
      if (!result?.ok) {
        showToast(result?.error || '导入失败', 'error')
        return
      }
      if (result.canceled) return

      let parsed
      try {
        parsed = JSON.parse(String(result.content).replace(/^\uFEFF/, ''))
      } catch {
        showToast('配置文件格式无效', 'error')
        return
      }

      const backup = parseBackup(parsed)
      if (!backup.ok) {
        showToast(backup.error, 'error')
        return
      }
      setImportPreview({
        groups: backup.groups,
        fileName: result.filePath?.split(/[\\/]/).pop() || '配置文件'
      })
    } catch {
      showToast('导入失败，请重试', 'error')
    } finally {
      setTransferBusy(false)
    }
  }

  const handleImportConfirm = async () => {
    if (!importPreview || transferBusy) return

    setTransferBusy(true)
    const newIconRefs = []
    let committed = false
    try {
      const imported = []
      let iconFailures = 0

      for (const group of importPreview.groups) {
        const { customIcon, backgroundImage, items: groupItems = [], ...rest } = group
        let customIconRef = rest.customIconRef || null
        let backgroundRef = rest.backgroundRef || null

        if (customIcon) {
          try {
            const result = await window.services?.importCustomIconData?.(customIcon)
            if (result?.ok && result.ref) {
              customIconRef = result.ref
              newIconRefs.push(result.ref)
              cacheCustomIcon(result.ref, customIcon)
            } else {
              customIconRef = null
              iconFailures += 1
            }
          } catch {
            customIconRef = null
            iconFailures += 1
          }
        }

        if (backgroundImage) {
          try {
            const result = await window.services?.importCustomIconData?.(backgroundImage, {
              maxBytes: BACKGROUND_MAX_BYTES
            })
            if (result?.ok && result.ref) {
              backgroundRef = result.ref
              newIconRefs.push(result.ref)
              cacheCustomIcon(result.ref, backgroundImage)
            } else {
              backgroundRef = null
              iconFailures += 1
            }
          } catch {
            backgroundRef = null
            iconFailures += 1
          }
        }

        const items = []
        for (const item of groupItems) {
          const { customIcon: itemIcon, ...itemRest } = item
          let itemIconRef = itemRest.customIconRef || null
          if (itemIcon) {
            try {
              const result = await window.services?.importCustomIconData?.(itemIcon)
              if (result?.ok && result.ref) {
                itemIconRef = result.ref
                newIconRefs.push(result.ref)
                cacheCustomIcon(result.ref, itemIcon)
              } else {
                itemIconRef = null
                iconFailures += 1
              }
            } catch {
              itemIconRef = null
              iconFailures += 1
            }
          }
          // 解析备份时条目还没有 ref，iconSource 会被归一成 native / builtin；
          // 这会儿图片已经落盘拿到 ref，要标回 custom，否则界面仍按内置图标画、导入的图标看不见
          items.push({
            ...itemRest,
            customIconRef: itemIconRef,
            iconSource: itemIcon && itemIconRef ? 'custom' : itemRest.iconSource
          })
        }

        imported.push({ ...rest, items, customIconRef, backgroundRef })
      }

      const previousGroups = groupsRef.current
      const merged = mergeImportedGroups(previousGroups, imported)
      const warnings = merged.warnings
      const dormantConflicts = merged.dormantConflicts || []
      // 入口的图标不跟着写进导出文件：这里统一按目标分组重新对齐一次（目标不存在就保持原样）
      const mergedGroups = syncAllGroupEntries(merged.groups)
      const saved = commitGroups(mergedGroups)
      if (!saved.ok) {
        newIconRefs.forEach((ref) => {
          cacheCustomIcon(ref, null)
          window.services?.deleteCustomIcon?.(ref)
        })
        return
      }
      committed = true

      const importedNames = new Set(imported.map((group) => group.name.trim().toLocaleLowerCase()))
      const usedRefs = collectIconRefs(mergedGroups)
      // 入口自带的图标快照，若目标分组存在，会在上面的 syncAllGroupEntries 里被目标分组的图标取代；
      // 那份刚写入的图片已经没人引用，顺手回收，别留成孤儿文件
      newIconRefs.forEach((ref) => {
        if (usedRefs.has(ref)) return
        cacheCustomIcon(ref, null)
        window.services?.deleteCustomIcon?.(ref)
      })
      previousGroups.forEach((group) => {
        if (!importedNames.has(group.name.trim().toLocaleLowerCase())) return
        const refs = [
          group.customIconRef,
          group.backgroundRef,
          ...group.items.map((item) => item.customIconRef)
        ]
        refs.forEach((ref) => {
          if (!ref || usedRefs.has(ref)) return
          cacheCustomIcon(ref, null)
          window.services?.deleteCustomIcon?.(ref)
        })
      })

      const first = imported[0]
      if (first) {
        const target = mergedGroups.find((group) => (
          group.name.trim().toLocaleLowerCase() === first.name.trim().toLocaleLowerCase()
        ))
        if (target) setActiveId(target.id)
      }
      setQuery('')
      setImportPreview(null)

      const parts = [`已导入 ${imported.length} 个分组`]
      if (warnings.length) parts.push(`${warnings.length} 个关键词冲突已关闭匹配`)
      // 重名的是个关闭分组：现在不冲突，但用户重新启用它时会被拦，先说一句
      if (dormantConflicts.length) {
        const first = dormantConflicts[0]
        parts.push(`「${first.name}」已关闭，启用时需改名（与「${first.owner}」重名）`)
      }
      if (iconFailures) parts.push(`${iconFailures} 个图标未能导入`)
      showToast(
        parts.join('，'),
        warnings.length || dormantConflicts.length || iconFailures ? 'warning' : 'success'
      )
    } catch {
      if (!committed) {
        newIconRefs.forEach((ref) => {
          cacheCustomIcon(ref, null)
          window.services?.deleteCustomIcon?.(ref)
        })
      }
      showToast('导入失败，请重试', 'error')
    } finally {
      setTransferBusy(false)
    }
  }

  const handleRevealItem = (item) => {
    window.services?.revealPath?.(item.path)
  }

  const handleRunAsAdmin = async (item) => {
    if (!window.services?.runAsAdmin) {
      showToast('当前环境不支持以管理员身份运行', 'error')
      return
    }
    try {
      const error = await window.services.runAsAdmin(item.path)
      if (error) {
        showToast(error === 'invalid-path' ? '路径无效' : error, 'error')
        return
      }
      showToast(`正在以管理员身份启动「${item.name}」`)
    } catch {
      showToast('无法以管理员身份运行', 'error')
    }
  }

  const handleDragEnter = (event) => {
    if (!activeGroup) return
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return
    event.preventDefault()
    dragDepth.current += 1
    setDragActive(true)
  }

  const handleDragOver = (event) => {
    if (!activeGroup) return
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = () => {
    if (!activeGroup) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragActive(false)
  }

  const handleDrop = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = 0
    setDragActive(false)
    const types = Array.from(event.dataTransfer?.types || [])
    if (!types.includes('Files')) return
    if (!activeGroup) return

    const files = Array.from(event.dataTransfer?.files || [])
    const paths = [...new Set(files.map((file) => {
      try {
        return window.services.getPathForFile(file)
      } catch {
        return ''
      }
    }).filter(Boolean))]

    if (!paths.length) {
      showToast('未能读取拖入的项目，请尝试从按钮添加', 'warning')
      return
    }
    await addPaths(paths)
  }

  const openCreateGroup = () => {
    setEditor(makeBlankGroup())
  }

  if (!entryReady) {
    return (
      <ThemeProvider theme={theme}>
        <Box
          aria-hidden
          sx={{
            width: '100%',
            height: '100%',
            bgcolor: mode === 'dark' ? '#17181b' : '#f4f4f5'
          }}
        />
      </ThemeProvider>
    )
  }

  // 分组选择弹窗按用途切换文案与候选列表
  const pickerHostGroup = retainedGroupPicker?.kind === 'add-group'
    ? groups.find((group) => group.id === retainedGroupPicker.hostGroupId)
    : null
  const pickerGroups = (() => {
    // 已关闭的分组不作为加入目标：加进去在 uTools 里也用不上。
    // 侧栏拖放（handleCopyItemToGroup）走的是同一条规则
    const selectable = groups.filter(isGroupActive)
    if (retainedGroupPicker?.kind !== 'add-group') return selectable
    const linked = new Set(
      (pickerHostGroup?.items || [])
        .filter((item) => item.type === ITEM_TYPES.GROUP)
        .map((item) => item.groupId)
    )
    // 「添加分组」时宿主分组自己也不在候选里（由弹窗的 excludeGroupId 过滤掉），
    // 这里只把已经加进去的目标去掉；A 里有 B、B 里有 A 这种互相包含是允许的
    return selectable.filter((group) => !linked.has(group.id))
  })()
  const pickerTitle = (() => {
    if (retainedGroupPicker?.kind === 'add-group') return '添加分组'
    return retainedGroupPicker?.kind === 'add-files' ? '添加到分组' : '复制到分组'
  })()
  const pickerDescription = (() => {
    if (retainedGroupPicker?.kind === 'add-group') {
      return pickerHostGroup
        ? `选择要加入「${pickerHostGroup.name}」的分组，可多选`
        : '选择要加入当前分组的分组，可多选'
    }
    return retainedGroupPicker?.kind === 'add-files'
      ? `将选中的 ${retainedGroupPicker.paths.length} 个项目添加到分组`
      : `将选中的 ${retainedGroupPicker?.ids.length} 个条目复制到分组`
  })()
  // 有分组被关闭时补一句：候选里少的就是它们，不是没了
  const pickerEmptyHint = groups.some((group) => !isGroupActive(group))
    ? '已关闭的分组不会出现在这里'
    : undefined
  const pickerActionLabel = (() => {
    if (retainedGroupPicker?.kind === 'add-group') return '加入此分组'
    return retainedGroupPicker?.kind === 'add-files' ? '添加到此分组' : '复制到此分组'
  })()

  return (
    <ThemeProvider theme={theme}>
      {(compactMode || compactOverlay) && activeGroup && (
        <Box
          key="compact-panel"
          className={compactOverlay ? 'compact-overlay-out' : 'app-enter'}
          aria-hidden={compactOverlay || undefined}
          inert={compactOverlay || undefined}
          sx={compactOverlay
            ? {
                position: 'fixed',
                inset: 0,
                zIndex: 40,
                pointerEvents: 'none'
              }
            : {
                width: '100%',
                height: '100%'
              }}
        >
          <CompactGroupPanel
            group={activeGroup}
            groups={groups}
            query={query}
            mode={mode}
            surfaces={surfaces}
            fading={compactOverlay}
            onExpand={handleExpandCompact}
            onLaunch={handleLaunch}
            onRevealItem={handleRevealItem}
            onRunAsAdmin={handleRunAsAdmin}
            onQueryChange={handleQueryChange}
            onHeightChange={handleCompactHeight}
            onRemoveItem={handleRemoveItem}
            onSetBoxView={handleCompactBoxView}
            onAddGroup={handleAddGroupRequest}
            // 右键菜单「进入分组」= 主界面里定位到那个分组（点图标 / 名称只是就地切过去）
            onEnterGroup={handleEnterGroup}
            // 空白处 / 盒子右键 →「添加」二级菜单：和主界面 + 号菜单里的那几项同一套处理器；
            // 传了分组 id 就加进那个分组（盒子右键 = 加进盒子里的分组）
            onAddFiles={handleAddFiles}
            onAddFolders={handleAddFolders}
            onAddSoftware={handleAddSoftware}
            onAddUrl={(targetGroupId) => {
              setUrlTargetGroupId(targetGroupId || null)
              setUrlDialogOpen(true)
            }}
            onAddPlugin={(targetGroupId) => {
              addTargetRef.current = targetGroupId || null
              setPluginDialogOpen(true)
            }}
            onReorderItems={handleReorderItems}
            onMoveItem={handleMoveItem}
            onEditItem={(item, groupId) => {
              // 盒子里的条目属于目标分组，改的也是那个分组里的那一条
              setEditEntryGroupId(groupId || null)
              if (item.type === ITEM_TYPES.PLUGIN) setEditPluginTarget(item)
              else setEditItemTarget(item)
            }}
            onEditGroupEntry={handleEditGroupEntry}
          />
        </Box>
      )}

      {!compactMode && (
        <Box
          key="full-ui"
          className="app-enter"
          sx={{
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            gap: '14px',
            p: '14px',
            overflow: 'hidden',
            bgcolor: mode === 'dark' ? '#17181b' : '#f4f4f5',
            backgroundImage: mode === 'dark'
              ? 'radial-gradient(900px 620px at 8% 0%, rgba(96, 165, 250, 0.10), transparent 62%), radial-gradient(760px 520px at 100% 0%, rgba(168, 85, 247, 0.08), transparent 58%)'
              : 'radial-gradient(900px 620px at 8% 0%, rgba(18, 118, 197, 0.07), transparent 62%), radial-gradient(760px 520px at 100% 0%, rgba(139, 92, 246, 0.05), transparent 58%)',
            transition: 'background-color 180ms ease'
          }}
        >
        <Sidebar
          groups={groups}
          activeId={activeId}
          themeMode={themeMode}
          surfaces={surfaces}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          onThemeChange={handleThemeChange}
          onSelect={(groupId) => {
            setActiveId(groupId)
            setQuery('')
          }}
          onCreate={openCreateGroup}
          onImport={handleImport}
          onExportRequest={handleExportRequest}
          onEditGroup={(group) => {
            setQuery('')
            setEditor(group)
          }}
          onExportGroup={handleExportGroup}
          onToggleGroupEnabled={(group) => handleUpdateGroupFlags(group.id, { enabled: !isGroupActive(group) })}
          onDeleteGroup={(group) => setDeleteTarget(group)}
          onReorderGroups={handleReorderGroups}
          onDropItemToGroup={handleCopyItemToGroup}
          transferBusy={transferBusy}
        />

        <Box
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {activeGroup
            ? (
              <GroupContent
                key={activeGroup.id}
                group={activeGroup}
                groups={groups}
                query={query}
                view={viewMode}
                surfaces={surfaces}
                adding={adding}
                launchingId={launchingId}
                canCopyToGroup={groups.length > 1}
                onQueryChange={handleQueryChange}
                onViewChange={handleViewChange}
                onEdit={() => setEditor(activeGroup)}
                onExportGroup={handleExportGroup}
                onRunGroup={handleRunGroup}
                onAddFiles={handleAddFiles}
                onAddFolders={handleAddFolders}
                onAddSoftware={handleAddSoftware}
                onAddUrl={() => {
                  setUrlTargetGroupId(null)
                  setUrlDialogOpen(true)
                }}
                onAddPlugin={() => setPluginDialogOpen(true)}
                onAddGroup={handleAddGroupRequest}
                onToggleEnabled={() => handleUpdateGroupFlags(activeGroup.id, { enabled: !isGroupActive(activeGroup) })}
                onToggleKeyword={() => handleUpdateGroupFlags(activeGroup.id, { keywordMatch: !activeGroup.keywordMatch })}
                onToggleQuickLaunch={() => handleUpdateGroupFlags(activeGroup.id, { quickLaunch: !activeGroup.quickLaunch })}
                onLaunch={handleLaunch}
                onRemoveItem={handleRemoveItem}
                onRemoveItems={handleRemoveItems}
                onCopyItems={handleCopyItems}
                onReorderItems={handleReorderItems}
                onEditItem={(item) => {
                  setEditEntryGroupId(activeGroup.id)
                  if (item.type === ITEM_TYPES.PLUGIN) setEditPluginTarget(item)
                  else setEditItemTarget(item)
                }}
                onEditGroupEntry={handleEditGroupEntry}
                onDropGroup={handleDropGroupEntry}
                onRevealItem={handleRevealItem}
                onRunAsAdmin={handleRunAsAdmin}
                onNotify={showToast}
              />
              )
            : (
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  px: 3
                }}
              >
                <Box sx={{ maxWidth: 330 }}>
                  <Box
                    component="img"
                    src="logo.png"
                    alt=""
                    sx={{ width: 64, height: 64, borderRadius: '18px', display: 'block', mx: 'auto' }}
                  />
                  <Typography sx={{ mt: 2, fontSize: 17, fontWeight: 700 }}>
                    创建你的第一个分组
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<AddCircleOutlineRoundedIcon sx={{ fontSize: 18 }} />}
                    onClick={openCreateGroup}
                    sx={{ mt: 2 }}
                  >
                    新建分组
                  </Button>
                </Box>
              </Box>
              )}

          {dragActive && activeGroup && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                zIndex: 20,
                borderRadius: '16px',
                border: '2px dashed',
                borderColor: 'primary.main',
                bgcolor: (theme) => (
                  theme.palette.mode === 'dark'
                    ? 'rgba(20, 30, 42, 0.72)'
                    : 'rgba(240, 247, 253, 0.78)'
                ),
                backdropFilter: 'blur(3px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none'
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1.2,
                  borderRadius: '11px',
                  bgcolor: 'background.paper',
                  boxShadow: surfaces.shadow,
                  border: '1px solid',
                  borderColor: 'divider'
                }}
              >
                <AddRoundedIcon sx={{ fontSize: 19, color: 'primary.main' }} />
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                  松开以添加到「{activeGroup.name}」
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      )}

      <React.Fragment key="toast-host">
        <Snackbar
          key={toast?.id}
          open={Boolean(toast)}
          autoHideDuration={3000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          sx={compactMode
            ? undefined
            : {
                '&.MuiSnackbar-root': {
                  left: '50%',
                  transform: `translateX(calc(-50% + ${sidebarCollapsed ? 47 : 109}px))`
                }
              }}
        >
          {toast
            ? (
              <Alert
                severity={toast.severity}
                variant="filled"
                onClose={() => setToast(null)}
                sx={{ borderRadius: '10px', fontSize: 12, alignItems: 'center' }}
              >
                {toast.message}
              </Alert>
              )
            : undefined}
        </Snackbar>
      </React.Fragment>

      {/* mounted 由 presence 在 effect 里置位，会晚一帧；这里让 editor 一置位就挂载并直接 open，
          避免「点了没反应」的那一帧延迟 */}
      {(editorPresence.mounted || Boolean(editor)) && retainedEditor && (
        <GroupEditorDialog
          key="group-editor-dialog"
          open={Boolean(editor) || editorPresence.open}
          group={retainedEditor}
          groups={groups}
          onClose={() => {
            setEditor(null)
            // 从「添加到分组 → 新建分组」进来的：取消后回到分组列表，待添加的项目不会丢
            if (pendingPickerCreate) {
              setGroupPicker(pendingPickerCreate)
              setPendingPickerCreate(null)
            }
          }}
          onSave={(nextGroup) => {
            const created = !groups.some((group) => group.id === nextGroup.id)
            const pending = created ? pendingPickerCreate : null
            if (!handleSaveGroup(nextGroup, { silent: Boolean(pending) })) return false
            if (pending) {
              setPendingPickerCreate(null)
              runGroupPickerAction(pending, nextGroup.id)
              // 「添加分组 → 新建分组」：留在原来的分组里看结果（新分组只是被加进来的一个入口）。
              // 如果入口是加进别处（比如紧凑面板里对着某个盒子加的），就别把人切走
              if (pending.kind === 'add-group' && pending.hostGroupId === activeId) {
                setActiveId(pending.hostGroupId)
                setQuery('')
              }
            }
            return true
          }}
          onDeleteRequest={(group) => {
            setEditor(null)
            setDeleteTarget(group)
          }}
        />
      )}

      <ExportGroupsDialog
        key="export-groups-dialog"
        open={exportPickerOpen}
        groups={groups}
        busy={transferBusy}
        onClose={() => setExportPickerOpen(false)}
        onConfirm={handleExportConfirm}
      />

      {pickerPresence.mounted && retainedGroupPicker && (
        <GroupPickerDialog
          key="group-picker-dialog"
          open={pickerPresence.open}
          title={pickerTitle}
          description={pickerDescription}
          groups={pickerGroups}
          excludeGroupId={retainedGroupPicker.kind === 'copy-items'
            ? retainedGroupPicker.sourceGroupId
            // 「添加分组」时宿主分组自己不能选：那会变成分组里再套一个自己
            : retainedGroupPicker.kind === 'add-group'
              ? retainedGroupPicker.hostGroupId
              : ''}
          allowCreate={retainedGroupPicker.kind === 'add-files' || retainedGroupPicker.kind === 'add-group'}
          actionLabel={pickerActionLabel}
          // 「添加分组」可以一次勾好几个，其它两种照旧点一下就进去
          multiple={retainedGroupPicker.kind === 'add-group'}
          confirmLabel="加入当前分组"
          emptyText={retainedGroupPicker.kind === 'add-group'
            ? '没有可以加入的分组了'
            : undefined}
          disabledHint={pickerEmptyHint}
          onClose={() => setGroupPicker(null)}
          onSelect={handlePickerSelect}
          onCreateRequest={retainedGroupPicker.kind === 'add-files' || retainedGroupPicker.kind === 'add-group'
            ? handlePickerCreateRequest
            : undefined}
        />
      )}

      {editItemPresence.mounted && retainedEditItem && (
        <EditItemDialog
          key="edit-item-dialog"
          open={editItemPresence.open}
          item={retainedEditItem}
          onClose={() => setEditItemTarget(null)}
          onSave={(patch) => {
            if (!retainedEditItem) return false
            const previousIconRef = retainedEditItem.customIconRef
            const saved = patchItem(retainedEditItem.id, patch, editEntryGroupId)
            if (saved) {
              if (
                previousIconRef &&
                patch.customIconRef !== undefined &&
                previousIconRef !== patch.customIconRef
              ) {
                releaseUnusedIconRefs([previousIconRef], groupsRef.current)
              }
              showToast('条目已更新')
            }
            return saved
          }}
          onDelete={(item) => handleRemoveItem(item, editEntryGroupId || undefined)}
        />
      )}

      {urlDialogPresence.mounted && (
        <AddUrlDialog
          key="add-url-dialog"
          open={urlDialogPresence.open}
          targetGroupId={urlTargetGroupId}
          onClose={() => {
            addTargetRef.current = null
            setUrlTargetGroupId(null)
            setUrlDialogOpen(false)
          }}
          onSubmit={handleAddUrl}
        />
      )}

      {pluginDialogPresence.mounted && (
        <AddPluginDialog
          key="add-plugin-dialog"
          open={pluginDialogPresence.open}
          onClose={() => {
            addTargetRef.current = null
            setPluginDialogOpen(false)
          }}
          onSubmit={handleAddPlugin}
        />
      )}

      {editPluginPresence.mounted && retainedEditPlugin && (
        <AddPluginDialog
          key="edit-plugin-dialog"
          open={editPluginPresence.open}
          mode="edit"
          initialItem={retainedEditPlugin}
          onClose={() => setEditPluginTarget(null)}
          onSubmit={handleEditPlugin}
        />
      )}

      {softwareDialogPresence.mounted && (
        <AddSoftwareDialog
          key="software-dialog"
          open={softwareDialogPresence.open}
          mode="add"
          title="添加软件"
          onClose={() => {
            addTargetRef.current = null
            setSoftwareDialogOpen(false)
          }}
          onAdd={handleAddSoftwarePaths}
        />
      )}

      {deletePresence.mounted && retainedDeleteTarget && (
        <Dialog
          key="delete-group-dialog"
          open={deletePresence.open}
          onClose={() => setDeleteTarget(null)}
          maxWidth="xs"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                borderRadius: '16px',
                maxWidth: 390
              }
            }
          }}
        >
          <DialogTitle sx={{ fontSize: 15.5, fontWeight: 700, pb: 0.8 }}>
            删除分组
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: 12.5, lineHeight: 1.7, color: 'text.secondary' }}>
              确定删除「{retainedDeleteTarget.name}」？快捷方式会一并移除，源文件不受影响。
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 2.2, pb: 1.8 }}>
            <Button onClick={() => setDeleteTarget(null)} sx={{ color: 'text.secondary' }}>
              取消
            </Button>
            <Button variant="contained" color="error" onClick={handleDeleteConfirm}>
              删除
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {importPresence.mounted && retainedImportPreview && (
        <Dialog
          key="import-dialog"
          open={importPresence.open}
          onClose={() => {
            if (!transferBusy) setImportPreview(null)
          }}
          maxWidth="xs"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                borderRadius: '16px',
                maxWidth: 390
              }
            }
          }}
        >
          <DialogTitle sx={{ fontSize: 15.5, fontWeight: 700, pb: 0.8 }}>
            导入配置
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: 12.5, lineHeight: 1.7, color: 'text.secondary' }}>
              从「{retainedImportPreview.fileName}」导入 {retainedImportPreview.groups.length || 0} 个分组？同名分组会被覆盖，其余分组保留。
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 2.2, pb: 1.8 }}>
            <Button
              onClick={() => setImportPreview(null)}
              disabled={transferBusy}
              sx={{ color: 'text.secondary' }}
            >
              取消
            </Button>
            <Button
              variant="contained"
              onClick={handleImportConfirm}
              disabled={transferBusy}
              startIcon={transferBusy ? <CircularProgress size={14} color="inherit" /> : null}
            >
              {transferBusy ? '导入中' : '导入'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </ThemeProvider>
  )
}
