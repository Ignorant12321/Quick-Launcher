import React, { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import BrightnessAutoRoundedIcon from '@mui/icons-material/BrightnessAutoRounded'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import KeyboardRoundedIcon from '@mui/icons-material/KeyboardRounded'
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ImportExportRoundedIcon from '@mui/icons-material/ImportExportRounded'
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded'
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded'
import Tooltip from '@mui/material/Tooltip'
import { GroupAvatar, RoundAddIcon } from '../icons'
import { useScrollFade, scrollFadeSx } from '../useScrollFade'

export default function Sidebar ({
  groups,
  activeId,
  themeMode,
  surfaces,
  collapsed = false,
  onToggleCollapsed,
  onThemeChange,
  onSelect,
  onCreate,
  onImport,
  onExport,
  onEditGroup,
  onExportGroup,
  onDeleteGroup,
  onReorderGroups,
  onDropItemToGroup,
  transferBusy
}) {
  const [transferAnchor, setTransferAnchor] = useState(null)
  const [themeAnchor, setThemeAnchor] = useState(null)
  const [groupMenu, setGroupMenu] = useState({ group: null, anchorPosition: null })
  const [groupDrag, setGroupDrag] = useState({ id: null, overId: null, side: null })
  const [itemDropId, setItemDropId] = useState(null)
  const groupDragRef = useRef({ id: null, suppressClickUntil: 0 })

  const themeOptions = [
    { value: 'auto', label: '跟随 uTools', Icon: BrightnessAutoRoundedIcon },
    { value: 'light', label: '浅色', Icon: LightModeRoundedIcon },
    { value: 'dark', label: '深色', Icon: DarkModeRoundedIcon }
  ]
  const currentTheme = themeOptions.find((option) => option.value === themeMode) || themeOptions[0]
  const ThemeIcon = currentTheme.Icon

  useEffect(() => {
    if (!groupMenu.anchorPosition) return undefined
    const handlePointerDown = (event) => {
      const target = event.target
      if (target instanceof Element && target.closest('.MuiMenu-paper, [role="menu"]')) return
      setGroupMenu({ group: null, anchorPosition: null })
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [groupMenu.anchorPosition])

  useEffect(() => {
    const clearItemDrop = () => setItemDropId(null)
    window.addEventListener('dragend', clearItemDrop)
    window.addEventListener('drop', clearItemDrop)
    return () => {
      window.removeEventListener('dragend', clearItemDrop)
      window.removeEventListener('drop', clearItemDrop)
    }
  }, [])

  const canReorderGroups = Boolean(onReorderGroups) && groups.length > 1
  const itemDragType = 'application/x-quick-launcher-item-json'
  const isItemDrag = (event) => (
    Array.from(event.dataTransfer?.types || []).includes(itemDragType)
  )

  const handleGroupDragStart = (event, group) => {
    if (!canReorderGroups) {
      event.preventDefault()
      return
    }
    groupDragRef.current.id = group.id
    groupDragRef.current.suppressClickUntil = Date.now() + 300
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      try {
        event.dataTransfer.setData('application/x-quick-launcher-group', group.id)
      } catch {}
    }
    setGroupDrag({ id: group.id, overId: null, side: null })
  }

  const handleGroupDragOver = (event, group) => {
    if (isItemDrag(event)) {
      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setItemDropId(group.id)
      return
    }
    const draggedId = groupDragRef.current.id
    if (!canReorderGroups || !draggedId || draggedId === group.id) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    const side = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setGroupDrag((previous) => (
      previous.id === draggedId && previous.overId === group.id && previous.side === side
        ? previous
        : { id: draggedId, overId: group.id, side }
    ))
  }

  const handleGroupDragLeave = (event, group) => {
    const related = event.relatedTarget
    if (related instanceof Node && event.currentTarget.contains(related)) return
    if (itemDropId === group.id) setItemDropId(null)
    setGroupDrag((previous) => (
      previous.overId === group.id ? { ...previous, overId: null, side: null } : previous
    ))
  }

  const handleGroupDrop = (event, group) => {
    const rawItem = event.dataTransfer?.getData(itemDragType)
    if (rawItem) {
      event.preventDefault()
      event.stopPropagation()
      setItemDropId(null)
      groupDragRef.current.suppressClickUntil = Date.now() + 350
      try {
        onDropItemToGroup?.(JSON.parse(rawItem), group.id)
      } catch {}
      return
    }
    const draggedId = groupDragRef.current.id ||
      event.dataTransfer?.getData('application/x-quick-launcher-group')
    if (!canReorderGroups || !draggedId || draggedId === group.id) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const side = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    groupDragRef.current.id = null
    groupDragRef.current.suppressClickUntil = Date.now() + 350
    setGroupDrag({ id: null, overId: null, side: null })
    onReorderGroups?.(draggedId, group.id, side === 'after')
  }

  const handleGroupDragEnd = () => {
    groupDragRef.current.id = null
    groupDragRef.current.suppressClickUntil = Date.now() + 350
    setGroupDrag({ id: null, overId: null, side: null })
  }

  const selectGroup = (groupId) => {
    if (Date.now() < groupDragRef.current.suppressClickUntil) return
    onSelect(groupId)
  }

  const groupListRef = useRef(null)
  const groupListFade = useScrollFade(groupListRef)

  // 把焦点和滚动条都落到目标分组上（分组列表是单列，方向键只需上下，左右退化为同一个动作）
  const focusGroup = (groupId) => {
    const container = groupListRef.current
    if (!container) return
    const node = container.querySelector(`[data-group-id="${String(groupId).replace(/["\\]/g, '')}"]`)
    if (!node) return
    node.focus({ preventScroll: true })
    const boxRect = container.getBoundingClientRect()
    const rect = node.getBoundingClientRect()
    if (rect.top < boxRect.top) container.scrollTop -= boxRect.top - rect.top + 6
    else if (rect.bottom > boxRect.bottom) container.scrollTop += rect.bottom - boxRect.bottom + 6
  }

  // 分组列表里的方向键：↑ / ← 上一个，↓ / → 下一个，Home / End 首尾；到头首尾相接
  const handleGroupKeyDown = (event, group) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (!groups.length) return
    const key = event.key
    const isArrow = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight'
    if (!isArrow && key !== 'Home' && key !== 'End') return

    const currentIndex = groups.findIndex((entry) => entry.id === group.id)
    let nextIndex
    if (key === 'Home') {
      nextIndex = 0
    } else if (key === 'End') {
      nextIndex = groups.length - 1
    } else {
      const step = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1
      const base = currentIndex < 0 ? (step > 0 ? -1 : 0) : currentIndex
      nextIndex = (base + step + groups.length) % groups.length
    }
    const nextGroup = groups[nextIndex]
    if (!nextGroup) return
    event.preventDefault()
    event.stopPropagation()
    if (nextGroup.id !== group.id) onSelect(nextGroup.id)
    focusGroup(nextGroup.id)
  }

  return (
    <Paper
      component="aside"
      elevation={0}
      sx={{
        width: collapsed ? 80 : 204,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: '16px',
        bgcolor: surfaces.panel,
        border: '1px solid',
        borderColor: surfaces.border,
        boxShadow: surfaces.shadow,
        backdropFilter: 'blur(18px)',
        transition: 'width 220ms cubic-bezier(0.2, 0, 0, 1)'
      }}
    >
      <Box
        sx={{
          px: collapsed ? 0.5 : 1.6,
          pt: 1.6,
          pb: 1.2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : 0.75,
          transition: 'padding 220ms cubic-bezier(0.2, 0, 0, 1)'
        }}
      >
        {collapsed
          ? (
            <Tooltip title="展开分组导航">
              <IconButton
                onClick={onToggleCollapsed}
                aria-label="展开分组导航"
                aria-expanded={false}
                sx={{ p: 0.25, borderRadius: '10px' }}
              >
                <Box
                  component="img"
                  src="logo.png"
                  alt=""
                  sx={{ width: 30, height: 30, borderRadius: '9px', display: 'block', objectFit: 'contain' }}
                />
              </IconButton>
            </Tooltip>
            )
          : (
            <>
              <Box
                role="button"
                tabIndex={0}
                aria-label="收起分组导航"
                aria-expanded
                onClick={onToggleCollapsed}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  onToggleCollapsed()
                }}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  cursor: 'pointer',
                  borderRadius: '9px',
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: 2
                  }
                }}
              >
                <Box
                  component="img"
                  src="logo.png"
                  alt=""
                  sx={{ width: 30, height: 30, borderRadius: '9px', display: 'block', objectFit: 'contain', flexShrink: 0 }}
                />
                <Typography
                  noWrap
                  sx={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, lineHeight: 1.15, letterSpacing: 0.1 }}
                >
                  Quick Launcher
                </Typography>
              </Box>
              <Tooltip title="收起分组导航">
                <IconButton
                  size="small"
                  onClick={onToggleCollapsed}
                  aria-label="收起分组导航"
                  aria-expanded
                  sx={{ width: 24, height: 24, p: 0.25, flexShrink: 0, color: 'text.secondary' }}
                >
                  <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </>
            )}
      </Box>

      <Box
        sx={{
          height: collapsed ? 0 : 28,
          opacity: collapsed ? 0 : 1,
          overflow: 'hidden',
          transition: 'height 220ms cubic-bezier(0.2, 0, 0, 1), opacity 140ms ease'
        }}
      >
        <Box sx={{ px: 1.6, pt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: 'text.secondary', letterSpacing: 0.7 }}>
            分组
          </Typography>
          <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>
            {groups.length}
          </Typography>
        </Box>
      </Box>

      <Box
        ref={groupListRef}
        className="scroll-fade"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: collapsed ? 0.5 : 0.8,
          pb: 1,
          ...scrollFadeSx(groupListFade, 16),
          scrollbarWidth: collapsed ? 'none' : undefined,
          '&::-webkit-scrollbar': collapsed ? { display: 'none' } : undefined
        }}
      >
        {groups.length === 0 && !collapsed && (
          <Typography sx={{ px: 1, py: 2, fontSize: 11.5, color: 'text.secondary', textAlign: 'center' }}>
            还没有分组
          </Typography>
        )}

        {groups.map((group) => {
          const active = group.id === activeId
          const dragging = groupDrag.id === group.id
          const dropSide = groupDrag.overId === group.id ? groupDrag.side : null
          return (
            <Tooltip
              key={group.id}
              title={collapsed ? group.name : ''}
              placement="right"
            >
            <Box
              component="button"
              type="button"
              data-group-id={group.id}
              draggable={canReorderGroups}
              aria-grabbed={dragging || undefined}
              aria-current={active ? 'true' : undefined}
              onClick={() => selectGroup(group.id)}
              onKeyDown={(event) => {
                const key = event.key
                if (
                  key === 'ArrowUp' || key === 'ArrowDown' ||
                  key === 'ArrowLeft' || key === 'ArrowRight' ||
                  key === 'Home' || key === 'End'
                ) {
                  handleGroupKeyDown(event, group)
                  return
                }
                if (key !== 'Delete') return
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
                event.preventDefault()
                event.stopPropagation()
                onDeleteGroup?.(group)
              }}
              onDragStart={(event) => handleGroupDragStart(event, group)}
              onDragOver={(event) => handleGroupDragOver(event, group)}
              onDragLeave={(event) => handleGroupDragLeave(event, group)}
              onDrop={(event) => handleGroupDrop(event, group)}
              onDragEnd={handleGroupDragEnd}
              onContextMenu={(event) => {
                event.preventDefault()
                onSelect(group.id)
                setGroupMenu({
                  group,
                  anchorPosition: { top: event.clientY, left: event.clientX }
                })
              }}
              sx={{
                position: 'relative',
                width: '100%',
                border: 0,
                p: '6px 8px',
                pl: collapsed ? 2 : 1,
                pr: collapsed ? 2 : 1,
                mb: 0.4,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : 1,
                textAlign: 'left',
                fontFamily: 'inherit',
                color: 'text.primary',
                opacity: dragging ? 0.45 : 1,
                userSelect: 'none',
                bgcolor: collapsed
                  ? 'transparent'
                  : (itemDropId === group.id
                      ? 'action.hover'
                      : (active ? 'action.selected' : 'transparent')),
                boxShadow: !collapsed && itemDropId === group.id
                  ? (theme) => `inset 0 0 0 1px ${theme.palette.primary.main}`
                  : 'none',
                cursor: canReorderGroups ? 'grab' : 'pointer',
                transition: 'padding 220ms cubic-bezier(0.2, 0, 0, 1), background-color 140ms ease, box-shadow 140ms ease, opacity 120ms ease',
                '&::after': dropSide
                  ? {
                      content: '""',
                      position: 'absolute',
                      left: 8,
                      right: 8,
                      height: 3,
                      borderRadius: '999px',
                      bgcolor: 'primary.main',
                      zIndex: 2,
                      pointerEvents: 'none',
                      ...(dropSide === 'before' ? { top: 0 } : { bottom: 0 })
                    }
                  : undefined,
                '&:hover': {
                  bgcolor: collapsed ? 'transparent' : (active ? 'action.selected' : 'action.hover'),
                  '& .group-rail-chip': collapsed
                    ? { bgcolor: active ? 'action.selected' : 'action.hover' }
                    : undefined
                },
                // 键盘上下切换分组时不画外框：选中态本身已有底色差异，
                // 而外框画在按钮外侧，会被滚动容器的上边缘裁掉一截
                '&:focus': { outline: 'none' },
                '&:focus-visible': { outline: 'none' }
              }}
            >
              <Box
                className="group-rail-chip"
                sx={{
                  width: collapsed ? 40 : 28,
                  height: collapsed ? 40 : 28,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '12px',
                  bgcolor: collapsed && active ? 'action.selected' : 'transparent',
                  transition: 'width 220ms cubic-bezier(0.2, 0, 0, 1), height 220ms cubic-bezier(0.2, 0, 0, 1), background-color 140ms ease'
                }}
              >
                <GroupAvatar group={group} size={28} />
              </Box>
              <Box
                sx={{
                  flex: collapsed ? '0 0 0px' : 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  opacity: collapsed ? 0 : 1,
                  transition: 'opacity 120ms ease'
                }}
              >
                <Typography
                  sx={{
                    fontSize: 12.5,
                    fontWeight: active ? 650 : 500,
                    lineHeight: 1.25,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {group.name}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.25,
                    fontSize: 10,
                    lineHeight: 1.2,
                    color: 'text.secondary',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {group.items.length === 0 ? '空分组' : `${group.items.length} 项`}
                </Typography>
              </Box>
              {!collapsed && (
                <>
                  {group.quickLaunch && (
                    <Tooltip title="已开启一键启动">
                      <RocketLaunchRoundedIcon sx={{ fontSize: 13, color: '#8B5CF6', opacity: 0.9 }} />
                    </Tooltip>
                  )}
                  {group.utoolsSearch && (
                    <Tooltip title="已开启 uTools 搜索功能">
                      <SearchRoundedIcon sx={{ fontSize: 13, color: '#2E9E6B', opacity: 0.9 }} />
                    </Tooltip>
                  )}
                  {group.keywordMatch && (
                    <Tooltip title="已开启 uTools 关键词匹配">
                      <KeyboardRoundedIcon sx={{ fontSize: 13, color: 'text.secondary', opacity: 0.72 }} />
                    </Tooltip>
                  )}
                </>
              )}
            </Box>
            </Tooltip>
          )
        })}
      </Box>

      <Box
        sx={{
          p: 1,
          borderTop: '1px solid',
          borderColor: surfaces.border,
          display: 'flex',
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: 'center',
          gap: collapsed ? 0.2 : 0.35
        }}
      >
        {collapsed
          ? (
            <Tooltip title="新建分组">
              <IconButton size="small" onClick={onCreate} aria-label="新建分组" sx={{ color: 'text.secondary' }}>
                <RoundAddIcon size={20} />
              </IconButton>
            </Tooltip>
            )
          : (
            <Button
              size="small"
              startIcon={<RoundAddIcon size={17} />}
              onClick={onCreate}
              sx={{
                flex: 1,
                justifyContent: 'flex-start',
                color: 'text.secondary',
                px: 1.1,
                py: 0.65,
                '&:hover': { bgcolor: 'action.hover' }
              }}
            >
              新建分组
            </Button>
            )}
        <Tooltip title="导入 / 导出配置">
          <span>
            <IconButton
              size="small"
              onClick={(event) => setTransferAnchor(event.currentTarget)}
              aria-label="导入或导出配置"
              disabled={transferBusy}
              sx={{ color: 'text.secondary' }}
            >
              {transferBusy
                ? <CircularProgress size={15} color="inherit" />
                : <ImportExportRoundedIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={`外观：${currentTheme.label}`}>
          <IconButton
            size="small"
            onClick={(event) => setThemeAnchor(event.currentTarget)}
            aria-label={`外观：${currentTheme.label}`}
            sx={{ color: 'text.secondary' }}
          >
            <Box
              className="theme-toggle-icon"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ThemeIcon sx={{ fontSize: 18 }} />
            </Box>
          </IconButton>
        </Tooltip>
      </Box>

      <Menu
        anchorEl={themeAnchor}
        open={Boolean(themeAnchor)}
        onClose={() => setThemeAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { minWidth: 176, borderRadius: '11px', mb: 0.75 } } }}
      >
        {themeOptions.map(({ value, label, Icon }) => (
          <MenuItem
            key={value}
            onClick={() => {
              setThemeAnchor(null)
              onThemeChange(value)
            }}
            sx={{ fontSize: 12.5, gap: 1.2 }}
          >
            <Icon sx={{ fontSize: 17, color: 'text.secondary' }} />
            <Box sx={{ flex: 1 }}>{label}</Box>
            {themeMode === value && (
              <CheckRoundedIcon sx={{ fontSize: 15, color: 'primary.main' }} />
            )}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={transferAnchor}
        open={Boolean(transferAnchor)}
        onClose={() => setTransferAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { minWidth: 158, borderRadius: '11px', mb: 0.75 } } }}
      >
        <MenuItem
          onClick={() => {
            setTransferAnchor(null)
            onImport()
          }}
          sx={{ fontSize: 12.5, gap: 1.2 }}
        >
          <FileUploadRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
          导入配置…
        </MenuItem>
        <MenuItem
          onClick={() => {
            setTransferAnchor(null)
            onExport()
          }}
          sx={{ fontSize: 12.5, gap: 1.2 }}
        >
          <FileDownloadRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
          导出配置…
        </MenuItem>
      </Menu>

      <Menu
        anchorReference="anchorPosition"
        anchorPosition={groupMenu.anchorPosition || undefined}
        open={Boolean(groupMenu.anchorPosition)}
        onClose={() => setGroupMenu({ group: null, anchorPosition: null })}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          root: { sx: { pointerEvents: 'none' } },
          backdrop: { sx: { pointerEvents: 'none' } },
          paper: { sx: { minWidth: 148, borderRadius: '11px', pointerEvents: 'auto' } }
        }}
      >
        <MenuItem
          onClick={() => {
            const group = groupMenu.group
            setGroupMenu({ group: null, anchorPosition: null })
            if (group) onEditGroup(group)
          }}
          sx={{ fontSize: 12.5, gap: 1.2 }}
        >
          <EditRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
          修改
        </MenuItem>
        <MenuItem
          onClick={() => {
            const group = groupMenu.group
            setGroupMenu({ group: null, anchorPosition: null })
            if (group) onExportGroup(group)
          }}
          sx={{ fontSize: 12.5, gap: 1.2 }}
        >
          <FileDownloadRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
          导出
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => {
            const group = groupMenu.group
            setGroupMenu({ group: null, anchorPosition: null })
            if (group) onDeleteGroup(group)
          }}
          sx={{ fontSize: 12.5, gap: 1.2, color: 'error.main' }}
        >
          <DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} />
          删除
        </MenuItem>
      </Menu>
    </Paper>
  )
}
