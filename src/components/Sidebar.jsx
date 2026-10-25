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
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import BrightnessAutoRoundedIcon from '@mui/icons-material/BrightnessAutoRounded'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import KeyboardRoundedIcon from '@mui/icons-material/KeyboardRounded'
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ImportExportRoundedIcon from '@mui/icons-material/ImportExportRounded'
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded'
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded'
import Tooltip from '@mui/material/Tooltip'
import { GroupAvatar } from '../icons'

export default function Sidebar ({
  groups,
  activeId,
  themeMode,
  surfaces,
  onThemeChange,
  onSelect,
  onCreate,
  onImport,
  onExport,
  onEditGroup,
  onExportGroup,
  onDeleteGroup,
  onReorderGroups,
  transferBusy
}) {
  const [transferAnchor, setTransferAnchor] = useState(null)
  const [themeAnchor, setThemeAnchor] = useState(null)
  const [groupMenu, setGroupMenu] = useState({ group: null, anchorPosition: null })
  const [groupDrag, setGroupDrag] = useState({ id: null, overId: null, side: null })
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

  const canReorderGroups = Boolean(onReorderGroups) && groups.length > 1

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
    setGroupDrag((previous) => (
      previous.overId === group.id ? { ...previous, overId: null, side: null } : previous
    ))
  }

  const handleGroupDrop = (event, group) => {
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

  return (
    <Paper
      elevation={0}
      sx={{
        width: 204,
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
        backdropFilter: 'blur(18px)'
      }}
    >
      <Box sx={{ px: 1.6, pt: 1.6, pb: 1.2, display: 'flex', alignItems: 'center', gap: 1.05 }}>
        <Box
          component="img"
          src="logo.png"
          alt=""
          sx={{ width: 30, height: 30, borderRadius: '9px', display: 'block', objectFit: 'contain' }}
        />
        <Typography sx={{ minWidth: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.15, letterSpacing: 0.1 }} noWrap>
          Quick Launcher
        </Typography>
      </Box>

      <Box sx={{ px: 1.6, pt: 1, pb: 0.7, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: 'text.secondary', letterSpacing: 0.7 }}>
          分组
        </Typography>
        <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>
          {groups.length}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 0.8, pb: 1 }}>
        {groups.length === 0 && (
          <Typography sx={{ px: 1, py: 2, fontSize: 11.5, color: 'text.secondary', textAlign: 'center' }}>
            还没有分组
          </Typography>
        )}

        {groups.map((group) => {
          const active = group.id === activeId
          const dragging = groupDrag.id === group.id
          const dropSide = groupDrag.overId === group.id ? groupDrag.side : null
          return (
            <Box
              key={group.id}
              component="button"
              type="button"
              draggable={canReorderGroups}
              aria-grabbed={dragging || undefined}
              onClick={() => selectGroup(group.id)}
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
                mb: 0.4,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                textAlign: 'left',
                fontFamily: 'inherit',
                color: 'text.primary',
                opacity: dragging ? 0.45 : 1,
                userSelect: 'none',
                bgcolor: active ? 'action.selected' : 'transparent',
                cursor: canReorderGroups ? 'grab' : 'pointer',
                transition: 'background-color 140ms ease, opacity 120ms ease',
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
                      ...(dropSide === 'before' ? { top: -3 } : { bottom: -3 })
                    }
                  : undefined,
                '&:hover': {
                  bgcolor: active ? 'action.selected' : 'action.hover'
                },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 1
                }
              }}
            >
              <GroupAvatar group={group} size={28} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
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
              {group.quickLaunch && (
                <Tooltip title="已开启一键启动">
                  <RocketLaunchRoundedIcon sx={{ fontSize: 13, color: '#8B5CF6', opacity: 0.9 }} />
                </Tooltip>
              )}
              {group.utoolsSearch && (
                <Tooltip title="已开启 uTools 搜索候选">
                  <SearchRoundedIcon sx={{ fontSize: 13, color: '#2E9E6B', opacity: 0.9 }} />
                </Tooltip>
              )}
              {group.keywordMatch && (
                <Tooltip title="已开启 uTools 关键词匹配">
                  <KeyboardRoundedIcon sx={{ fontSize: 13, color: 'text.secondary', opacity: 0.72 }} />
                </Tooltip>
              )}
            </Box>
          )
        })}
      </Box>

      <Box sx={{ p: 1, borderTop: '1px solid', borderColor: surfaces.border, display: 'flex', alignItems: 'center', gap: 0.35 }}>
        <Button
          size="small"
          startIcon={<AddRoundedIcon sx={{ fontSize: 17 }} />}
          onClick={onCreate}
          sx={{
            flex: 1,
            justifyContent: 'flex-start',
            color: 'text.primary',
            px: 1.1,
            py: 0.65,
            '&:hover': { bgcolor: 'action.hover' }
          }}
        >
          新建分组
        </Button>
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
                justifyContent: 'center',
                viewTransitionName: 'theme-toggle-icon'
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
          编辑
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
