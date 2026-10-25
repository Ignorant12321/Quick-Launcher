import React, { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Fab from '@mui/material/Fab'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import RuleRoundedIcon from '@mui/icons-material/RuleRounded'
import KeyboardRoundedIcon from '@mui/icons-material/KeyboardRounded'
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded'
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'
import AppsRoundedIcon from '@mui/icons-material/AppsRounded'
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded'
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import PlaylistAddRoundedIcon from '@mui/icons-material/PlaylistAddRounded'
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded'
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded'
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded'
import ViewCompactRoundedIcon from '@mui/icons-material/ViewCompactRounded'
import { GroupAvatar, RoundAddIcon, useFileIcons, usePluginLogos } from '../icons'
import ItemIconView from './ItemIconView'
import { ITEM_TYPES, MAIN_PUSH_LIMIT, getBrowserModeLabel, getReadableColor } from '../data'
import { matchesSearchItem } from '../search'
import { collectGridBoxes, findNeighborByGeometry as findNeighborByGeometryIn } from '../gridNavigation'

function FeaturePill ({ icon: Icon, label, active, disabled, color, tooltip, onClick }) {
  // 按下态由指针事件自己维护，不依赖 CSS :active——鼠标快速点一下时 :active 窗口太短，缩放几乎看不出来
  const [pressed, setPressed] = useState(false)
  const releasePress = () => setPressed(false)
  return (
    <Tooltip title={tooltip}>
      <Box
        component="button"
        type="button"
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        onPointerDown={(event) => {
          if (disabled || (event.button !== undefined && event.button !== 0)) return
          setPressed(true)
        }}
        onPointerUp={releasePress}
        onPointerLeave={releasePress}
        onPointerCancel={releasePress}
        onBlur={releasePress}
        sx={{
          height: 27,
          px: 1.05,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.55,
          borderRadius: '999px',
          border: '1px solid',
          borderColor: active ? `${color}59` : 'divider',
          bgcolor: active
            ? (theme) => (
                theme.palette.mode === 'dark'
                  ? `color-mix(in srgb, ${color} 22%, transparent)`
                  : `${color}18`
              )
            : 'transparent',
          color: active
            ? (theme) => getReadableColor(color, theme.palette.mode)
            : 'text.secondary',
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          transformOrigin: 'center',
          willChange: 'transform',
          // 按下：缩小 + 内阴影，70ms 紧跟手指；松开：260ms 轻微回弹，像真按钮弹回来
          transform: pressed ? 'scale(0.90)' : 'scale(1)',
          boxShadow: pressed ? 'inset 0 1px 3px rgba(15, 23, 42, 0.20)' : 'none',
          transition: pressed
            ? 'transform 70ms cubic-bezier(0.2, 0, 0, 1), box-shadow 70ms ease'
            : 'transform 260ms cubic-bezier(0.34, 1.4, 0.64, 1), box-shadow 180ms ease, background-color 140ms ease, border-color 140ms ease, color 140ms ease',
          '&:hover': {
            bgcolor: active ? undefined : 'action.hover'
          },
          // 键盘空格激活（走了浏览器默认 :active）也保持一致的手感
          '&:active': {
            transform: 'scale(0.90)',
            boxShadow: 'inset 0 1px 3px rgba(15, 23, 42, 0.20)'
          },
          '&:disabled:active': {
            transform: 'none',
            boxShadow: 'none'
          },
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2
          },
          '&:disabled': {
            bgcolor: 'transparent'
          }
        }}
      >
        <Icon sx={{ fontSize: 14 }} />
        <Box component="span" sx={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1 }}>
          {label}
        </Box>
      </Box>
    </Tooltip>
  )
}

function getDropSide (event, view) {
  const rect = event.currentTarget.getBoundingClientRect()
  if (view === 'list') {
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
}

function ItemCard ({
  item,
  nativeSrc,
  view,
  enterIndex = 0,
  animateEnter = false,
  selected,
  launching,
  surfaces,
  orderNumber,
  dragging,
  dropSide,
  draggable,
  onSelect,
  onLaunch,
  onMenu,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onRunAsAdmin
}) {
  const isList = view === 'list'
  const isCompact = view === 'compact'
  const appName = item.openWith ? item.openWith.split(/[\\/]/).pop() : ''
  const browserLabel = item.type === ITEM_TYPES.URL
    ? (item.browserMode && item.browserMode !== 'default'
        ? getBrowserModeLabel(item.browserMode)
        : (item.openWith ? appName : '系统默认浏览器'))
    : ''
  const openWithLabel = item.type === ITEM_TYPES.URL ? browserLabel : appName
  const tooltip = [
    item.type === ITEM_TYPES.PLUGIN ? `插件：${item.path}` : item.path,
    openWithLabel ? `打开方式：${openWithLabel}` : '',
    item.type === ITEM_TYPES.PLUGIN ? `指令：${item.command}` : ''
  ].filter(Boolean).join('\n')
  const iconSize = isCompact ? 23 : (isList ? 28 : 30)
  const iconBoxSize = isCompact ? 25 : (isList ? 30 : 32)
  const viewTransitionName = `ql-item-${String(item.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const subtitle = item.type === ITEM_TYPES.PLUGIN
    ? (item.command && item.command !== item.name ? item.command : '插件')
    : item.path

  const dropIndicator = dropSide
    ? {
        content: '""',
        position: 'absolute',
        zIndex: 3,
        bgcolor: 'primary.main',
        borderRadius: '999px',
        pointerEvents: 'none',
        ...(view === 'list'
          ? {
              left: 0,
              right: 0,
              height: 3,
              [dropSide === 'before' ? 'top' : 'bottom']: 0
            }
          : {
              top: 0,
              bottom: 0,
              width: 3,
              [dropSide === 'before' ? 'left' : 'right']: 0
            })
      }
    : undefined

  return (
    <Box
      data-item-card=""
      data-item-id={item.id}
      draggable={draggable}
      aria-grabbed={dragging || undefined}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu(event, item)
      }}
      sx={{
        position: 'relative',
        minWidth: 0,
        viewTransitionName,
        opacity: dragging ? 0.45 : 1,
        transition: 'opacity 120ms ease',
        userSelect: 'none',
        '&::after': dropIndicator,
        '&:hover .item-menu-btn': { opacity: 0.9 },
        '&:focus-within .item-menu-btn': { opacity: 0.9 },
        '&:hover .item-order-number': { opacity: 0 },
        '&:focus-within .item-order-number': { opacity: 0 }
      }}
    >
      <Box
        component="button"
        type="button"
        className={animateEnter ? 'item-enter-face' : undefined}
        draggable={draggable}
        title={tooltip}
        aria-pressed={selected}
        onClick={(event) => onSelect(item, event)}
        onDoubleClick={() => onLaunch(item)}
        sx={{
          '--item-enter-delay': `${Math.min(enterIndex, 8) * 18}ms`,
          width: '100%',
          minHeight: isList ? 52 : (isCompact ? 48 : 66),
          p: isList ? '7px 40px 7px 11px' : (isCompact ? '7px 32px 7px 9px' : '10px 38px 10px 11px'),
          border: '1px solid',
          borderColor: selected ? 'primary.main' : surfaces.border,
          borderRadius: isCompact ? '10px' : '12px',
          bgcolor: selected
            ? (theme) => (
                theme.palette.mode === 'dark'
                  ? 'rgba(144, 202, 249, 0.16)'
                  : 'rgba(18, 118, 197, 0.095)'
              )
            : surfaces.card,
          boxShadow: surfaces.shadow,
          color: 'text.primary',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: isCompact ? 0.85 : 1.1,
          textAlign: 'left',
          cursor: draggable ? 'grab' : 'pointer',
          transition: 'background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease',
          '&:hover': {
            bgcolor: selected
              ? (theme) => (
                  theme.palette.mode === 'dark'
                    ? 'rgba(144, 202, 249, 0.20)'
                    : 'rgba(18, 118, 197, 0.13)'
                )
              : surfaces.cardHover
          },
          '&:active': {
            transform: 'scale(0.995)',
            cursor: draggable ? 'grabbing' : 'pointer'
          },
          // 卡片不再画焦点外环：选中态（主色描边 + 淡底）是唯一的视觉指示。
          // 外环画在圆角外侧，会让「刚点过、但已不是当前选中」的卡片看起来还带着框、并且变大一圈。
          '&:focus, &:focus-visible': { outline: 'none' }
        }}
      >
        <Box
          sx={{
            width: iconBoxSize,
            height: iconBoxSize,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <ItemIconView item={item} size={iconSize} nativeSrc={nativeSrc} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: isCompact ? 11.5 : 12.5,
              fontWeight: 550,
              lineHeight: 1.35,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {item.name}
          </Typography>
          {!isCompact && (
            <Typography
              sx={{
                mt: 0.45,
                fontSize: 10.5,
                lineHeight: 1.3,
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>

        {launching && <CircularProgress size={15} sx={{ flexShrink: 0 }} />}
      </Box>

      {orderNumber && (
        <Typography
          aria-hidden
          className={`item-order-number${animateEnter ? ' item-order-enter' : ''}`}
          sx={{
            '--item-enter-delay': `${Math.min(enterIndex, 8) * 18}ms`,
            position: 'absolute',
            right: isCompact ? 2 : 5,
            width: isCompact ? 26 : (isList ? 30 : 32),
            top: '50%',
            transform: 'translateY(-50%)',
            textAlign: 'center',
            opacity: selected ? 0 : 1,
            transition: 'opacity 120ms ease',
            fontSize: isCompact ? 26 : (isList ? 30 : 40),
            fontWeight: 800,
            lineHeight: 0.9,
            color: (theme) => (
              theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.14)'
                : 'rgba(17, 24, 39, 0.10)'
            ),
            pointerEvents: 'none',
            userSelect: 'none',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.04em'
          }}
        >
          {orderNumber}
        </Typography>
      )}

      {!launching && (
        <IconButton
          size="small"
          className="item-menu-btn"
          aria-label={`管理 ${item.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onSelect(item)
            onMenu(event, item)
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          sx={{
            position: 'absolute',
            right: isCompact ? 2 : 5,
            top: '50%',
            transform: 'translateY(-50%)',
            width: isCompact ? 26 : (isList ? 30 : 32),
            height: isCompact ? 26 : (isList ? 30 : 32),
            color: 'text.secondary',
            opacity: selected ? 0.9 : 0,
            transition: 'opacity 120ms ease, background-color 120ms ease',
            '&:hover': { opacity: 1 }
          }}
        >
          <MoreVertRoundedIcon sx={{ fontSize: isCompact ? 17 : (isList ? 19 : 20) }} />
        </IconButton>
      )}
    </Box>
  )
}

export default function GroupContent ({
  group,
  query,
  view,
  surfaces,
  adding,
  launchingId,
  canCopyToGroup,
  onQueryChange,
  onViewChange,
  onEdit,
  onAddFiles,
  onAddFolders,
  onAddSoftware,
  onAddUrl,
  onAddPlugin,
  onToggleKeyword,
  onToggleQuickLaunch,
  onToggleUtoolsSearch,
  onLaunch,
  onRemoveItem,
  onRemoveItems,
  onCopyItems,
  onReorderItems,
  onEditItem,
  onRevealItem,
  onRunAsAdmin,
  onNotify
}) {
  const [addMenuAnchor, setAddMenuAnchor] = useState(null)
  const [itemMenu, setItemMenu] = useState({ item: null, anchorEl: null, anchorPosition: null })
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [checkingInvalid, setCheckingInvalid] = useState(false)
  const [dragState, setDragState] = useState({ itemId: null, overId: null, side: null })
  const lastSelectedRef = useRef(null)
  const dragRef = useRef({ itemId: null, suppressClickUntil: 0 })
  const icons = useFileIcons(group.items)
  const pluginLogos = usePluginLogos(group.items.some((item) => item.type === ITEM_TYPES.PLUGIN))

  const canReorder = Boolean(onReorderItems) && !query.trim() && group.items.length > 0
  const orderIndexById = useMemo(
    () => new Map(group.items.map((item, index) => [item.id, index])),
    [group.items]
  )

  const filteredItems = useMemo(() => {
    const keyword = query.trim()
    if (!keyword) return group.items
    return group.items.filter((item) => matchesSearchItem(item, keyword))
  }, [group.items, query])

  useEffect(() => {
    setSelectedIds(new Set())
    lastSelectedRef.current = null
  }, [group.id, query])

  useEffect(() => {
    setSelectedIds((previous) => {
      if (!previous.size) return previous
      const valid = new Set(group.items.map((item) => item.id))
      let changed = false
      const next = new Set()
      previous.forEach((id) => {
        if (valid.has(id)) next.add(id)
        else changed = true
      })
      return changed ? next : previous
    })
  }, [group.items])

  const clearSelection = () => {
    setSelectedIds(new Set())
    lastSelectedRef.current = null
  }

  const handleItemDragStart = (event, item) => {
    if (!canReorder) {
      event.preventDefault()
      return
    }
    const multiple = selectedIds.has(item.id) && selectedIds.size > 1
    const draggedItems = multiple
      ? group.items.filter((entry) => selectedIds.has(entry.id))
      : [item]
    dragRef.current.itemId = item.id
    dragRef.current.multiple = multiple
    dragRef.current.suppressClickUntil = Date.now() + 300
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove'
      try {
        event.dataTransfer.setData('application/x-quick-launcher-item', item.id)
        event.dataTransfer.setData(
          'application/x-quick-launcher-item-json',
          JSON.stringify({ sourceGroupId: group.id, items: draggedItems })
        )
        if (draggedItems.length > 1) {
          event.dataTransfer.setData(
            'text/plain',
            draggedItems.map((entry) => entry.name).join('\n')
          )
        }
      } catch {}
    }
    setDragState({ itemId: item.id, overId: null, side: null })
    if (!multiple) clearSelection()
  }

  const handleItemDragOver = (event, item) => {
    const draggedId = dragRef.current.itemId
    if (
      !canReorder ||
      !draggedId ||
      dragRef.current.multiple ||
      draggedId === item.id
    ) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const side = getDropSide(event, view)
    setDragState((previous) => (
      previous.itemId === draggedId && previous.overId === item.id && previous.side === side
        ? previous
        : { itemId: draggedId, overId: item.id, side }
    ))
  }

  const handleItemDragLeave = (event, item) => {
    const related = event.relatedTarget
    if (related instanceof Node && event.currentTarget.contains(related)) return
    setDragState((previous) => (
      previous.overId === item.id ? { ...previous, overId: null, side: null } : previous
    ))
  }

  const handleItemDrop = (event, item) => {
    const draggedId = dragRef.current.itemId ||
      event.dataTransfer?.getData('application/x-quick-launcher-item')
    if (!canReorder || !draggedId || dragRef.current.multiple || draggedId === item.id) return
    event.preventDefault()
    event.stopPropagation()
    const side = getDropSide(event, view)
    dragRef.current.itemId = null
    dragRef.current.multiple = false
    dragRef.current.suppressClickUntil = Date.now() + 350
    setDragState({ itemId: null, overId: null, side: null })
    onReorderItems?.(draggedId, item.id, side === 'after')
  }

  const handleItemDragEnd = () => {
    dragRef.current.itemId = null
    dragRef.current.multiple = false
    dragRef.current.suppressClickUntil = Date.now() + 350
    setDragState({ itemId: null, overId: null, side: null })
  }

  const handleLaunchItem = (item) => {
    if (Date.now() < dragRef.current.suppressClickUntil) return
    onLaunch(item)
  }

  const handleSelect = (item, event) => {
    if (Date.now() < dragRef.current.suppressClickUntil) return
    const additive = Boolean(event?.metaKey || event?.ctrlKey)
    const range = Boolean(event?.shiftKey)

    if (range && lastSelectedRef.current) {
      const start = filteredItems.findIndex((entry) => entry.id === lastSelectedRef.current)
      const end = filteredItems.findIndex((entry) => entry.id === item.id)
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start]
        setSelectedIds(new Set(filteredItems.slice(from, to + 1).map((entry) => entry.id)))
        return
      }
    }

    if (additive) {
      setSelectedIds((previous) => {
        const next = new Set(previous)
        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        return next
      })
      lastSelectedRef.current = item.id
      return
    }

    setSelectedIds(new Set([item.id]))
    lastSelectedRef.current = item.id
  }

  useEffect(() => {
    if (!selectedIds.size) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Delete') return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target
      if (target instanceof Element) {
        if (target.closest('input, textarea, select, [contenteditable="true"], aside')) return
      }
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      event.preventDefault()
      const ids = [...selectedIds]
      onRemoveItems?.(ids)
      setSelectedIds(new Set())
      lastSelectedRef.current = null
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds, onRemoveItems])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      if (String(event.key).toLocaleLowerCase() !== 'a') return
      const target = event.target
      if (target instanceof Element) {
        if (target.closest('input, textarea, select, [contenteditable="true"], aside')) return
      }
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      if (!filteredItems.length) return
      event.preventDefault()
      setSelectedIds(new Set(filteredItems.map((item) => item.id)))
      lastSelectedRef.current = filteredItems[filteredItems.length - 1].id
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredItems])

  const closeAddMenu = () => setAddMenuAnchor(null)
  const closeItemMenu = () => setItemMenu({ item: null, anchorEl: null, anchorPosition: null })
  const itemMenuOpen = Boolean(itemMenu.anchorEl || itemMenu.anchorPosition)
  const openItemMenu = (event, item) => {
    setItemMenu({ item, anchorEl: event.currentTarget, anchorPosition: null })
  }
  const openItemContextMenu = (event, item) => {
    setSelectedIds((previous) => (
      previous.has(item.id) && previous.size > 1 ? previous : new Set([item.id])
    ))
    lastSelectedRef.current = item.id
    setItemMenu({
      item,
      anchorEl: null,
      anchorPosition: { top: event.clientY, left: event.clientX }
    })
  }

  useEffect(() => {
    if (!itemMenuOpen) return undefined
    const handlePointerDown = (event) => {
      const target = event.target
      if (target instanceof Element && target.closest('.MuiMenu-paper, [role="menu"]')) return
      closeItemMenu()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [itemMenuOpen])
  const handleBatchDelete = () => {
    const ids = [...selectedIds]
    setBatchDeleteOpen(false)
    clearSelection()
    onRemoveItems(ids)
  }

  const handleCheckInvalid = async () => {
    if (checkingInvalid) return
    const candidates = group.items.filter((item) => (
      item.type === ITEM_TYPES.FILE ||
      item.type === ITEM_TYPES.FOLDER ||
      item.type === ITEM_TYPES.APP
    ))
    if (!candidates.length) {
      onNotify?.('当前分组没有可检查的路径条目', 'warning')
      return
    }
    setCheckingInvalid(true)
    try {
      const result = await window.services?.checkPaths?.(
        candidates.map((item) => item.path)
      )
      const invalidPaths = new Set(Array.isArray(result?.invalid) ? result.invalid : [])
      const invalidIds = candidates
        .filter((item) => invalidPaths.has(item.path))
        .map((item) => item.id)
      if (!invalidIds.length) {
        onNotify?.('未发现无效条目')
        return
      }
      setSelectedIds(new Set(invalidIds))
      lastSelectedRef.current = invalidIds[invalidIds.length - 1] || null
      onNotify?.(`已选中 ${invalidIds.length} 个无效条目，按 Delete 删除`, 'warning')
    } catch {
      onNotify?.('检查失败，请重试', 'error')
    } finally {
      setCheckingInvalid(false)
    }
  }

  const menuItem = itemMenu.item
  const copyTargetIds = () => {
    if (!menuItem) return []
    if (selectedIds.has(menuItem.id) && selectedIds.size > 1) return [...selectedIds]
    return [menuItem.id]
  }
  const menuIsPath = menuItem && (
    menuItem.type === ITEM_TYPES.FILE ||
    menuItem.type === ITEM_TYPES.FOLDER ||
    menuItem.type === ITEM_TYPES.APP
  )
  const adminEnabled = Boolean(window.utools?.isWindows?.())

  const listRef = useRef(null)

  const scrollItemIntoView = (itemId) => {
    const container = listRef.current
    if (!container) return
    const node = container.querySelector(`[data-item-id="${String(itemId).replace(/["\\]/g, '')}"]`)
    if (!node) return
    const boxRect = container.getBoundingClientRect()
    const rect = node.getBoundingClientRect()
    if (rect.top < boxRect.top) container.scrollTop -= boxRect.top - rect.top + 8
    else if (rect.bottom > boxRect.bottom) container.scrollTop += rect.bottom - boxRect.bottom + 8
  }

  // 当前布局是否是多行多列（卡片视图）。单行或单列时方向键退化为「上一条 / 下一条」
  const isGridLayout = () => {
    const container = listRef.current
    if (!container) return false
    const nodes = Array.from(container.querySelectorAll('[data-item-id]'))
    if (nodes.length < 2) return false
    const lefts = new Set()
    const tops = new Set()
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect()
      lefts.add(Math.round(rect.left))
      tops.add(Math.round(rect.top))
    })
    return lefts.size > 1 && tops.size > 1
  }

  // 按几何位置找相邻条目：算法在 src/gridNavigation.js，与紧凑盒子视图共用
  const findNeighborByGeometry = (currentId, direction) =>
    findNeighborByGeometryIn(collectGridBoxes(listRef.current, 'data-item-id'), currentId, direction)

  // 键盘：方向键切换选中，Enter 运行，Ctrl+Enter 管理员身份运行，Alt+Enter 打开所在目录
  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target
      const inTextField = target instanceof Element &&
        Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
      if (target instanceof Element) {
        // 搜索框里只放行 Enter 和 ↓（↓ 用来跳进条目列表），其余按键交给输入框自己处理
        if (inTextField && event.key !== 'Enter' && event.key !== 'ArrowDown') return
        if (target.closest('aside')) return
        if (target.closest('button, a') && !target.closest('[data-item-card]')) return
      }
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      if (!filteredItems.length) return

      const ctrl = event.ctrlKey || event.metaKey
      const plain = !event.altKey && !ctrl && !event.shiftKey
      // 已选条目：最后一次点选的 → 唯一选中的那条
      const selectedItem = (() => {
        const anchorId = lastSelectedRef.current
        if (anchorId) {
          const found = filteredItems.find((entry) => entry.id === anchorId)
          if (found) return found
        }
        if (selectedIds.size === 1) {
          const onlyId = [...selectedIds][0]
          return filteredItems.find((entry) => entry.id === onlyId) || null
        }
        return null
      })()
      // 没有选中但已经输入搜索词时，把第一条当作默认目标
      const current = selectedItem || (query.trim() ? filteredItems[0] : null)

      const isArrow = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ||
        event.key === 'ArrowDown' || event.key === 'ArrowRight'
      if (plain && isArrow) {
        if (inTextField && event.key !== 'ArrowDown') return
        const direction = event.key === 'ArrowUp' || event.key === 'ArrowDown'
          ? (event.key === 'ArrowUp' ? 'up' : 'down')
          : (event.key === 'ArrowLeft' ? 'left' : 'right')
        let nextId = null
        const grid = Boolean(selectedItem) && isGridLayout()
        if (!selectedItem) {
          // 没有任何选中时，任意方向键先落到第一张
          nextId = filteredItems[0]?.id || null
        } else if (grid) {
          // 多行多列：上下换行、左右换列，到行/列末尾就在同一行/同一列内回绕
          nextId = findNeighborByGeometry(selectedItem.id, direction)
        } else {
          // 单行/单列（列表视图、紧凑视图、网格只剩一列）：方向键就是上一条 / 下一条
          const step = direction === 'up' || direction === 'left' ? -1 : 1
          const currentIndex = filteredItems.findIndex((entry) => entry.id === selectedItem.id)
          const nextIndex = Math.max(0, Math.min(filteredItems.length - 1, currentIndex + step))
          nextId = filteredItems[nextIndex]?.id || null
        }
        const nextItem = nextId ? filteredItems.find((entry) => entry.id === nextId) : null
        if (!nextItem) return
        event.preventDefault()
        // 鼠标点过的卡片会留下 DOM 焦点，方向键把「当前条目」搬走时要一并清掉，
        // 否则旧卡片仍会带着焦点样式（外环/悬停菜单等），看起来像两个条目同时被选中
        const active = document.activeElement
        if (active instanceof HTMLElement && active.closest('[data-item-card]')) active.blur()
        setSelectedIds(new Set([nextItem.id]))
        lastSelectedRef.current = nextItem.id
        scrollItemIntoView(nextItem.id)
        return
      }

      if (!current) return

      if (plain && event.key === 'Enter') {
        event.preventDefault()
        handleLaunchItem(current)
        return
      }

      if (ctrl && !event.altKey && !event.shiftKey && event.key === 'Enter') {
        if (!adminEnabled) return
        if (current.type !== ITEM_TYPES.APP && current.type !== ITEM_TYPES.FILE) return
        event.preventDefault()
        onRunAsAdmin?.(current)
        return
      }

      if (event.altKey && !ctrl && !event.shiftKey && event.key === 'Enter') {
        if (
          current.type !== ITEM_TYPES.FILE &&
          current.type !== ITEM_TYPES.FOLDER &&
          current.type !== ITEM_TYPES.APP
        ) return
        event.preventDefault()
        onRevealItem?.(current)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredItems, selectedIds, adminEnabled, onRunAsAdmin, onRevealItem, query])

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.4
      }}
    >
      <Paper
        elevation={0}
        sx={{
          px: 1.75,
          py: 1.6,
          borderRadius: '16px',
          bgcolor: surfaces.panel,
          border: '1px solid',
          borderColor: surfaces.border,
          boxShadow: surfaces.shadow,
          backdropFilter: 'blur(18px)',
          flexShrink: 0
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4, minWidth: 0 }}>
          <GroupAvatar group={group} size={44} />

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              component="h1"
              sx={{
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1.25,
                letterSpacing: 0.05,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {group.name}
            </Typography>
            <Typography
              sx={{
                mt: 0.5,
                fontSize: 11,
                lineHeight: 1.3,
                color: 'text.secondary',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {group.items.length} 项
            </Typography>
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.6,
              flexShrink: 0
            }}
          >
            <FeaturePill
              icon={KeyboardRoundedIcon}
              label="关键词匹配"
              active={group.keywordMatch}
              color="#E5484D"
              onClick={onToggleKeyword}
              tooltip={group.keywordMatch ? '关闭关键词匹配' : '开启关键词匹配'}
            />
            <FeaturePill
              icon={SearchRoundedIcon}
              label="搜索候选"
              active={group.utoolsSearch}
              disabled={!group.keywordMatch}
              color="#2E9E6B"
              onClick={onToggleUtoolsSearch}
              tooltip={!group.keywordMatch
                ? '需先开启关键词匹配'
                : (group.utoolsSearch ? '关闭 uTools 搜索候选' : (
                    <Box component="span" sx={{ display: 'block', fontSize: 11, lineHeight: 1.5 }}>
                      开启 uTools 搜索候选
                      <Box component="span" sx={{ display: 'block', mt: 0.4, opacity: 0.75 }}>
                        需要在 uTools 运行设置中：
                      </Box>
                      <Box component="span" sx={{ display: 'block', mt: 0.4, opacity: 0.75 }}>
                        勾选「允许推送内容到搜索框」
                      </Box>
                    </Box>
                  ))}
            />
            <FeaturePill
              icon={RocketLaunchRoundedIcon}
              label="一键启动"
              active={group.quickLaunch}
              disabled={!group.keywordMatch}
              color="#8B5CF6"
              onClick={onToggleQuickLaunch}
              tooltip={!group.keywordMatch
                ? '需先开启关键词匹配'
                : (group.quickLaunch ? '关闭一键启动' : '开启一键启动')}
            />

            <Divider
              orientation="vertical"
              flexItem
              sx={{ mx: 0.5, my: 0.9, borderColor: 'divider' }}
            />

            <Tooltip title="检查无效条目">
              <span>
                <IconButton
                  size="small"
                  onClick={handleCheckInvalid}
                  disabled={checkingInvalid}
                  aria-label="检查无效条目"
                >
                  {checkingInvalid
                    ? <CircularProgress size={15} color="inherit" />
                    : <RuleRoundedIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title="编辑分组">
              <IconButton size="small" onClick={onEdit} aria-label="编辑分组">
                <EditRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {group.items.length > 0 && (
          <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索当前分组"
              size="small"
              fullWidth
              slotProps={{
                htmlInput: { 'aria-label': '搜索当前分组' },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: query
                    ? (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          aria-label="清除搜索"
                          onClick={() => onQueryChange('')}
                          edge="end"
                          sx={{ p: 0.25 }}
                        >
                          <CloseRoundedIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </InputAdornment>
                      )
                    : null
                }
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: surfaces.inset,
                  '& fieldset': { borderColor: surfaces.border },
                  '&:hover fieldset': {
                    borderColor: (theme) => (
                      theme.palette.mode === 'dark'
                        ? 'rgba(144, 202, 249, 0.32)'
                        : 'rgba(18, 118, 197, 0.26)'
                    )
                  },
                  '&.Mui-focused fieldset': { borderColor: 'primary.main' }
                },
                '& .MuiInputBase-input': { fontSize: 12 }
              }}
            />

            <ToggleButtonGroup
              value={view || 'grid'}
              exclusive
              size="small"
              onChange={(_event, next) => {
                if (next) onViewChange(next)
              }}
              aria-label="切换视图"
              sx={{
                height: 38,
                flexShrink: 0,
                bgcolor: surfaces.inset,
                borderRadius: '10px',
                '& .MuiToggleButton-root': {
                  width: 32,
                  p: 0,
                  borderColor: surfaces.border,
                  color: 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&.Mui-selected': {
                    color: 'primary.main',
                    bgcolor: 'action.selected'
                  }
                },
                '& .MuiToggleButton-root:first-of-type': {
                  borderTopLeftRadius: '9px',
                  borderBottomLeftRadius: '9px'
                },
                '& .MuiToggleButton-root:last-of-type': {
                  borderTopRightRadius: '9px',
                  borderBottomRightRadius: '9px'
                }
              }}
            >
              <ToggleButton value="list" aria-label="列表视图" title="列表视图">
                <ViewListRoundedIcon sx={{ fontSize: 18 }} />
              </ToggleButton>
              <ToggleButton value="grid" aria-label="卡片视图" title="卡片视图">
                <GridViewRoundedIcon sx={{ fontSize: 17 }} />
              </ToggleButton>
              <ToggleButton value="compact" aria-label="紧凑视图" title="紧凑视图">
                <ViewCompactRoundedIcon sx={{ fontSize: 18 }} />
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}
      </Paper>

      <Box
        ref={listRef}
        onClick={(event) => {
          if (!event.target.closest?.('[data-item-card]')) clearSelection()
        }}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          pr: 0.25,
          pb: group.items.length > 0 ? (selectedIds.size > 1 ? '118px' : '68px') : 0
        }}
      >
        {group.items.length === 0 && (
          <Box
            sx={{
              minHeight: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              px: 3,
              py: 2
            }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <Box
                sx={{
                  width: 62,
                  height: 62,
                  mx: 'auto',
                  borderRadius: '19px',
                  bgcolor: (theme) => (
                    theme.palette.mode === 'dark'
                      ? `color-mix(in srgb, ${group.color} 20%, transparent)`
                      : `${group.color}16`
                  ),
                  color: (theme) => getReadableColor(group.color, theme.palette.mode),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <PlaylistAddRoundedIcon sx={{ fontSize: 30 }} />
              </Box>
              <Typography sx={{ mt: 1.6, fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
                暂无内容
              </Typography>
            </Box>
          </Box>
        )}

        {group.items.length > 0 && filteredItems.length === 0 && (
          <Box
            sx={{
              minHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
              px: 3
            }}
          >
            <SearchOffRoundedIcon sx={{ fontSize: 30, opacity: 0.45 }} />
            <Typography sx={{ mt: 1.1, fontSize: 13, fontWeight: 550, color: 'text.primary' }}>
              没有匹配结果
            </Typography>
            <Button size="small" onClick={() => onQueryChange('')} sx={{ mt: 1.2 }}>
              清除搜索
            </Button>
          </Box>
        )}

        {filteredItems.length > 0 && (
          <>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: view === 'list'
                  ? '1fr'
                  : view === 'compact'
                    ? 'repeat(auto-fill, minmax(150px, 1fr))'
                    : 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: view === 'list' ? 0.6 : 1
              }}
            >
              {filteredItems.map((item, index) => {
                const orderIndex = orderIndexById.get(item.id)
                const orderNumber = orderIndex != null && orderIndex < MAIN_PUSH_LIMIT ? orderIndex + 1 : null
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    view={view}
                    enterIndex={index}
                    animateEnter={!query.trim()}
                    selected={selectedIds.has(item.id)}
                    nativeSrc={item.type === ITEM_TYPES.PLUGIN
                      ? pluginLogos[String(item.path).toLocaleLowerCase()]
                      : icons[item.path]}
                    launching={launchingId === item.id}
                    surfaces={surfaces}
                    orderNumber={orderNumber}
                    draggable={canReorder}
                    dragging={dragState.itemId === item.id}
                    dropSide={dragState.overId === item.id ? dragState.side : null}
                    onSelect={handleSelect}
                    onLaunch={handleLaunchItem}
                    onMenu={openItemMenu}
                    onContextMenu={openItemContextMenu}
                    onDragStart={(event) => handleItemDragStart(event, item)}
                    onDragOver={(event) => handleItemDragOver(event, item)}
                    onDragLeave={(event) => handleItemDragLeave(event, item)}
                    onDrop={(event) => handleItemDrop(event, item)}
                    onDragEnd={handleItemDragEnd}
                    onRunAsAdmin={onRunAsAdmin}
                  />
                )
              })}
            </Box>
          </>
        )}
      </Box>

      {selectedIds.size > 1 && (
        <Paper
          elevation={0}
          sx={{
            position: 'absolute',
            left: '50%',
            bottom: 8,
            transform: 'translateX(-50%)',
            zIndex: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 0.8,
            pl: 1.6,
            pr: 0.8,
            py: 0.65,
            maxWidth: 'calc(100% - 104px)',
            borderRadius: '14px',
            bgcolor: surfaces.panel,
            border: '1px solid',
            borderColor: surfaces.border,
            boxShadow: '0 12px 34px rgba(0, 0, 0, 0.22)',
            backdropFilter: 'blur(18px)'
          }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap' }}>
            已选 {selectedIds.size} 项
          </Typography>
          <Button
            size="small"
            onClick={clearSelection}
            sx={{ color: 'text.secondary', minWidth: 0, px: 1 }}
          >
            取消
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            startIcon={<DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />}
            onClick={() => setBatchDeleteOpen(true)}
            sx={{ py: 0.55, whiteSpace: 'nowrap' }}
          >
            删除
          </Button>
        </Paper>
      )}

      <Box sx={{ position: 'absolute', right: 4, bottom: 4, zIndex: 12 }}>
        <Tooltip title="添加到当前分组" placement="left">
          <Box component="span" sx={{ display: 'inline-flex' }}>
            <Fab
              color="primary"
              size="medium"
              aria-label="添加到当前分组"
              disabled={adding}
              onClick={(event) => setAddMenuAnchor(event.currentTarget)}
              sx={{
                width: 52,
                height: 52,
                boxShadow: '0 8px 22px rgba(18, 118, 197, 0.32)',
                '&:active': { transform: 'scale(0.96)' }
              }}
            >
              {adding
                ? <CircularProgress size={20} color="inherit" />
                : <RoundAddIcon size={27} />}
            </Fab>
          </Box>
        </Tooltip>
      </Box>

      <Menu
        anchorEl={addMenuAnchor}
        open={Boolean(addMenuAnchor)}
        onClose={closeAddMenu}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 178, borderRadius: '11px', mb: 0.75 } } }}
      >
        <MenuItem
          onClick={() => {
            closeAddMenu()
            onAddFiles()
          }}
          sx={{ fontSize: 12.5, gap: 1.2 }}
        >
          <InsertDriveFileRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
          添加文件…
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeAddMenu()
            onAddFolders()
          }}
          sx={{ fontSize: 12.5, gap: 1.2 }}
        >
          <FolderRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
          添加目录…
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeAddMenu()
            onAddSoftware()
          }}
          sx={{ fontSize: 12.5, gap: 1.2 }}
        >
          <AppsRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
          添加软件…
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => {
            closeAddMenu()
            onAddUrl()
          }}
          sx={{ fontSize: 12.5, gap: 1.2 }}
        >
          <LanguageRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
          添加网址…
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeAddMenu()
            onAddPlugin()
          }}
          sx={{ fontSize: 12.5, gap: 1.2 }}
        >
          <ExtensionRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
          添加 uTools 插件…
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={itemMenu.anchorEl || undefined}
        anchorReference={itemMenu.anchorPosition ? 'anchorPosition' : 'anchorEl'}
        anchorPosition={itemMenu.anchorPosition || undefined}
        open={itemMenuOpen}
        onClose={closeItemMenu}
        anchorOrigin={itemMenu.anchorPosition
          ? { vertical: 'top', horizontal: 'left' }
          : { vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={itemMenu.anchorPosition
          ? { vertical: 'top', horizontal: 'left' }
          : { vertical: 'top', horizontal: 'right' }}
        slotProps={{
          root: { sx: { pointerEvents: 'none' } },
          backdrop: { sx: { pointerEvents: 'none' } },
          paper: {
            sx: {
              minWidth: 194,
              borderRadius: '11px',
              mt: itemMenu.anchorPosition ? 0 : 0.5,
              pointerEvents: 'auto'
            }
          }
        }}
      >
        <MenuItem
          onClick={() => {
            onEditItem?.(menuItem)
            closeItemMenu()
          }}
          sx={{ fontSize: 12.5, gap: 1.2 }}
        >
          <EditRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          修改
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        {menuItem && (
          <MenuItem
            onClick={() => {
              onLaunch(menuItem)
              closeItemMenu()
            }}
            sx={{ fontSize: 12.5, gap: 1.2 }}
          >
            <OpenInNewRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            {menuItem.type === ITEM_TYPES.APP ? '运行' : '打开'}
          </MenuItem>
        )}
        {menuItem?.type === ITEM_TYPES.APP && adminEnabled && (
          <MenuItem
            onClick={() => {
              onRunAsAdmin?.(menuItem)
              closeItemMenu()
            }}
            sx={{ fontSize: 12.5, gap: 1.2 }}
          >
            <AdminPanelSettingsRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            以管理员身份运行
          </MenuItem>
        )}
        {menuIsPath && (
          <MenuItem
            onClick={() => {
              onRevealItem(menuItem)
              closeItemMenu()
            }}
            sx={{ fontSize: 12.5, gap: 1.2 }}
          >
            <FolderOpenRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            打开所在目录
          </MenuItem>
        )}
        <Divider sx={{ my: 0.5 }} />
        {canCopyToGroup && (
          <MenuItem
            onClick={() => {
              onCopyItems?.(copyTargetIds())
              closeItemMenu()
            }}
            sx={{ fontSize: 12.5, gap: 1.2 }}
          >
            <ContentCopyRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            复制到
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            onRemoveItem(menuItem)
            closeItemMenu()
          }}
          sx={{ fontSize: 12.5, gap: 1.2, color: 'error.main' }}
        >
          <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
          从分组移除
        </MenuItem>
      </Menu>

      <Dialog
        open={batchDeleteOpen}
        onClose={() => setBatchDeleteOpen(false)}
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
          删除快捷方式
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 12.5, lineHeight: 1.7, color: 'text.secondary' }}>
            删除选中的 {selectedIds.size} 个快捷方式？源文件不受影响。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.2, pb: 1.8 }}>
          <Button onClick={() => setBatchDeleteOpen(false)} sx={{ color: 'text.secondary' }}>
            取消
          </Button>
          <Button variant="contained" color="error" onClick={handleBatchDelete}>
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
