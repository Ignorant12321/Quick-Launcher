import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ThemeProvider } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded'
import { createAppTheme, getSurfaces } from './theme'
import {
  FEATURE_PREFIX,
  GROUP_COLORS,
  ITEM_TYPES,
  createFileItem,
  createGroup,
  createPluginItem,
  createUrlItem,
  loadGroups,
  loadThemeMode,
  loadViewMode,
  normalizeUrl,
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
import { getGroupFeatureIcon } from './icons'

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

  const groupsRef = useRef(groups)
  const dragDepth = useRef(0)
  const addBusyRef = useRef(false)
  const launchingRef = useRef(false)
  const themeTransitionRef = useRef(null)
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
    const featureError = syncGroupFeatures(groups, getGroupFeatureIcon)
    if (featureError) showToast(`关键词功能同步失败：${featureError}`, 'warning')
  }, [])

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
      dragDepth.current = 0

      if (typeof code === 'string' && code.startsWith(FEATURE_PREFIX)) {
        const groupId = code.slice(FEATURE_PREFIX.length)
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

    const featureError = syncGroupFeatures(nextGroups, getGroupFeatureIcon)
    setActiveId(nextGroup.id)
    setQuery('')
    setEditor(null)

    if (featureError) {
      showToast(`分组已保存，但关键词同步失败：${featureError}`, 'warning')
    } else {
      showToast(exists ? '分组已更新' : '分组已创建')
    }
    return true
  }

  const handleUpdateGroupFlags = useCallback((groupId, patch) => {
    const group = groupsRef.current.find((item) => item.id === groupId)
    if (!group) return false

    const keywordMatch = patch.keywordMatch ?? group.keywordMatch
    const candidate = {
      ...group,
      ...patch,
      keywordMatch,
      quickLaunch: keywordMatch ? (patch.quickLaunch ?? group.quickLaunch) : false
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

    const featureError = syncGroupFeatures(nextGroups, getGroupFeatureIcon)
    if (featureError) {
      showToast(`设置已保存，但关键词同步失败：${featureError}`, 'warning')
    } else if (patch.keywordMatch !== undefined) {
      showToast(patch.keywordMatch ? '已开启关键词匹配' : '已关闭关键词匹配')
    } else if (patch.quickLaunch !== undefined) {
      showToast(patch.quickLaunch ? '已开启一键启动' : '已关闭一键启动')
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
      window.services?.deleteCustomIcon?.(target.customIconRef)
    }
    const featureError = syncGroupFeatures(nextGroups, getGroupFeatureIcon)
    if (activeId === target.id) {
      setActiveId(nextGroups[0]?.id || null)
      setQuery('')
    }
    setDeleteTarget(null)

    if (featureError) {
      showToast(`分组已删除，但关键词同步失败：${featureError}`, 'warning')
    } else {
      showToast('分组已删除')
    }
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

  const handleChooseApp = async (item) => {
    try {
      const app = await window.services.pickApplication()
      if (!app) return
      patchItem(item.id, { openWith: app.path })
      showToast(`「${item.name}」的打开应用已设为 ${app.name}`)
    } catch {
      showToast('无法选择打开应用', 'error')
    }
  }

  const handleClearApp = (item) => {
    patchItem(item.id, { openWith: '' })
    showToast(`「${item.name}」将使用默认应用打开`)
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

  const handleRevealItem = (item) => {
    window.services?.revealPath?.(item.path)
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
                onLaunch={handleLaunch}
                onRemoveItem={handleRemoveItem}
                onRevealItem={handleRevealItem}
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
        open={softwareDialogOpen}
        onClose={() => setSoftwareDialogOpen(false)}
        onAdd={handleAddSoftwarePaths}
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
    </ThemeProvider>
  )
}
