import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  createFileItem,
  createGroup,
  createPluginItem,
  createUrlItem,
  extractGroupQuery,
  getGroupIdFromFeatureCode,
  loadGroups,
  loadThemeMode,
  loadViewMode,
  mergeImportedGroups,
  normalizeUrl,
  parseBackup,
  saveGroups,
  saveThemeMode,
  saveViewMode,
  syncGroupFeatures,
  validateGroupKeywords
} from './data'
import Sidebar from './components/Sidebar'
import GroupContent from './components/GroupContent'
import GroupEditorDialog from './components/GroupEditorDialog'
import AddSoftwareDialog from './components/AddSoftwareDialog'
import { AddPluginDialog, AddUrlDialog } from './components/AddItemDialogs'
import { cacheCustomIcon, getGroupFeatureIcon, getGroupFeatureIconSync } from './icons'

function nowToastId () {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const LAUNCH_GAP = 150

export default function App () {
  const [mode, setMode] = useState(loadThemeMode)
  const [groups, setGroups] = useState(loadGroups)
  const [activeId, setActiveId] = useState(() => groups[0]?.id || null)
  const [viewMode, setViewMode] = useState(loadViewMode)
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState(null)
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
  const [chooseAppTarget, setChooseAppTarget] = useState(null)

  const groupsRef = useRef(groups)
  const dragDepth = useRef(0)
  const addBusyRef = useRef(false)
  const launchingRef = useRef(false)
  const themeTransitionRef = useRef(null)
  const mainPushSelectionRef = useRef(new Map())
  const theme = useMemo(() => createAppTheme(mode), [mode])
  const surfaces = useMemo(() => getSurfaces(mode), [mode])
  const activeGroup = groups.find((group) => group.id === activeId) || null

  useEffect(() => {
    groupsRef.current = groups
  }, [groups])

  const showToast = useCallback((message, severity = 'success') => {
    setToast({ id: nowToastId(), message, severity })
  }, [])

  const commitGroups = useCallback((nextGroups) => {
    try {
      saveGroups(nextGroups)
      setGroups(nextGroups)
      return { ok: true }
    } catch {
      showToast('保存失败，请检查应用存储空间', 'error')
      return { ok: false }
    }
  }, [showToast])

  const handleViewChange = useCallback((nextView) => {
    setViewMode(nextView)
    saveViewMode(nextView)
  }, [])

  const handleToggleMode = useCallback((event) => {
    const next = mode === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    const source = event?.currentTarget || document.querySelector('.theme-toggle-icon')
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
      flushSync(() => setMode(next))
      saveThemeMode(next)
      root.dataset.theme = next
      root.style.colorScheme = next
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
    try {
      const transition = document.startViewTransition(apply)
      themeTransitionRef.current = transition
      const settle = () => {
        if (themeTransitionRef.current === transition) themeTransitionRef.current = null
        root.classList.remove('theme-no-transition')
      }
      transition.finished.then(settle, settle)
      if (transition.ready) transition.ready.catch(() => {})
      if (transition.updateCallbackDone) transition.updateCallbackDone.catch(() => {})
      if (transition.skipped) transition.skipped.catch(() => {})
    } catch {
      root.classList.remove('theme-no-transition')
      apply()
    }
  }, [mode])

  useEffect(() => {
    document.documentElement.dataset.theme = mode
    document.documentElement.style.colorScheme = mode
  }, [mode])

  const launchItem = useCallback(async (item) => {
    if (item.type === ITEM_TYPES.URL) {
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
        redirect([item.path, item.command || item.path])
        return ''
      } catch {
        return '无法跳转到该插件，请检查名称和指令'
      }
    }

    if (item.type === ITEM_TYPES.APP) {
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

    // 插件跳转会离开当前插件应用，因此放到最后处理
    const plainItems = group.items.filter((item) => item.type !== ITEM_TYPES.PLUGIN)
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
    syncGroupFeatures(groups, getGroupFeatureIcon).then((featureError) => {
      if (featureError) showToast(`关键词功能同步失败：${featureError}`, 'warning')
    })
  }, [groups, showToast])

  useEffect(() => {
    if (!window.utools?.onPluginEnter) return undefined
    window.utools.onPluginEnter(({ code }) => {
      setEditor(null)
      setDeleteTarget(null)
      setQuery('')
      setDragActive(false)
      setUrlDialogOpen(false)
      setPluginDialogOpen(false)
      setSoftwareDialogOpen(false)
      setChooseAppTarget(null)
      setImportPreview(null)
      setTransferBusy(false)
      dragDepth.current = 0

      const groupId = getGroupIdFromFeatureCode(code)
      if (groupId) {
        const group = groupsRef.current.find((item) => item.id === groupId)
        if (group) {
          setActiveId(groupId)
          if (group.quickLaunch && group.items.length > 0) {
            launchGroup(group)
          }
        }
      }
    })
    return undefined
  }, [launchGroup])

  useEffect(() => {
    if (typeof window.utools?.onMainPush !== 'function') return undefined

    window.utools.onMainPush((action) => {
      const code = action?.code
      const groupId = getGroupIdFromFeatureCode(code)
      if (!groupId) return []
      const group = groupsRef.current.find((item) => item.id === groupId)
      if (!group || !group.keywordMatch || !group.utoolsSearch) return []

      const payload = typeof action.payload === 'string' ? action.payload.trim() : ''
      const query = extractGroupQuery(group, payload)
      const needle = query.toLocaleLowerCase()
      const items = (needle
        ? group.items.filter((item) => (
            item.name.toLocaleLowerCase().includes(needle) ||
            item.path.toLocaleLowerCase().includes(needle) ||
            (item.command || '').toLocaleLowerCase().includes(needle)
          ))
        : group.items
      ).slice(0, 20)

      const fallbackIcon = getGroupFeatureIconSync(group) || (() => {
        try {
          return window.utools?.getFileIcon?.('folder') || ''
        } catch {
          return ''
        }
      })()
      const counts = new Map()
      return items.map((item) => {
        const base = item.name
        const count = (counts.get(base) || 0) + 1
        counts.set(base, count)
        const text = count === 1 ? base : `${base} (${count})`
        let icon = ''
        if (
          item.type === ITEM_TYPES.FILE ||
          item.type === ITEM_TYPES.FOLDER ||
          item.type === ITEM_TYPES.APP ||
          item.type === ITEM_TYPES.URL
        ) {
          try {
            icon = window.utools?.getFileIcon?.(item.path) || ''
          } catch {}
        }
        mainPushSelectionRef.current.set(`${code}\u0000${text}`, item.id)
        return { icon: icon || fallbackIcon, text, title: item.path }
      })
    }, (action) => {
      const code = action?.code
      const groupId = getGroupIdFromFeatureCode(code)
      if (!groupId) return false
      const group = groupsRef.current.find((item) => item.id === groupId)
      if (!group) return false
      const text = action?.option?.text
      if (!text) return false

      const itemId = mainPushSelectionRef.current.get(`${code}\u0000${text}`)
      const item = group.items.find((entry) => entry.id === itemId) ||
        group.items.find((entry) => entry.name === text)
      if (!item) return false

      launchItem(item)
        .then((error) => {
          if (error) {
            window.utools?.showNotification?.(`无法打开「${item.name}」：${error}`)
            return
          }
          if (item.type !== ITEM_TYPES.PLUGIN) {
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

  const handleSaveGroup = (nextGroup) => {
    const exists = groups.some((group) => group.id === nextGroup.id)
    const nextGroups = exists
      ? groups.map((group) => (group.id === nextGroup.id ? nextGroup : group))
      : [...groups, nextGroup]

    const saved = commitGroups(nextGroups)
    if (!saved.ok) return false

    setActiveId(nextGroup.id)
    setQuery('')
    setEditor(null)
    showToast(exists ? '分组已更新' : '分组已创建')
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

    if (patch.keywordMatch !== undefined) {
      showToast(patch.keywordMatch ? '已开启关键词匹配' : '已关闭关键词匹配')
    } else if (patch.quickLaunch !== undefined) {
      showToast(patch.quickLaunch ? '已开启一键启动' : '已关闭一键启动')
    } else if (patch.utoolsSearch !== undefined) {
      showToast(patch.utoolsSearch ? '已开启 uTools 搜索候选' : '已关闭 uTools 搜索候选')
    }

    return true
  }, [commitGroups, showToast])

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return
    const target = deleteTarget
    const nextGroups = groups.filter((group) => group.id !== target.id)
    const saved = commitGroups(nextGroups)
    if (!saved.ok) return

    if (target.customIconRef) {
      const stillUsed = nextGroups.some((group) => group.customIconRef === target.customIconRef)
      if (!stillUsed) {
        cacheCustomIcon(target.customIconRef, null)
        window.services?.deleteCustomIcon?.(target.customIconRef)
      }
    }
    if (activeId === target.id) {
      setActiveId(nextGroups[0]?.id || null)
      setQuery('')
    }
    setDeleteTarget(null)
    showToast('分组已删除')
  }

  const appendItems = useCallback((newItems) => {
    const targetId = activeId
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
      showToast('这些项目已在当前分组中', 'warning')
      return false
    }

    const nextGroups = groupsRef.current.map((group) => (
      group.id === targetId
        ? { ...group, items: [...group.items, ...fresh] }
        : group
    ))
    return commitGroups(nextGroups).ok
  }, [activeId, commitGroups, showToast])

  const addPaths = useCallback(async (paths) => {
    if (!paths?.length) return false
    const targetId = activeId
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
          failed > 0 ? '无法读取所选项目，请确认文件仍然存在' : '这些项目已在当前分组中',
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

  const handleAddFiles = async () => {
    try {
      const paths = await window.services.pickFiles()
      if (paths?.length) await addPaths(paths)
    } catch {
      showToast('无法打开文件选择器', 'error')
    }
  }

  const handleAddFolders = async () => {
    try {
      const paths = await window.services.pickFolders()
      if (paths?.length) await addPaths(paths)
    } catch {
      showToast('无法打开文件夹选择器', 'error')
    }
  }

  const handleAddSoftware = () => {
    if (!activeGroup) return
    setSoftwareDialogOpen(true)
  }

  const handleAddSoftwarePaths = async (paths) => {
    return addPaths(paths)
  }

  const handleAddUrl = ({ name, url }) => {
    const normalized = normalizeUrl(url)
    if (!normalized) {
      showToast('请输入有效的网址', 'error')
      return false
    }
    const saved = appendItems([createUrlItem(normalized, name)])
    if (saved) showToast('已添加网址')
    return saved
  }

  const handleAddPlugin = ({ pluginName, command, name }) => {
    if (!pluginName.trim()) {
      showToast('请输入 uTools 插件应用名称', 'error')
      return false
    }
    const saved = appendItems([createPluginItem(pluginName, command, name)])
    if (saved) showToast('已添加 uTools 插件')
    return saved
  }

  const handleLaunch = async (item) => {
    if (launchingRef.current) return
    launchingRef.current = true
    setLaunchingId(item.id)
    try {
      const error = await launchItem(item)
      if (error) {
        showToast(`无法打开「${item.name}」：${error}`, 'error')
        return
      }
      if (item.type !== ITEM_TYPES.PLUGIN) window.utools.outPlugin?.()
    } catch {
      showToast(`无法打开「${item.name}」`, 'error')
    } finally {
      launchingRef.current = false
      setLaunchingId(null)
    }
  }

  const patchItem = useCallback((itemId, patch) => {
    const latestGroup = groupsRef.current.find((group) => group.id === activeId)
    if (!latestGroup) return
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
    commitGroups(nextGroups)
  }, [activeId, commitGroups])

  const handleChooseApp = (item) => {
    setChooseAppTarget(item)
  }

  const handleChooseAppPath = (path, app) => {
    const target = chooseAppTarget
    setChooseAppTarget(null)
    if (!target || !path) return
    patchItem(target.id, { openWith: path })
    showToast(`「${target.name}」的打开应用已设为 ${app?.name || path.split(/[\\/]/).pop() || path}`)
  }

  const handleClearApp = (item) => {
    patchItem(item.id, { openWith: '' })
    showToast(
      item.type === ITEM_TYPES.URL
        ? `「${item.name}」将使用系统默认浏览器打开`
        : `「${item.name}」将使用默认应用打开`
    )
  }

  const handleRemoveItem = (item) => {
    const group = groupsRef.current.find((current) => current.id === activeId)
    if (!group) return
    const nextGroups = groupsRef.current.map((current) => (
      current.id === group.id
        ? { ...current, items: current.items.filter((entry) => entry.id !== item.id) }
        : current
    ))
    const result = commitGroups(nextGroups)
    if (result.ok) showToast('已从分组移除')
  }

  const handleRemoveItems = useCallback((ids) => {
    if (!Array.isArray(ids) || !ids.length) return
    const group = groupsRef.current.find((current) => current.id === activeId)
    if (!group) return

    const idSet = new Set(ids)
    const remaining = group.items.filter((item) => !idSet.has(item.id))
    const removed = group.items.length - remaining.length
    if (!removed) return

    const nextGroups = groupsRef.current.map((current) => (
      current.id === group.id ? { ...current, items: remaining } : current
    ))
    const result = commitGroups(nextGroups)
    if (result.ok) showToast(`已删除 ${removed} 个快捷方式`)
  }, [activeId, commitGroups, showToast])

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
        const { customIconRef, ...rest } = group
        let customIcon = ''
        if (customIconRef) {
          try {
            customIcon = await window.services.readCustomIcon?.(customIconRef) || ''
          } catch {}
          if (!customIcon) iconFailures += 1
        }
        return { ...rest, customIcon }
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
        const { customIcon, ...rest } = group
        let customIconRef = rest.customIconRef || null

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

        imported.push({ ...rest, customIconRef })
      }

      const { groups: mergedGroups, warnings } = mergeImportedGroups(groupsRef.current, imported)
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
      const usedRefs = new Set(mergedGroups.map((group) => group.customIconRef).filter(Boolean))
      groupsRef.current.forEach((group) => {
        if (!group.customIconRef || !importedNames.has(group.name.trim().toLocaleLowerCase())) return
        if (usedRefs.has(group.customIconRef)) return
        cacheCustomIcon(group.customIconRef, null)
        window.services?.deleteCustomIcon?.(group.customIconRef)
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
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length]
    setEditor(createGroup({ name: '', color }))
  }

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          gap: '14px',
          p: '14px',
          overflow: 'hidden',
          bgcolor: mode === 'dark' ? '#17181b' : '#f3f5f8',
          backgroundImage: mode === 'dark'
            ? 'radial-gradient(900px 620px at 8% 0%, rgba(96, 165, 250, 0.10), transparent 62%), radial-gradient(760px 520px at 100% 0%, rgba(168, 85, 247, 0.08), transparent 58%)'
            : 'radial-gradient(900px 620px at 8% 0%, rgba(18, 118, 197, 0.07), transparent 62%), radial-gradient(760px 520px at 100% 0%, rgba(139, 92, 246, 0.05), transparent 58%)',
          transition: 'background-color 180ms ease'
        }}
      >
        <Sidebar
          groups={groups}
          activeId={activeId}
          mode={mode}
          surfaces={surfaces}
          onToggleMode={handleToggleMode}
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
                group={activeGroup}
                query={query}
                view={viewMode}
                surfaces={surfaces}
                adding={adding}
                launchingId={launchingId}
                onQueryChange={setQuery}
                onViewChange={handleViewChange}
                onEdit={() => setEditor(activeGroup)}
                onAddFiles={handleAddFiles}
                onAddFolders={handleAddFolders}
                onAddSoftware={handleAddSoftware}
                onAddUrl={() => setUrlDialogOpen(true)}
                onAddPlugin={() => setPluginDialogOpen(true)}
                onToggleKeyword={() => handleUpdateGroupFlags(activeGroup.id, { keywordMatch: !activeGroup.keywordMatch })}
                onToggleQuickLaunch={() => handleUpdateGroupFlags(activeGroup.id, { quickLaunch: !activeGroup.quickLaunch })}
                onToggleUtoolsSearch={() => handleUpdateGroupFlags(activeGroup.id, { utoolsSearch: !activeGroup.utoolsSearch })}
                onLaunch={handleLaunch}
                onRemoveItem={handleRemoveItem}
                onRemoveItems={handleRemoveItems}
                onRevealItem={handleRevealItem}
                onRunAsAdmin={handleRunAsAdmin}
                onChooseApp={handleChooseApp}
                onClearApp={handleClearApp}
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

      <Snackbar
        key={toast?.id}
        open={Boolean(toast)}
        autoHideDuration={3400}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
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

      <GroupEditorDialog
        open={Boolean(editor)}
        group={editor}
        groups={groups}
        onClose={() => setEditor(null)}
        onSave={handleSaveGroup}
        onDeleteRequest={(group) => {
          setEditor(null)
          setDeleteTarget(group)
        }}
      />

      <AddUrlDialog
        open={urlDialogOpen}
        onClose={() => setUrlDialogOpen(false)}
        onSubmit={handleAddUrl}
      />

      <AddPluginDialog
        open={pluginDialogOpen}
        onClose={() => setPluginDialogOpen(false)}
        onSubmit={handleAddPlugin}
      />

      <AddSoftwareDialog
        open={softwareDialogOpen || Boolean(chooseAppTarget)}
        mode={chooseAppTarget ? 'choose' : 'add'}
        title={chooseAppTarget ? `选择打开「${chooseAppTarget.name}」的应用` : '添加软件'}
        onClose={() => {
          setSoftwareDialogOpen(false)
          setChooseAppTarget(null)
        }}
        onAdd={handleAddSoftwarePaths}
        onChoose={handleChooseAppPath}
      />

      <Dialog
        open={Boolean(deleteTarget)}
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
            确定删除「{deleteTarget?.name}」？快捷方式会一并移除，源文件不受影响。
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

      <Dialog
        open={Boolean(importPreview)}
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
            从「{importPreview?.fileName}」导入 {importPreview?.groups.length || 0} 个分组？同名分组会被覆盖，其余分组保留。
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
    </ThemeProvider>
  )
}
