import React, { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded'
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded'
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded'
import { GroupAvatar, useFileIcons, usePluginLogos } from '../icons'
import { ITEM_TYPES, loadCompactViewMode, saveCompactViewMode } from '../data'
import { matchesSearchItem } from '../search'
import { collectGridBoxes, findNeighborByGeometry } from '../gridNavigation'
import ItemIconView from './ItemIconView'

const CAN_REVEAL = new Set([ITEM_TYPES.FILE, ITEM_TYPES.FOLDER, ITEM_TYPES.APP])
const CAN_ADMIN = new Set([ITEM_TYPES.FILE, ITEM_TYPES.APP])

function ShortcutKey ({ children }) {
  return (
    <Box component="span" sx={{ fontWeight: 600, opacity: 0.92 }}>{children}</Box>
  )
}

// 底部提示条里的一个快捷键
function ShortcutHint ({ keys, label }) {
  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      <ShortcutKey>{keys}</ShortcutKey>
      {` ${label}`}
    </Box>
  )
}

// 格子 / 列表行共用的键盘激活
function handleItemKeyDown (event, onLaunch) {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onLaunch()
}

function activeBackground (theme) {
  return theme.palette.mode === 'dark'
    ? 'rgba(144, 202, 249, 0.14)'
    : 'rgba(18, 118, 197, 0.08)'
}

function activeRing (theme) {
  return `inset 0 0 0 1px ${theme.palette.mode === 'dark'
    ? 'rgba(144, 202, 249, 0.28)'
    : 'rgba(18, 118, 197, 0.22)'}`
}

// 盒子视图：桌面图标式格子
function CompactTile ({ item, index, active, nativeSrc, onLaunch, onHover, onContextMenu }) {
  return (
    <Box
      data-compact-index={index}
      data-compact-id={item.id}
      role="button"
      tabIndex={0}
      title={item.type === ITEM_TYPES.PLUGIN
        ? (item.command || item.path || item.name)
        : (item.path || item.name)}
      aria-current={active || undefined}
      aria-label={item.name}
      onClick={onLaunch}
      onPointerEnter={onHover}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => handleItemKeyDown(event, onLaunch)}
      sx={{
        position: 'relative',
        appearance: 'none',
        border: 0,
        borderRadius: '12px',
        minWidth: 0,
        minHeight: 86,
        px: 0.5,
        pt: 1.05,
        pb: 0.85,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.55,
        bgcolor: active ? activeBackground : 'transparent',
        boxShadow: active ? activeRing : 'none',
        color: 'text.primary',
        fontFamily: 'inherit',
        textAlign: 'center',
        cursor: 'pointer',
        transformOrigin: 'center',
        transition: 'background-color 120ms ease, box-shadow 120ms ease, transform 90ms ease',
        '&:hover': { bgcolor: active ? undefined : 'action.hover' },
        '&:active': { transform: 'scale(0.94)' },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 1
        },
        // 高亮格已经用内描边标记，不再叠加焦点外环，避免双层边框
        '&[aria-current="true"]:focus-visible': { outline: 'none' }
      }}
    >
      {index < 9 && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 3,
            right: 5,
            fontSize: 9,
            lineHeight: 1,
            fontWeight: 600,
            color: 'text.secondary',
            opacity: 0.5,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {index + 1}
        </Box>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 40,
          flexShrink: 0
        }}
      >
        <ItemIconView item={item} size={38} nativeSrc={nativeSrc} />
      </Box>
      <Typography
        sx={{
          width: '100%',
          fontSize: 11,
          fontWeight: 550,
          lineHeight: 1.3,
          minHeight: '2.6em',
          color: 'text.primary',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere'
        }}
      >
        {item.name}
      </Typography>
    </Box>
  )
}

// 列表视图：图标 + 名称 / 路径 + 两个快捷按钮
function CompactRow ({
  item,
  index,
  active,
  nativeSrc,
  adminEnabled,
  onLaunch,
  onHover,
  onContextMenu,
  onReveal,
  onRunAsAdmin
}) {
  const subtitle = item.type === ITEM_TYPES.PLUGIN
    ? (item.command && item.command !== item.name ? item.command : '插件')
    : item.path
  const dashedButton = {
    width: 26,
    height: 26,
    flexShrink: 0,
    p: 0,
    border: '1px dashed',
    borderColor: 'divider',
    color: 'text.secondary',
    '&:hover': {
      borderColor: 'primary.main',
      color: 'primary.main',
      bgcolor: 'action.hover'
    }
  }
  return (
    <Box
      data-compact-index={index}
      data-compact-id={item.id}
      role="button"
      tabIndex={0}
      title={item.path || item.name}
      aria-current={active || undefined}
      aria-label={item.name}
      onClick={onLaunch}
      onPointerEnter={onHover}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => handleItemKeyDown(event, onLaunch)}
      sx={{
        width: '100%',
        border: 0,
        p: '6px 8px',
        mb: 0.35,
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: 1.1,
        textAlign: 'left',
        color: 'text.primary',
        bgcolor: active ? activeBackground : 'transparent',
        boxShadow: active ? activeRing : 'none',
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'background-color 120ms ease, box-shadow 120ms ease',
        '&:hover': { bgcolor: active ? undefined : 'action.hover' },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 1
        },
        '&[aria-current="true"]:focus-visible': { outline: 'none' }
      }}
    >
      <Box
        sx={{
          width: 28,
          height: 28,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <ItemIconView item={item} size={22} nativeSrc={nativeSrc} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 550, lineHeight: 1.3 }} noWrap>
          {item.name}
        </Typography>
        <Typography
          sx={{ mt: 0.15, fontSize: 10.5, lineHeight: 1.25, color: 'text.secondary' }}
          noWrap
        >
          {subtitle}
        </Typography>
      </Box>
      {CAN_REVEAL.has(item.type) && (
        <Tooltip title="打开所在目录（Alt+Enter）">
          <IconButton
            size="small"
            aria-label={`打开 ${item.name} 所在目录`}
            aria-keyshortcuts="Alt+Enter"
            onClick={(event) => {
              event.stopPropagation()
              onReveal?.(item)
            }}
            sx={dashedButton}
          >
            <FolderOpenRoundedIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      )}
      {CAN_ADMIN.has(item.type) && adminEnabled && (
        <Tooltip title="以管理员身份运行（Ctrl+Enter）">
          <IconButton
            size="small"
            aria-label={`以管理员身份运行 ${item.name}`}
            aria-keyshortcuts="Control+Enter"
            onClick={(event) => {
              event.stopPropagation()
              onRunAsAdmin?.(item)
            }}
            sx={dashedButton}
          >
            <AdminPanelSettingsRoundedIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      )}
      {index < 9 && (
        <Typography
          aria-hidden
          sx={{
            width: 42,
            flexShrink: 0,
            fontSize: 10.5,
            color: 'text.secondary',
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          Alt + {index + 1}
        </Typography>
      )}
    </Box>
  )
}

export default function CompactGroupPanel ({
  group,
  query,
  mode,
  surfaces,
  fading = false,
  onExpand,
  onLaunch,
  onRevealItem,
  onRunAsAdmin,
  onQueryChange,
  onHeightChange
}) {
  const icons = useFileIcons(group.items)
  const pluginLogos = usePluginLogos(group.items.some((item) => item.type === ITEM_TYPES.PLUGIN))
  const adminEnabled = Boolean(window.utools?.isWindows?.())
  const filteredItems = useMemo(() => {
    const keyword = query.trim()
    if (!keyword) return group.items
    return group.items.filter((item) => matchesSearchItem(item, keyword))
  }, [group.items, query])

  // 盒子 / 列表布局单独记忆，不影响主界面的三态视图
  const [view, setView] = useState(loadCompactViewMode)
  const changeView = (next) => {
    if (!next || next === view) return
    setView(next)
    saveCompactViewMode(next)
  }

  // -1 表示还没有用方向键 / 鼠标悬浮选中任何条目
  const [cursor, setCursor] = useState(-1)
  const cursorRef = useRef(-1)
  const listRef = useRef(null)
  const rootRef = useRef(null)
  const [menu, setMenu] = useState(null)

  const applyCursor = (index) => {
    if (cursorRef.current === index) return
    cursorRef.current = index
    setCursor(index)
  }

  useEffect(() => {
    applyCursor(-1)
  }, [group.id, query])

  const activeIndex = filteredItems.length
    ? Math.min(cursor, filteredItems.length - 1)
    : -1

  useEffect(() => {
    if (activeIndex < 0) return
    const box = listRef.current
    const node = box?.querySelector(`[data-compact-index="${activeIndex}"]`)
    if (!box || !node) return
    const boxRect = box.getBoundingClientRect()
    const rect = node.getBoundingClientRect()
    if (rect.top < boxRect.top) box.scrollTop -= boxRect.top - rect.top + 4
    else if (rect.bottom > boxRect.bottom) box.scrollTop += rect.bottom - boxRect.bottom + 4
  }, [activeIndex, view])

  // 滚动区上下边缘的渐隐：只有在那个方向「还有内容没看」时才展开，回到头 / 尾自动收回
  const [fadeEdges, setFadeEdges] = useState({ top: false, bottom: false })
  useEffect(() => {
    const el = listRef.current
    if (!el) return undefined
    let raf = 0
    const update = () => {
      raf = 0
      const top = el.scrollTop > 1
      const bottom = el.scrollHeight - el.scrollTop - el.clientHeight > 1
      setFadeEdges((prev) => (
        prev.top === top && prev.bottom === bottom ? prev : { top, bottom }
      ))
    }
    const schedule = () => {
      if (raf) return
      raf = window.requestAnimationFrame(update)
    }
    schedule()
    el.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', schedule)
      observer.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [view, filteredItems, fading])

  // 行数随窗口宽度 / 布局变化，高度交给 App 按实际内容调整（宽度固定后不会来回抖）
  useEffect(() => {
    if (!onHeightChange || fading) return undefined
    const rootEl = rootRef.current
    const listEl = listRef.current
    if (!rootEl || !listEl) return undefined
    let raf = 0
    const measure = () => {
      raf = 0
      const nodes = listEl.querySelectorAll('[data-compact-id]')
      if (!nodes.length) return
      // 用 offsetTop/offsetHeight（布局值）而不是 rect：入场动画带 transform，rect 量出来会偏小
      let contentHeight = 0
      nodes.forEach((node) => {
        const bottom = node.offsetTop + node.offsetHeight
        if (bottom > contentHeight) contentHeight = bottom
      })
      const style = window.getComputedStyle(listEl)
      const padBottom = parseFloat(style.paddingBottom) || 0
      // 头部 + 底部提示条的高度 = 面板高度 - 列表可视高度
      const chrome = rootEl.offsetHeight - listEl.clientHeight
      onHeightChange(Math.round(chrome + contentHeight + padBottom))
    }
    const schedule = () => {
      if (raf) return
      raf = window.requestAnimationFrame(measure)
    }
    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(listEl)
    return () => {
      observer.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [filteredItems, view, onHeightChange, fading])

  useEffect(() => {
    if (fading) return undefined
    const handleKeyDown = (event) => {
      const items = filteredItems
      const total = items.length
      const ctrl = event.ctrlKey || event.metaKey
      const plain = !event.altKey && !ctrl && !event.shiftKey
      const current = cursorRef.current >= 0
        ? items[Math.min(cursorRef.current, total - 1)]
        : items[0]

      // 右键菜单打开时，方向键归菜单自己用
      if (document.querySelector('[role="menu"]')) return

      // 头部按钮（视图切换、Alt + 0）或行内虚线按钮拿到焦点时，Enter 交给按钮自己，
      // 否则会连带启动当前条目
      const target = event.target
      if (target instanceof Element) {
        const chromeButton = target.closest('button')
        if (chromeButton && !chromeButton.hasAttribute('data-compact-id')) return
      }

      const isArrow = event.key === 'ArrowUp' || event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' || event.key === 'ArrowRight'

      if (plain && isArrow) {
        if (!total) return
        event.preventDefault()
        if (cursorRef.current < 0) {
          applyCursor(0)
          return
        }
        const direction = event.key === 'ArrowUp'
          ? 'up'
          : event.key === 'ArrowDown'
            ? 'down'
            : event.key === 'ArrowLeft' ? 'left' : 'right'
        // 二维几何导航：盒子视图按行列走，列表视图天然退化为上一条 / 下一条
        const boxes = collectGridBoxes(listRef.current, 'data-compact-id')
        const nextId = findNeighborByGeometry(boxes, items[cursorRef.current]?.id, direction)
        const nextIndex = nextId ? items.findIndex((entry) => entry.id === nextId) : -1
        if (nextIndex >= 0) {
          applyCursor(nextIndex)
          return
        }
        const step = direction === 'up' || direction === 'left' ? -1 : 1
        applyCursor(Math.max(0, Math.min(total - 1, cursorRef.current + step)))
        return
      }

      if (plain && event.key === 'Enter') {
        if (!current) return
        if (!query.trim() && cursorRef.current < 0) return
        event.preventDefault()
        onLaunch(current)
        return
      }

      if (ctrl && !event.altKey && !event.shiftKey && event.key === 'Enter') {
        if (!current || !CAN_ADMIN.has(current.type) || !adminEnabled) return
        event.preventDefault()
        onRunAsAdmin?.(current)
        return
      }

      if (!event.altKey || ctrl || event.shiftKey) return
      if (event.key === 'Enter') {
        if (!current || !CAN_REVEAL.has(current.type)) return
        event.preventDefault()
        onRevealItem?.(current)
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        onExpand()
        return
      }
      if (!/^[1-9]$/.test(event.key)) return
      const item = items[Number(event.key) - 1]
      if (!item) return
      event.preventDefault()
      onLaunch(item)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredItems, onLaunch, onExpand, onRevealItem, onRunAsAdmin, adminEnabled, fading, query])

  const closeMenu = () => setMenu(null)

  const openMenu = (item, index) => (event) => {
    event.preventDefault()
    applyCursor(index)
    setMenu({ x: event.clientX, y: event.clientY, item })
  }

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        p: 1.2,
        bgcolor: mode === 'dark' ? '#17181b' : '#f3f5f8',
        backgroundImage: mode === 'dark'
          ? 'radial-gradient(900px 620px at 8% 0%, rgba(96, 165, 250, 0.10), transparent 62%)'
          : 'radial-gradient(900px 620px at 8% 0%, rgba(18, 118, 197, 0.07), transparent 62%)'
      }}
    >
      <Paper
        ref={rootRef}
        elevation={0}
        sx={{
          width: '100%',
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
        <Box
          sx={{
            px: 1.6,
            py: 1.1,
            display: 'flex',
            alignItems: 'center',
            gap: 1.2,
            flexShrink: 0,
            borderBottom: '1px solid',
            borderColor: surfaces.border
          }}
        >
          <GroupAvatar group={group} size={30} />
          <Box sx={{ flex: '0 1 auto', minWidth: 0 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }} noWrap>
              {group.name}
            </Typography>
            <Typography sx={{ fontSize: 10.5, color: 'text.secondary', lineHeight: 1.3 }}>
              {filteredItems.length === group.items.length
                ? `${group.items.length} 项`
                : `${filteredItems.length} / ${group.items.length} 项`}
            </Typography>
          </Box>

          <Box sx={{ flex: 1, minWidth: 12 }} />

          <ToggleButtonGroup
            value={view}
            exclusive
            size="small"
            onChange={(_event, next) => changeView(next)}
            aria-label="切换视图"
            sx={{
              height: 26,
              flexShrink: 0,
              bgcolor: surfaces.inset,
              borderRadius: '8px',
              gap: '1px',
              '& .MuiToggleButton-root': {
                width: 27,
                p: 0,
                border: 0,
                borderRadius: '7px',
                color: 'text.secondary',
                transition: 'background-color 120ms ease, color 120ms ease',
                '&:hover': { bgcolor: 'action.hover' },
                '&.Mui-selected': {
                  color: 'primary.main',
                  bgcolor: 'action.selected',
                  '&:hover': { bgcolor: 'action.selected' }
                }
              }
            }}
          >
            <ToggleButton value="list" aria-label="列表视图" title="列表视图">
              <ViewListRoundedIcon sx={{ fontSize: 16 }} />
            </ToggleButton>
            <ToggleButton value="grid" aria-label="盒子视图" title="盒子视图">
              <GridViewRoundedIcon sx={{ fontSize: 15 }} />
            </ToggleButton>
          </ToggleButtonGroup>

          <Box
            sx={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 0.4
            }}
          >
            <Tooltip title="展开完整界面 (Alt + 0)">
              <IconButton
                size="small"
                onClick={onExpand}
                aria-label="展开完整界面"
                aria-keyshortcuts="Alt+0"
                sx={{
                  width: 26,
                  height: 26,
                  p: 0,
                  flexShrink: 0,
                  borderRadius: '8px',
                  color: 'text.secondary',
                  transition: 'color 120ms ease, background-color 120ms ease',
                  '&:hover': { color: 'primary.main', bgcolor: 'action.hover' }
                }}
              >
                <OpenInFullRoundedIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>

            <Box
              component="button"
              type="button"
              onClick={onExpand}
              title="展开完整界面 (Alt + 0)"
              aria-label="展开完整界面 (Alt + 0)"
              aria-keyshortcuts="Alt+0"
              sx={{
                flexShrink: 0,
                appearance: 'none',
                border: 0,
                bgcolor: 'transparent',
                p: 0,
                fontFamily: 'inherit',
                fontSize: 10.5,
                lineHeight: 1.4,
                color: 'text.secondary',
                opacity: 0.9,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'color 120ms ease, opacity 120ms ease',
                '&:hover': { color: 'primary.main', opacity: 1 },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 2
                }
              }}
            >
              Alt + 0
            </Box>
          </Box>
        </Box>

        <Box
          key={view}
          ref={listRef}
          className="compact-view-in compact-scroll-fade"
          sx={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            // 边缘渐隐高度：滚开顶部 / 还有内容在下方时才撑开（CSS 里做了长度过渡）
            '--ql-fade-top': fadeEdges.top ? '18px' : '0px',
            '--ql-fade-bottom': fadeEdges.bottom ? '18px' : '0px',
            ...(view === 'grid'
              ? {
                  scrollbarGutter: 'stable',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
                  gridAutoRows: 'min-content',
                  alignContent: 'start',
                  columnGap: 0.5,
                  rowGap: 0.5,
                  px: 0.9,
                  py: 0.9
                }
              : {
                  px: 0.8,
                  py: 0.6
                })
          }}
        >
          {filteredItems.length > 0
            ? filteredItems.map((item, index) => {
                const nativeSrc = item.type === ITEM_TYPES.PLUGIN
                  ? pluginLogos[String(item.path).toLocaleLowerCase()]
                  : icons[item.path]
                const active = index === activeIndex
                const shared = {
                  item,
                  index,
                  active,
                  nativeSrc,
                  onLaunch: () => onLaunch(item),
                  onHover: () => applyCursor(index),
                  onContextMenu: openMenu(item, index)
                }
                return view === 'grid'
                  ? <CompactTile key={item.id} {...shared} />
                  : (
                    <CompactRow
                      key={item.id}
                      {...shared}
                      adminEnabled={adminEnabled}
                      onReveal={onRevealItem}
                      onRunAsAdmin={onRunAsAdmin}
                    />
                    )
              })
            : (
              <Box
                sx={{
                  gridColumn: '1 / -1',
                  minHeight: 120,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'text.secondary',
                  gap: 0.8,
                  py: 3
                }}
              >
                <SearchOffRoundedIcon sx={{ fontSize: 30, opacity: 0.45 }} />
                <Typography sx={{ fontSize: 12.5, fontWeight: 550, color: 'text.primary' }}>
                  没有匹配结果
                </Typography>
                {query && (
                  <Button size="small" onClick={() => onQueryChange?.('')}>
                    清除搜索
                  </Button>
                )}
              </Box>
              )}
        </Box>

        <Box
          sx={{
            flexShrink: 0,
            px: 1.5,
            py: 0.55,
            borderTop: '1px solid',
            borderColor: surfaces.border,
            fontSize: 10,
            lineHeight: 1.4,
            color: 'text.secondary',
            opacity: 0.82,
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'center',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis'
          }}
        >
          {adminEnabled && (
            <>
              <ShortcutHint keys="Ctrl+Enter" label="管理员身份运行" />
              <Box component="span" aria-hidden sx={{ mx: 1.1, opacity: 0.6 }}>;</Box>
            </>
          )}
          <ShortcutHint keys="Alt+Enter" label="打开所在目录" />
        </Box>
      </Paper>

      <Menu
        open={Boolean(menu)}
        onClose={closeMenu}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
        slotProps={{
          paper: {
            sx: {
              minWidth: 178,
              borderRadius: '10px',
              py: 0.4
            }
          }
        }}
      >
        {menu && [
          <MenuItem
            key="launch"
            onClick={() => {
              closeMenu()
              onLaunch(menu.item)
            }}
            sx={{ fontSize: 12.5 }}
          >
            打开
            <Box component="span" sx={{ ml: 'auto', pl: 2.5, fontSize: 10.5, color: 'text.secondary' }}>
              Enter
            </Box>
          </MenuItem>,
          <MenuItem
            key="reveal"
            disabled={!CAN_REVEAL.has(menu.item.type)}
            onClick={() => {
              closeMenu()
              onRevealItem?.(menu.item)
            }}
            sx={{ fontSize: 12.5 }}
          >
            <FolderOpenRoundedIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
            打开所在目录
            <Box component="span" sx={{ ml: 'auto', pl: 2, fontSize: 10.5, color: 'text.secondary' }}>
              Alt+Enter
            </Box>
          </MenuItem>,
          <MenuItem
            key="admin"
            disabled={!adminEnabled || !CAN_ADMIN.has(menu.item.type)}
            onClick={() => {
              closeMenu()
              onRunAsAdmin?.(menu.item)
            }}
            sx={{ fontSize: 12.5 }}
          >
            <AdminPanelSettingsRoundedIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
            以管理员身份运行
            <Box component="span" sx={{ ml: 'auto', pl: 2, fontSize: 10.5, color: 'text.secondary' }}>
              Ctrl+Enter
            </Box>
          </MenuItem>
        ]}
      </Menu>
    </Box>
  )
}
