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
  isApplicationTarget,
  loadGroups,
  loadFullHeight,
  loadCompactHeights,
  loadSidebarCollapsed,
  loadThemeMode,
  loadViewMode,
  MAIN_PUSH_LIMIT,
  mergeImportedGroups,
  normalizeUrl,
  parseBackup,
  removeGroupFeature,
  resolveThemeMode,
  saveGroups,
  saveFullHeight,
  saveCompactHeight,
  saveSidebarCollapsed,
  saveThemeMode,
  saveViewMode,
  syncGroupFeatures,
  syncGroupEntrySnapshots,
  validateGroupKeywords
} from './data'
import { matchesSearchItem } from './search'
import { BACKGROUND_MAX_BYTES } from './imageScale'
import Sidebar from './components/Sidebar'
import GroupContent from './components/GroupContent'
import CompactGroupPanel from './components/CompactGroupPanel'
import GroupEditorDialog from './components/GroupEditorDialog'
import GroupPickerDialog from './components/GroupPickerDialog'
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
// 紧凑面板最高能到多少：跟屏幕可用高度走。固定 440 会把 5×5 的嵌套盒子裁掉半截
function resolveCompactMaxHeight () {
  const avail = (typeof window !== 'undefined' && window.screen?.availHeight) || 900
  return Math.max(440, Math.min(760, Math.round(avail - 120)))
}
const COMPACT_MAX_HEIGHT = resolveCompactMaxHeight()
const OPEN_GROUP_PREFIX = '进入分组：'

// 进入面板时先用哪个高度：分组条目没变就沿用上次实测值（尺寸不跳），
// 否则按「112 + 行数 × 行高」估一个，等面板实测后再微调
function resolveCompactHeight (group, remembered, width) {
  if (!group) return 0
  const cached = remembered?.[group.id]
  if (cached && (cached.n < 0 || cached.n === group.items.length)) {
    return Math.min(COMPACT_MAX_HEIGHT, Math.max(COMPACT_MIN_HEIGHT, cached.h))
  }
  const isList = group.compactView === 'list'
  const columns = Math.max(1, Math.floor((Math.round(width || 720) - 30) / 80))
  // 列表视图最多铺 9 行（和面板里的上限一致），再多就滚动
  const rows = isList
    ? Math.min(group.items.length || 1, 9)
    : Math.ceil((group.items.length || 0) / columns)
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
  [ITEM_TYPES.PLUGIN]: 'push-icons/plugin.png'
}

function hashSignature (value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

function collectIconRefs (groupList) {  const refs = new Set()
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
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [adding, setAdding] = useState(false)
  const [launchingId, setLaunchingId] = useState(null)
  const [toast, setToast] = useState(null)
  const [urlDialogOpen, setUrlDialogOpen] = useState(false)
  const [pluginDialogOpen, setPluginDialogOpen] = useState(false)
  const [softwareDialogOpen, setSoftwareDialogOpen] = useState(false)
  const [transferBusy, setTransferBusy] = useState(false)
  const [importPreview, setImportPreview] = useState(null)

  const groupsRef = useRef(groups)
  const queryRef = useRef(query)
  const subInputActiveRef = useRef(false)
  const compactModeRef = useRef(false)
  const compactHeightRef = useRef(0)
  // 各分组上次实测的面板高度（离开插件 / 再次进入时复用，避免窗口先大后小）
  const compactHeightsRef = useRef(loadCompactHeights())
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
  const theme = useMemo(() => createAppTheme(mode), [mode])
  const surfaces = useMemo(() => getSurfaces(mode), [mode])
  const activeGroup = groups.find((group) => group.id === activeId) || null
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
  }, [])

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

  const syncFeatures = useCallback((nextGroups) => {
    syncGroupFeatures(nextGroups, getGroupFeatureIcon).then((featureError) => {
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

  // 紧凑面板实测内容高度后回收窗口 —— 列数随窗口宽度变化，高度不能再用固定公式算
  const handleCompactHeight = useCallback((height) => {
    if (!compactModeRef.current) return
    const target = Math.round(
      Math.min(COMPACT_MAX_HEIGHT, Math.max(COMPACT_MIN_HEIGHT, height))
    )
    if (!target || Math.abs(target - compactHeightRef.current) < 3) return
    compactHeightRef.current = target
    // 记住这个分组的实际高度：下次进入 / 离开时直接用，窗口不用先大后小
    const group = groupsRef.current.find((item) => item.id === activeIdRef.current)
    if (group) {
      const count = group.items.length
      compactHeightsRef.current = {
        ...compactHeightsRef.current,
        [group.id]: { h: target, n: count }
      }
      saveCompactHeight(group.id, target, count)
    }
    try {
      window.utools?.setExpandHeight?.(target)
    } catch {}
  }, [])

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
      if (item.browserMode !== 'default' && item.openWith) {
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
    utools?.hideMainWindow?.()

    // 插件跳转会离开当前插件应用，因此放到最后处理；分组入口不是启动目标，直接跳过
    const plainItems = group.items.filter((item) => (
      item.type !== ITEM_TYPES.PLUGIN && item.type !== ITEM_TYPES.GROUP
    ))
    const pluginItems = group.items.filter((item) => item.type === ITEM_TYPES.PLUGIN)

    for (const item of [...plainItems, ...pluginItems]) {
      try {
        await launchItem(item)
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, LAUNCH_GAP))
    }

    utools?.outPlugin?.()
  }, [launchItem])

  useEffect(() => {
    syncFeatures(groupsRef.current)
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

    groups.forEach((group) => {
      if (!group.keywordMatch || !group.utoolsSearch) return
      group.items.forEach((item) => {
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
          item.customIconRadius || 0
        ].join('|')
        if (signatures.get(item.id) === signature) return
        signatures.set(item.id, signature)

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
            dataUrl = nativeSrc ? await rasterizeIconDataUrl(nativeSrc, 64) : ''
          } else {
            dataUrl = await getGroupFeatureIcon({
              ...item,
              customIconRef: source === 'custom' ? item.customIconRef : null
            }, 64)
          }

          if (!active || signatures.get(item.id) !== signature) return
          if (!dataUrl) {
            icons.delete(item.id)
            return
          }
          const saved = await window.services?.savePushIcon?.(
            `push-${item.id}-${hashSignature(signature)}`,
            dataUrl
          )
          if (!active || signatures.get(item.id) !== signature) return
          if (saved?.ok && saved.url) icons.set(item.id, saved.url)
          else icons.delete(item.id)
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
    }
  }, [groups])

  const reloadGroups = useCallback(() => {
    const latest = loadGroups()
    groupsRef.current = latest
    setGroups(latest)
    syncFeatures(latest)
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
      // 文件匹配指令进入：携带选中的文件/目录，弹出分组选择
      const pushedFiles = code === ADD_TO_GROUP_FEATURE_CODE && type === 'files' && Array.isArray(payload)
        ? payload.map((file) => file?.path).filter(Boolean)
        : []
      // 只有开启了搜索功能的分组才使用紧凑面板，否则直接进入完整主界面
      const useCompact = Boolean(group && group.utoolsSearch && !group.quickLaunch && group.items.length > 0) &&
        isUtoolsMainWindow()
      const currentHeight = Math.round(window.innerHeight || 0)
      // 面板高度：这个分组上次实测过就直接沿用（尺寸不会跳），否则按内容估算
      const compactHeight = useCompact
        ? resolveCompactHeight(group, compactHeightsRef.current, window.innerWidth)
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
        setQuery(pending && pending.groupId === groupId ? pending.query : '')
        setEditor(null)
        setGroupPicker(pushedFiles.length ? { kind: 'add-files', paths: pushedFiles } : null)
        setDeleteTarget(null)
        setDragActive(false)
        setUrlDialogOpen(false)
        setPluginDialogOpen(false)
        setSoftwareDialogOpen(false)
        setImportPreview(null)
        setTransferBusy(false)
        setSubInputSession((value) => value + 1)
        setCompactMode(useCompact)
        if (group) setActiveId(groupId)
        setEntryReady(true)
      })

      // 通过分组入口跳进来的，不要再把目标分组的一键启动跑一遍
      if (!switchFresh && group?.quickLaunch && group.items.length > 0) {
        launchGroup(group)
      }
    }

    if (typeof window.services?.onPluginEnter === 'function') {
      return window.services.onPluginEnter(handleEnter)
    }
    if (typeof window.utools?.onPluginEnter !== 'function') return undefined
    window.utools.onPluginEnter(handleEnter)
    return undefined
  }, [launchGroup, reloadGroups])

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
      const compactEligible = compactModeRef.current && isUtoolsMainWindow() && Boolean(
        group && group.utoolsSearch && !group.quickLaunch && group.items.length > 0
      )
      if (compactEligible) {
        const target = resolveCompactHeight(group, compactHeightsRef.current, window.innerWidth)
        compactHeightRef.current = target
        try {
          utools.setExpandHeight?.(target)
        } catch {}
      }
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
  }, [])

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
      anyDialogOpen
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
      if (!group || !group.keywordMatch || !group.utoolsSearch) return []

      const rawPayload = typeof action.payload === 'string' ? action.payload : ''
      const query = extractGroupQuery(group, rawPayload)
      const hasQuery = Boolean(query.trim())
      // 空格后保持前 5 条预览；继续输入查询时搜索整个分组。
      // 分组入口也列出来（按名字匹配，不展开里面的条目），选中就进那个分组
      const pushable = group.items
      const items = hasQuery
        ? pushable.filter((item) => matchesSearchItem(item, query))
        : pushable.slice(0, MAIN_PUSH_LIMIT)

      const results = []
      if (!hasQuery || !items.length) {
        results.push({
          icon: 'push-icons/group.png',
          text: `${OPEN_GROUP_PREFIX}${group.name}`,
          title: hasQuery ? '没有匹配项，进入分组搜索' : '进入分组并使用搜索'
        })
      }
      const counts = new Map()
      items.forEach((item) => {
        const base = item.name
        const count = (counts.get(base) || 0) + 1
        counts.set(base, count)
        const text = count === 1 ? base : `${base} (${count})`
        mainPushSelectionRef.current.set(`${code}\u0000${text}`, item.id)
        const source = item.iconSource ||
          (item.type === ITEM_TYPES.URL ? 'builtin' : 'native')
        const signature = [
          item.type,
          item.path,
          item.icon || '',
          item.color || '',
          source,
          item.customIconRef || '',
          item.customIconRadius || 0
        ].join('|')
        const iconUrl = itemFeatureIconsRef.current.get(item.id) ||
          window.services?.getPushIconUrl?.(
            `push-${item.id}-${hashSignature(signature)}`
          ) ||
          PUSH_ICONS[item.type] ||
          (item.type === ITEM_TYPES.GROUP ? 'push-icons/group.png' : 'logo.png')
        results.push({
          icon: iconUrl,
          text,
          title: item.type === ITEM_TYPES.GROUP
            ? `分组 · 进入「${item.name}」`
            : item.path
        })
      })
      return results
    }, (action) => {
      const code = action?.code
      const groupId = getGroupIdFromFeatureCode(code)
      if (!groupId) return false
      const group = groupsRef.current.find((item) => item.id === groupId)
      if (!group) return false
      const text = action?.option?.text
      if (!text) return false

      if (text === `${OPEN_GROUP_PREFIX}${group.name}`) {
        const payload = typeof action?.payload === 'string' ? action.payload.trim() : ''
        const nextQuery = payload === text ? '' : extractGroupQuery(group, payload)
        pendingGroupQueryRef.current = {
          groupId,
          query: nextQuery
        }
        // 这里提前把界面切好：万一 uTools 只是把预加载的窗口显示出来、不再派发进入事件，
        // 界面也是对的（否则会残留上一次的紧凑面板 / 主界面）
        const compactEligible = !group.quickLaunch && group.utoolsSearch &&
          group.items.length > 0 && isUtoolsMainWindow()
        compactModeRef.current = compactEligible
        flushSync(() => {
          setActiveId(groupId)
          setQuery(nextQuery)
          setCompactMode(compactEligible)
          setEntryReady(true)
        })
        return true
      }

      const itemId = mainPushSelectionRef.current.get(`${code}\u0000${text}`)
      const item = group.items.find((entry) => entry.id === itemId) ||
        group.items.find((entry) => entry.name === text)
      if (!item) return false

      // 分组入口：不启动任何东西，进入插件后落到那个分组
      if (item.type === ITEM_TYPES.GROUP) {
        const target = groupsRef.current.find((entry) => entry.id === item.groupId)
        if (!target) return true
        pendingGroupSwitchRef.current = { id: target.id, at: Date.now() }
        // 插件已经打开时先把界面切过去；还在搜索框里选结果时交给进入事件处理，
        // 免得窗口没打开就先把 activeId 改了
        if (pluginActiveRef.current) {
          const compactEligible = !target.quickLaunch && target.utoolsSearch &&
            target.items.length > 0 && isUtoolsMainWindow()
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

  const handleSaveGroup = (nextGroup, options = {}) => {
    const exists = groups.some((group) => group.id === nextGroup.id)
    let nextGroups = exists
      ? groups.map((group) => (group.id === nextGroup.id ? nextGroup : group))
      : [...groups, nextGroup]
    // 改名 / 换图标后，别处指向它的分组入口同步刷新
    if (exists) nextGroups = syncGroupEntrySnapshots(nextGroups, nextGroup)

    const saved = commitGroups(nextGroups)
    if (!saved.ok) return false

    // 从分组入口里「修改」别的分组时不要把人跳走：只有新建、或改的就是当前分组才切过去
    if (!exists || nextGroup.id === activeIdRef.current) {
      setActiveId(nextGroup.id)
      setQuery('')
    }
    setEditor(null)
    // 建组后紧接着还要往里加文件时，让「已添加 N 个快捷方式」这条提示单独出现就够了
    if (!options.silent) showToast(exists ? '分组已更新' : '分组已创建')
    return true
  }

  const handleUpdateGroupFlags = useCallback((groupId, patch) => {
    const group = groupsRef.current.find((item) => item.id === groupId)
    if (!group) return false

    const keywordMatch = patch.keywordMatch ?? group.keywordMatch
    let quickLaunch = keywordMatch ? (patch.quickLaunch ?? group.quickLaunch) : false
    let utoolsSearch = keywordMatch ? (patch.utoolsSearch ?? group.utoolsSearch) : false
    if (patch.quickLaunch === true) utoolsSearch = false
    if (patch.utoolsSearch === true) quickLaunch = false
    const candidate = {
      ...group,
      ...patch,
      keywordMatch,
      quickLaunch,
      utoolsSearch
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

    if (patch.keywordMatch === false) {
      removeGroupFeature(groupId)
    }

    if (patch.keywordMatch !== undefined) {
      showToast(patch.keywordMatch ? '已开启关键词匹配' : '已关闭关键词匹配')
    } else if (patch.quickLaunch !== undefined) {
      showToast(patch.quickLaunch ? '已开启一键启动' : '已关闭一键启动')
    } else if (patch.utoolsSearch !== undefined) {
      showToast(patch.utoolsSearch ? '已开启 uTools 搜索功能' : '已关闭 uTools 搜索功能')
    }

    return true
  }, [commitGroups, showToast])

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

    removeGroupFeature(target.id)

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

  const handleAddUrl = ({ name, url, ...appearance }) => {
    const normalized = normalizeUrl(url)
    if (!normalized) {
      showToast('请输入有效的网址', 'error')
      return false
    }
    const saved = appendItems([createUrlItem(normalized, name, appearance)], takeAddTargetId())
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

  const patchItem = useCallback((itemId, patch) => {
    const latestGroup = groupsRef.current.find((group) => group.id === activeId)
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
    })
    if (saved) showToast('uTools 插件已更新')
    return saved
  }, [editPluginTarget, patchItem, showToast])

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

  const runGroupPickerAction = useCallback(async (picker, targetGroupId) => {
    if (!picker || !targetGroupId) return
    if (picker.kind === 'add-group') {
      const host = groupsRef.current.find((group) => group.id === picker.hostGroupId)
      const source = groupsRef.current.find((group) => group.id === targetGroupId)
      if (!host || !source) return
      // 分组入口不能指向宿主分组自己（点进去还是同一个分组）；指向别的分组随便套，
      // 哪怕那个分组里也有本分组的入口，也只是互为入口而已
      const nestError = groupNestError(source, host)
      if (nestError) {
        showToast(nestError, 'warning')
        return
      }
      const linked = host.items.some((item) => (
        item.type === ITEM_TYPES.GROUP && item.groupId === source.id
      ))
      if (linked) {
        showToast(`「${source.name}」已在当前分组中`, 'warning')
        return
      }
      const nextGroups = groupsRef.current.map((group) => (
        group.id === host.id
          ? { ...group, items: [...group.items, createGroupItem(source)] }
          : group
      ))
      if (commitGroups(nextGroups).ok) {
        showToast(`已把「${source.name}」加入「${host.name}」`)
      }
      return
    }
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

  const handlePickerSelect = useCallback((targetGroupId) => {
    const picker = groupPicker
    setGroupPicker(null)
    runGroupPickerAction(picker, targetGroupId)
  }, [groupPicker, runGroupPickerAction])

  // 「+ → 添加分组」：选一个已有分组，作为一条入口放进 hostGroupId（默认当前分组）
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

  const handleExport = () => exportGroups(groupsRef.current)
  const handleExportGroup = (group) => {
    if (!group) return
    return exportGroups([group], group.name)
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
          items.push({ ...itemRest, customIconRef: itemIconRef })
        }

        imported.push({ ...rest, items, customIconRef, backgroundRef })
      }

      const previousGroups = groupsRef.current
      const { groups: mergedGroups, warnings } = mergeImportedGroups(previousGroups, imported)
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
      if (iconFailures) parts.push(`${iconFailures} 个图标未能导入`)
      showToast(parts.join('，'), warnings.length || iconFailures ? 'warning' : 'success')
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
    if (retainedGroupPicker?.kind !== 'add-group') return groups
    const linked = new Set(
      (pickerHostGroup?.items || [])
        .filter((item) => item.type === ITEM_TYPES.GROUP)
        .map((item) => item.groupId)
    )
    // 「添加分组」时宿主分组自己也不在候选里（由弹窗的 excludeGroupId 过滤掉），
    // 这里只把已经加进去的目标去掉；A 里有 B、B 里有 A 这种互相包含是允许的
    return groups.filter((group) => !linked.has(group.id))
  })()
  const pickerTitle = (() => {
    if (retainedGroupPicker?.kind === 'add-group') return '添加分组'
    return retainedGroupPicker?.kind === 'add-files' ? '添加到分组' : '复制到分组'
  })()
  const pickerDescription = (() => {
    if (retainedGroupPicker?.kind === 'add-group') {
      return pickerHostGroup
        ? `选择要加入「${pickerHostGroup.name}」的分组`
        : '选择要加入当前分组的分组'
    }
    return retainedGroupPicker?.kind === 'add-files'
      ? `将选中的 ${retainedGroupPicker.paths.length} 个项目添加到分组`
      : `将选中的 ${retainedGroupPicker?.ids.length} 个条目复制到分组`
  })()
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
              addTargetRef.current = targetGroupId || null
              setUrlDialogOpen(true)
            }}
            onAddPlugin={(targetGroupId) => {
              addTargetRef.current = targetGroupId || null
              setPluginDialogOpen(true)
            }}
            onReorderItems={handleReorderItems}
            onMoveItem={handleMoveItem}
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
          onExport={handleExport}
          onEditGroup={(group) => {
            setQuery('')
            setEditor(group)
          }}
          onExportGroup={handleExportGroup}
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
                onAddFiles={handleAddFiles}
                onAddFolders={handleAddFolders}
                onAddSoftware={handleAddSoftware}
                onAddUrl={() => setUrlDialogOpen(true)}
                onAddPlugin={() => setPluginDialogOpen(true)}
                onAddGroup={handleAddGroupRequest}
                onToggleKeyword={() => handleUpdateGroupFlags(activeGroup.id, { keywordMatch: !activeGroup.keywordMatch })}
                onToggleQuickLaunch={() => handleUpdateGroupFlags(activeGroup.id, { quickLaunch: !activeGroup.quickLaunch })}
                onToggleUtoolsSearch={() => handleUpdateGroupFlags(activeGroup.id, { utoolsSearch: !activeGroup.utoolsSearch })}
                onLaunch={handleLaunch}
                onRemoveItem={handleRemoveItem}
                onRemoveItems={handleRemoveItems}
                onCopyItems={handleCopyItems}
                onReorderItems={handleReorderItems}
                onEditItem={(item) => {
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
          emptyText={retainedGroupPicker.kind === 'add-group'
            ? '没有可以加入的分组了'
            : undefined}
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
            const saved = patchItem(retainedEditItem.id, patch)
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
          onDelete={handleRemoveItem}
        />
      )}

      {urlDialogPresence.mounted && (
        <AddUrlDialog
          key="add-url-dialog"
          open={urlDialogPresence.open}
          onClose={() => {
            addTargetRef.current = null
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
