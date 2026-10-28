import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import MenuList from '@mui/material/MenuList'
import Divider from '@mui/material/Divider'
import Popper from '@mui/material/Popper'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded'
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded'
import ViewModuleRoundedIcon from '@mui/icons-material/ViewModuleRounded'
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import LoginRoundedIcon from '@mui/icons-material/LoginRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import WidgetsRoundedIcon from '@mui/icons-material/WidgetsRounded'
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded'
import CreateNewFolderRoundedIcon from '@mui/icons-material/CreateNewFolderRounded'
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded'
import { GroupAvatar, useCustomIcon, useFileIcons, usePluginLogos } from '../icons'
import {
  clampNestedGrid,
  DEFAULT_ACTIVE_OPACITY,
  DEFAULT_BACKGROUND_BLUR,
  DEFAULT_BACKGROUND_DIM,
  DEFAULT_BOX_OPACITY,
  DEFAULT_CHROME_OPACITY,
  DEFAULT_HOVER_OPACITY,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_OPACITY,
  ITEM_TYPES,
  MAX_BACKGROUND_BLUR,
  MAX_BACKGROUND_DIM,
  MIN_TEXT_OPACITY
} from '../data'
import { matchesSearchItem } from '../search'
import { collectGridBoxes, findNeighborByGeometry } from '../gridNavigation'
import { foregroundFromColor, normalizeHex } from '../imageTone'
import { useScrollFade, scrollFadeSx } from '../useScrollFade'
import ItemIconView from './ItemIconView'

const CAN_REVEAL = new Set([ITEM_TYPES.FILE, ITEM_TYPES.FOLDER, ITEM_TYPES.APP])
const CAN_ADMIN = new Set([ITEM_TYPES.FILE, ITEM_TYPES.APP])

// 格子 / 列表行共用的键盘激活
function handleItemKeyDown (event, onLaunch) {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onLaunch()
}

// 有背景图片时，选中 / 悬浮用「半透明白 / 黑」压一层，具体压哪种由字色决定：
// 浅色字 → 深色衬底，深色字 → 浅色衬底，这样字无论放在哪张照片上都还有对比度。
// 浓度来自分组设置（默认 选中 40% / 高亮 20%），按 0–1 直接换算
function activeBackground (theme, onImage, lightText, opacity = DEFAULT_ACTIVE_OPACITY / 100) {
  if (onImage) {
    return lightText
      ? `rgba(10, 12, 16, ${opacity})`
      : `rgba(255, 255, 255, ${opacity})`
  }
  return theme.palette.mode === 'dark'
    ? 'rgba(144, 202, 249, 0.14)'
    : 'rgba(18, 118, 197, 0.08)'
}

function hoverBackground (theme, onImage, lightText, opacity = DEFAULT_HOVER_OPACITY / 100) {
  if (!onImage) return 'action.hover'
  return lightText
    ? `rgba(10, 12, 16, ${opacity})`
    : `rgba(255, 255, 255, ${opacity})`
}

// 列表视图最多显示这么多行，再多就在列表里滚动（正好对上 Alt + 1~9 的编号）
const LIST_MAX_ROWS = 9

// 实测高度之上多留的余量：避免内容与可视区精确相等时的 1px 溢出（会亮起底部渐隐、可滚动）
const HEIGHT_SLACK = 6

// 格子尺寸：桌面图标式（图标 + 单行名称）。高度写死，按「行数」锁盒子高度时才不会漏出半行
const TILE_ROW_HEIGHT = 66
const TILE_GAP = 4
// 一格的最小宽度：盒子按 nestedBoxCols 格铺开，格子与盒子共用这一套网格
const BLOCK_TILE_WIDTH = 76
// 盒子标题条 + 上下内边距的近似高度：算「盒子该占几行网格」时用
const BOX_CHROME_HEIGHT = 46
// 盒子里切到列表视图时，一行的大致高度（比格子矮很多，占的行数要单独算）
const BOX_LIST_ROW_HEIGHT = 38

function activeRing (theme, onImage, lightText) {
  if (onImage) {
    // 叠在照片上时不画主色环，改用中性描边 + 投影，否则边缘会出现一圈蓝框
    return lightText
      ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.28), 0 2px 10px rgba(0, 0, 0, 0.34)'
      : 'inset 0 0 0 1px rgba(17, 24, 39, 0.14), 0 2px 10px rgba(0, 0, 0, 0.18)'
  }
  return `inset 0 0 0 1px ${theme.palette.mode === 'dark'
    ? 'rgba(144, 202, 249, 0.28)'
    : 'rgba(18, 118, 197, 0.22)'}`
}

// 头部的视图切换 / 展开按钮：同样跟着字色明暗换底
function chromeBackground (lightText) {
  return lightText ? 'rgba(12, 14, 18, 0.42)' : 'rgba(255, 255, 255, 0.58)'
}

function chromeHover (lightText) {
  return lightText ? 'rgba(255, 255, 255, 0.16)' : 'rgba(17, 24, 39, 0.08)'
}

function chromeSelected (lightText, strong = false) {
  if (lightText) return strong ? 'rgba(255, 255, 255, 0.26)' : 'rgba(255, 255, 255, 0.2)'
  return strong ? 'rgba(17, 24, 39, 0.12)' : 'rgba(17, 24, 39, 0.08)'
}

// 长按拖动排序：按住这么久之后条目才跟着指针走，普通点击 / 滚动不受影响
const DRAG_HOLD_MS = 320
// 长按还没成立时移动超过这个距离，就当用户在滚动 / 想点别的地方
const DRAG_MOVE_TOLERANCE = 7
// 拖动落点的「中间区」：只有指针真的压在这个范围里，才当成「塞进这个分组」；
// 靠边（前后 1/3 左右）一律当成排序。比例小了太难瞄准，大了又容易误吞，
// 这里按「中间约 1/3 宽 + 下半部分高」取，掠过别的分组时基本不会误塞。
// 拖整块盒子与拖条目共用这套判定：盒子常常占满整片区域，条目也得能贴着它边缘排进去
const DROP_CORE = { start: 0.34, end: 0.66, top: 0.34, bottom: 0.94 }

// 把「一个分组里的条目」拆成「自己的条目」和「能展开成盒子的子分组」。
// ancestors = 这一路上已经展开过的分组 id：命中的分组不再展开（A 里放 A、A→B→A 都
// 退化成一个普通入口）；allowBoxes = false 时一律不展开（盒子里面只画一层，见 renderBox）
function splitByBoxes (owner, groupsById, keyword, ancestors, allowBoxes = true) {
  const own = []
  const boxes = []
  ;(owner?.items || []).forEach((item) => {
    if (item.type !== ITEM_TYPES.GROUP || !allowBoxes) {
      own.push(item)
      return
    }
    const target = groupsById.get(item.groupId)
    const children = target?.items || []
    // 目标分组被删了 / 里面是空的 / 已经在祖先链上：保持普通入口，不画一个空盒子
    if (!target || !children.length || ancestors.has(target.id)) {
      own.push(item)
      return
    }
    // 搜索词命中分组名就整盒保留，否则只在盒子里筛条目
    const listed = !keyword || matchesSearchItem(item, keyword)
      ? children
      : children.filter((child) => matchesSearchItem(child, keyword))
    if (!listed.length) return
    boxes.push({
      key: item.id,
      entry: item,
      target,
      ancestors: new Set([...ancestors, target.id])
    })
  })
  return {
    own: keyword ? own.filter((item) => matchesSearchItem(item, keyword)) : own,
    boxes
  }
}

// 按盒子的视觉顺序把条目摊平（格子与盒子按分组里的原始顺序混排）。
// 盒子里只有一层，不再往深了递归；键盘导航、Alt + N、图标预取都按这条顺序
function flattenByBoxes (owner, groupsById, keyword, ancestors, out = []) {
  const { own, boxes } = splitByBoxes(owner, groupsById, keyword, ancestors)
  const boxByEntryId = new Map(boxes.map((box) => [box.entry.id, box]))
  const ownById = new Map(own.map((item) => [item.id, item]))
  const order = new Map((owner?.items || []).map((item, index) => [item.id, index]))
  // splitByBoxes 已经过滤过一轮，这里只按原始下标把两条结果并回去：
  // 分组入口排在第几位，它的盒子里的条目就排在第几位，和画出来的顺序一致
  const ids = [...ownById.keys(), ...boxByEntryId.keys()]
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
  ids.forEach((id) => {
    const box = boxByEntryId.get(id)
    if (box) {
      splitByBoxes(box.target, groupsById, keyword, box.ancestors, false)
        .own.forEach((item) => out.push(item))
      return
    }
    out.push(ownById.get(id))
  })
  return out
}

// 拖动时的落点标记：格子用左右竖线，列表行用上下横线
function dropLineShadow (theme, edge, axis) {
  const color = theme.palette.primary.main
  if (axis === 'x') return `inset ${edge === 'before' ? '-2px' : '2px'} 0 0 0 ${color}`
  return `inset 0 ${edge === 'before' ? '2px' : '-2px'} 0 0 ${color}`
}

// 盒子视图：桌面图标式格子
function CompactTile ({
  item,
  index,
  active,
  dragging,
  dropEdge,
  placeholder,
  itemGroup,
  onImage,
  fg,
  activeOpacity,
  hoverOpacity,
  nativeSrc,
  onLaunch,
  onHover,
  onContextMenu,
  onPointerDown
}) {
  // 字色始终用同一档前景色，选中格靠「反过来压暗 / 压亮」的衬底拉开对比
  const lightText = Boolean(fg?.isLight)
  return (
    <Box
      data-compact-index={index}
      data-compact-id={item.id}
      data-compact-group={itemGroup || ''}
      data-compact-axis="x"
      data-flip-id={`i:${item.id}`}
      role="button"
      tabIndex={0}
      aria-hidden={dragging || undefined}
      title={item.type === ITEM_TYPES.PLUGIN
        ? (item.command || item.path || item.name)
        : item.type === ITEM_TYPES.GROUP
          ? `进入「${item.name}」分组`
          : (item.path || item.name)}
      aria-current={active || undefined}
      aria-label={item.name}
      onClick={onLaunch}
      onPointerDown={onPointerDown}
      onPointerEnter={onHover}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => handleItemKeyDown(event, onLaunch)}
      sx={{
        position: 'relative',
        appearance: 'none',
        border: 0,
        borderRadius: '12px',
        minWidth: 0,
        height: TILE_ROW_HEIGHT,
        px: 0.4,
        pt: 0.7,
        pb: 0.55,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.4,
        bgcolor: (theme) => (
          active && !placeholder
            ? activeBackground(theme, onImage, lightText, activeOpacity)
            : 'transparent'
        ),
        boxShadow: (theme) => (
          placeholder
            ? 'none'
            : dropEdge
              ? dropLineShadow(theme, dropEdge, 'x')
              : (active ? activeRing(theme, onImage, lightText) : 'none')
        ),
        // 拖动时原位只留一个淡淡的空位（图标本体被拎到指针下面跟着走），
        // 不再画虚线框 / 半透明的「残影」，那会和手指下那一份重复成一模一样的两份
        ...(placeholder
          ? {
              bgcolor: (theme) => (theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.06)'
                : 'rgba(15, 23, 42, 0.045)'),
              '& > *': { opacity: 0 }
            }
          : {}),
        color: fg ? fg.main : 'text.primary',
        textShadow: fg ? fg.shadow : 'none',
        fontFamily: 'inherit',
        textAlign: 'center',
        cursor: 'pointer',
        transformOrigin: 'center',
        transition: 'background-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease, transform 90ms ease',
        '&:hover': {
          bgcolor: (theme) => (active ? undefined : hoverBackground(theme, onImage, lightText, hoverOpacity))
        },
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
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 32,
          flexShrink: 0
        }}
      >
        <ItemIconView item={item} size={30} nativeSrc={nativeSrc} />
      </Box>
      <Typography
        noWrap
        sx={{
          width: '100%',
          fontSize: 10.5,
          fontWeight: 550,
          lineHeight: 1.35,
          color: fg ? fg.main : 'text.primary',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          whiteSpace: 'nowrap'
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
  dragging,
  dropEdge,
  placeholder,
  itemGroup,
  onImage,
  fg,
  activeOpacity,
  hoverOpacity,
  nativeSrc,
  adminEnabled,
  onLaunch,
  onHover,
  onContextMenu,
  onReveal,
  onRunAsAdmin,
  onPointerDown,
  // 盒子里的小列表：只留图标 + 名称，隐藏路径行与 Alt + N 提示
  dense = false
}) {
  const lightText = Boolean(fg?.isLight)
  const subtitle = item.type === ITEM_TYPES.GROUP
    ? '分组'
    : item.type === ITEM_TYPES.PLUGIN
      ? (item.command && item.command !== item.name ? item.command : '插件')
      : item.path
  const dashedButton = {
    width: 26,
    height: 26,
    flexShrink: 0,
    p: 0,
    border: '1px dashed',
    borderColor: fg ? fg.faint : 'divider',
    color: fg ? fg.muted : 'text.secondary',
    '&:hover': {
      borderColor: fg ? fg.main : 'primary.main',
      color: fg ? fg.main : 'primary.main',
      bgcolor: 'action.hover'
    }
  }
  return (
    <Box
      data-compact-index={index}
      data-compact-id={item.id}
      data-compact-group={itemGroup || ''}
      data-compact-axis="y"
      data-flip-id={`i:${item.id}`}
      role="button"
      tabIndex={0}
      aria-hidden={dragging || undefined}
      title={item.type === ITEM_TYPES.GROUP ? `进入「${item.name}」分组` : (item.path || item.name)}
      aria-current={active || undefined}
      aria-label={item.name}
      onClick={onLaunch}
      onPointerDown={onPointerDown}
      onPointerEnter={onHover}
      onContextMenu={onContextMenu}
      onKeyDown={(event) => handleItemKeyDown(event, onLaunch)}
      sx={{
        width: '100%',
        border: 0,
        p: dense ? '4px 6px' : '6px 8px',
        mb: dense ? 0.2 : 0.35,
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: 1.1,
        textAlign: 'left',
        color: fg ? fg.main : 'text.primary',
        textShadow: fg ? fg.shadow : 'none',
        bgcolor: (theme) => (
          active && !placeholder
            ? activeBackground(theme, onImage, lightText, activeOpacity)
            : 'transparent'
        ),
        boxShadow: (theme) => (
          placeholder
            ? 'none'
            : dropEdge
              ? dropLineShadow(theme, dropEdge, 'y')
              : (active ? activeRing(theme, onImage, lightText) : 'none')
        ),
        // 被拎起来的那一行原位只留空位，内容藏起来（跟随指针的那一份才是本体）
        ...(placeholder
          ? {
              bgcolor: (theme) => (theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.055)'
                : 'rgba(15, 23, 42, 0.04)'),
              '& > *': { opacity: 0 }
            }
          : {}),
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'background-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease',
        '&:hover': {
          bgcolor: (theme) => (active ? undefined : hoverBackground(theme, onImage, lightText, hoverOpacity))
        },
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
        <Typography sx={{ fontSize: dense ? 11.5 : 12.5, fontWeight: 550, lineHeight: 1.3 }} noWrap>
          {item.name}
        </Typography>
        {!dense && (
          <Typography
            sx={{ mt: 0.15, fontSize: 10.5, lineHeight: 1.25, color: fg ? fg.muted : 'text.secondary' }}
            noWrap
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {!dense && CAN_REVEAL.has(item.type) && (
        <Tooltip title="打开所在目录">
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
      {!dense && CAN_ADMIN.has(item.type) && adminEnabled && (
        <Tooltip title="以管理员身份运行">
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

      {!dense && index < 9 && (
        <Typography
          aria-hidden
          sx={{
            flexShrink: 0,
            minWidth: 34,
            ml: 0.2,
            fontSize: 10,
            lineHeight: 1,
            textAlign: 'right',
            letterSpacing: '-0.1px',
            color: fg ? fg.faint : 'text.secondary',
            opacity: 0.75,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          Alt + {index + 1}
        </Typography>
      )}
    </Box>
  )
}

// 被拎起来的那一份：不做「小卡片」的抽象化，直接把条目自己的长相（图标 + 名称）
// 提起来放大一点、加一层投影跟着指针走 —— 和手机桌面长按移动图标是同一套观感。
// 整块盒子的浮层不走这里（见 startDragPress 里的克隆件），它是容器本体，不是一张卡片
function DragGhost ({ drag, foreground }) {
  const isRow = drag.axis === 'y'
  const lift = isRow ? 1.02 : 1.16
  const fg = foreground
  const liftSx = {
    '@keyframes compactLift': {
      from: { transform: 'scale(1)' },
      to: { transform: `scale(${lift})` }
    },
    animation: 'compactLift 180ms cubic-bezier(0.2, 0.85, 0.3, 1.2) both',
    // 缩放原点钉在抓取点上：手指 / 光标下面那一块内容不会跟着放大而跑偏
    transformOrigin: `${drag.grabX}px ${drag.grabY}px`
  }
  const name = drag.item.name
  const subtitle = drag.item.type === ITEM_TYPES.GROUP ? '分组' : (drag.item.path || '')

  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        zIndex: 2600,
        pointerEvents: 'none',
        left: drag.x - drag.grabX,
        top: drag.y - drag.grabY,
        width: drag.width || undefined,
        height: drag.height || undefined
      }}
    >
      {isRow
        ? (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 1.1,
              px: 1,
              borderRadius: '10px',
              // 列表行本来就没有底色（靠所在容器的透视衬底），拎起来时也别糊一张白卡片；
              // 和格子一样，用一圈投影把自己从底图上「抬」起来
              filter: 'drop-shadow(0 14px 22px rgba(0, 0, 0, 0.42))',
              ...liftSx
            }}
          >
            <Box sx={{ width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ItemIconView item={drag.item} size={22} nativeSrc={drag.nativeSrc} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <Typography
                noWrap
                sx={{
                  fontSize: 12.5,
                  fontWeight: 550,
                  lineHeight: 1.3,
                  color: fg ? fg.main : 'text.primary',
                  textShadow: fg ? fg.shadow : '0 1px 3px rgba(0, 0, 0, 0.5)'
                }}
              >
                {name}
              </Typography>
              {subtitle && (
                <Typography
                  noWrap
                  sx={{
                    mt: 0.15,
                    fontSize: 10.5,
                    lineHeight: 1.25,
                    color: fg ? fg.muted : 'text.secondary',
                    textShadow: fg ? fg.shadow : '0 1px 3px rgba(0, 0, 0, 0.5)'
                  }}
                >
                  {subtitle}
                </Typography>
              )}
            </Box>
          </Box>
        )
        : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.4,
              pt: 0.7,
              pb: 0.55,
              px: 0.4,
              // 条目本体没有底色，靠一圈投影把自己从底图上「抬」起来
              filter: 'drop-shadow(0 12px 18px rgba(0, 0, 0, 0.42))',
              ...liftSx
            }}
          >
            <Box sx={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ItemIconView item={drag.item} size={30} nativeSrc={drag.nativeSrc} />
            </Box>
            <Typography
              noWrap
              sx={{
                maxWidth: '100%',
                fontSize: 10.5,
                fontWeight: 550,
                lineHeight: 1.35,
                color: fg ? fg.main : 'text.primary',
                textShadow: fg ? fg.shadow : '0 1px 3px rgba(0, 0, 0, 0.5)',
                textOverflow: 'ellipsis',
                overflow: 'hidden'
              }}
            >
              {name}
            </Typography>
          </Box>
        )}
    </Box>
  )
}

// 落点提示（移到「xxx」）：不放在浮层里 —— 浮层就贴在指针下面，提示会被自己的
// 那一份盖住。这里独立渲染，固定在「鼠标下方」，层级再压浮层一头，怎么拖都看得见
function DropBadge ({ drag, groupsById }) {
  if (!drag || drag.drop?.type !== 'move') return null
  const label = `移入「${groupsById.get(drag.drop.groupId)?.name || '分组'}」`
  // 贴着视口边缘时把提示掰回来，别让它半截跑到窗口外面
  const half = label.length * 6 + 14
  const vw = typeof window === 'undefined' ? 0 : window.innerWidth
  const vh = typeof window === 'undefined' ? 0 : window.innerHeight
  const left = vw ? Math.min(Math.max(drag.x, half), vw - half) : drag.x
  // 条目：优先落在「拎起来的那一份」下面一点点，别压着它自己的名字；
  // 它太高、或者贴着窗口下沿时，退回「指针正下方」这条保底位置。
  // 整块盒子拖动时浮层就是容器本身，直接跟着指针往下一点就行
  const belowGhost = drag.kind === 'box'
    ? 0
    : drag.y - (drag.grabY || 0) + (drag.height || 0) + 8
  const top = vh && belowGhost > vh - 30 ? drag.y + 24 : Math.max(drag.y + 24, belowGhost)
  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        left,
        top,
        transform: 'translateX(-50%)',
        zIndex: 2700,
        pointerEvents: 'none',
        px: 0.9,
        py: 0.2,
        borderRadius: '7px',
        fontSize: 10.5,
        fontWeight: 650,
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
        color: '#fff',
        bgcolor: 'rgba(24, 26, 31, 0.9)',
        boxShadow: '0 6px 14px rgba(0, 0, 0, 0.28)'
      }}
    >
      {label}
    </Box>
  )
}

export default function CompactGroupPanel ({
  group,
  // 解析嵌套分组入口要用到全部分组
  groups = [],
  query,
  mode,
  surfaces,
  fading = false,
  // 预览模式（分组编辑里的搜索预览窗）：不接管键盘、不弹右键菜单、不回报高度
  preview = false,
  // 预览时可以直接喂一张还没落盘的背景图
  backgroundSrc: backgroundSrcProp,
  onExpand,
  onLaunch,
  onRevealItem,
  onRunAsAdmin,
  onQueryChange,
  onViewChange,
  onHeightChange,
  // 盒子头部：把这条分组入口移出当前分组 / 切换盒子内部的平铺·列表 / 往当前分组加一个分组
  onRemoveItem,
  onSetBoxView,
  onAddGroup,
  // 右键菜单「进入分组」= 进主界面看那个分组（点图标 / 名称只是就地切过去）
  onEnterGroup,
  // 空白处右键 →「添加」二级菜单，和主界面 + 号菜单的那几项一一对应
  onAddFiles,
  onAddFolders,
  onAddSoftware,
  onAddUrl,
  onAddPlugin,
  // 长按拖动排序：itemId, targetId, placeAfter, groupId（group 省略即当前分组）
  onReorderItems,
  // 把条目拖到另一个分组的盒子里 = 移动过去：item, { groupId, targetId?, placeAfter? }
  onMoveItem,
  // 右键条目 →「修改」：普通条目 / 插件都走这个（和主界面同一个处理器）
  onEditItem,
  // 右键分组入口 / 盒子标题 → 「修改分组」：打开目标分组的编辑器
  onEditGroupEntry
}) {
  // 顶上这两个按钮是两种东西：
  // - 当前分组的视图只是「这会儿想怎么看」，切完不落盘 —— 真正的默认值在「搜索外观设置」里，
  //   这里只把这次的临时选择存在组件里（换分组 / 重新打开就回到设置里的那个）；
  // - 盒子里的视图（box.entry.boxView）才是有记忆的，走 onSetBoxView 落盘
  const [view, setView] = useState(group.compactView === 'list' ? 'list' : 'grid')
  useEffect(() => {
    setView(group.compactView === 'list' ? 'list' : 'grid')
  }, [group.id, group.compactView])
  const changeView = (next) => {
    if (!next || next === view) return
    setView(next)
    // 预览窗（分组编辑器 / 搜索外观设置）里还要把这次选择同步回表单
    onViewChange?.(next)
  }

  const groupsById = useMemo(() => {
    const map = new Map()
    ;(groups || []).forEach((entry) => map.set(entry.id, entry))
    return map
  }, [groups])

  // 嵌套分组视图：分组入口展开成盒子，直接铺开目标分组的条目。
  // 数据与当前视图无关，真正画盒子时再看 columns（只在该视图为盒子时非空）
  const nestedActive = Boolean(group.nestedGroupView)
  // 盒子内部的网格：0 表示自动（列按宽度铺满、行不限制）
  const nestedBoxCols = clampNestedGrid(group.nestedBoxCols)
  const nestedBoxRows = clampNestedGrid(group.nestedBoxRows)
  // 盒子里（包括更深层）的条目来自别的分组，图标得一起取
  const nestedItems = useMemo(() => {
    if (!nestedActive) return []
    return flattenByBoxes(group, groupsById, query.trim(), new Set([group.id]))
  }, [group, groupsById, nestedActive, query])

  const icons = useFileIcons(nestedActive ? [...group.items, ...nestedItems] : group.items)
  const pluginLogos = usePluginLogos(
    (nestedActive ? [...group.items, ...nestedItems] : group.items)
      .some((item) => item.type === ITEM_TYPES.PLUGIN)
  )
  const storedBackgroundSrc = useCustomIcon(group.backgroundRef)
  const backgroundSrc = backgroundSrcProp === undefined ? storedBackgroundSrc : backgroundSrcProp
  const adminEnabled = Boolean(window.utools?.isWindows?.())

  // 盒子视图的列：本分组自己的条目一列，每个嵌套分组各一列。
  // 关闭嵌套视图时返回 null，走原来的平铺渲染
  const nestedColumns = useMemo(
    () => (nestedActive
      ? splitByBoxes(group, groupsById, query.trim(), new Set([group.id]))
      : null),
    [group, groupsById, nestedActive, query]
  )

  // 列表视图里不展开盒子，这里只在盒子视图用得上。
  // 一个可展开的盒子都没有时（分组里没有嵌套分组）也退回平铺网格：
  // 否则自己的条目会被锁在「固定列宽的一块」里，窗口再宽也只占左边一小撮
  const columns = view === 'grid' && nestedColumns?.boxes.length ? nestedColumns : null

  // 盒子视图里「自己的条目」和「可展开的分组入口」不再分成两块，而是按分组里的
  // 原始顺序排成一条流：分组入口排在第几位，盒子就出现在第几位。
  // 这样拖动盒子 = 换掉那条入口的位置，只有一个盒子时也能拖到条目前面 / 后面；
  // 分成「自己一块 + 盒子排后面」的话，盒子永远只能在盒子之间换位，单盒子就拖不动了
  const columnsChildren = useMemo(() => {
    if (!columns) return null
    const order = new Map((group.items || []).map((item, index) => [item.id, index]))
    return [
      ...columns.own.map((item) => ({ kind: 'tile', item })),
      ...columns.boxes.map((box) => ({ kind: 'box', item: box.entry, box }))
    ].sort((a, b) => (order.get(a.item.id) ?? 0) - (order.get(b.item.id) ?? 0))
  }, [columns, group.items])

  // 按关键词过滤后的原始顺序条目（列表视图 / 非嵌套盒子视图用）
  const flatItems = useMemo(() => {
    const keyword = query.trim()
    if (!keyword) return group.items
    return group.items.filter((item) => matchesSearchItem(item, keyword))
  }, [group.items, query])

  // 盒子视图的扁平顺序：自己的条目 → 各盒子里的条目（再往里的盒子也摊进来）
  const gridItems = useMemo(
    () => (nestedColumns
      ? flattenByBoxes(group, groupsById, query.trim(), new Set([group.id]))
      : flatItems),
    [nestedColumns, group, groupsById, query, flatItems]
  )

  // 键盘导航 / 高亮用一条扁平列表，顺序与当前视图的视觉顺序一致
  const visibleItems = view === 'grid' ? gridItems : flatItems

  const visibleIndexById = useMemo(() => {
    const map = new Map()
    visibleItems.forEach((item, index) => {
      if (!map.has(item.id)) map.set(item.id, index)
    })
    return map
  }, [visibleItems])

  const backgroundDim = useMemo(() => {
    const value = Number(group.backgroundDim)
    if (!Number.isFinite(value)) return DEFAULT_BACKGROUND_DIM
    return Math.min(MAX_BACKGROUND_DIM, Math.max(0, Math.round(value)))
  }, [group.backgroundDim])

  // 背景图模糊。软边靠负 inset 推出去（模糊半径的 2 倍），面板圆角那边才不会透光
  const backgroundBlur = useMemo(() => {
    const value = Number(group.backgroundBlur)
    if (!Number.isFinite(value)) return DEFAULT_BACKGROUND_BLUR
    return Math.min(MAX_BACKGROUND_BLUR, Math.max(0, Math.round(value)))
  }, [group.backgroundBlur])

  const onImage = Boolean(backgroundSrc)

  // 字色（#rrggbb，默认白）与不透明度：四档前景色都按这个百分比算
  const textColor = useMemo(
    () => normalizeHex(group.textColor) || DEFAULT_TEXT_COLOR,
    [group.textColor]
  )
  const textOpacity = useMemo(() => {
    const value = Number(group.textOpacity)
    if (!Number.isFinite(value)) return DEFAULT_TEXT_OPACITY
    return Math.min(100, Math.max(MIN_TEXT_OPACITY, Math.round(value)))
  }, [group.textOpacity])

  const foreground = useMemo(
    () => (onImage ? foregroundFromColor(textColor, textOpacity) : null),
    [onImage, textColor, textOpacity]
  )

  const lightText = Boolean(foreground?.isLight)

  // 三种衬底浓度：0–100 换算成 rgba 的 alpha，格子 / 列表 / 盒子都用这一套
  const densityOf = (value, fallback) => {
    const number = Number(value)
    const safe = Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : fallback
    return safe / 100
  }
  const activeOpacity = useMemo(
    () => densityOf(group.activeOpacity, DEFAULT_ACTIVE_OPACITY),
    [group.activeOpacity]
  )
  const hoverOpacity = useMemo(
    () => densityOf(group.hoverOpacity, DEFAULT_HOVER_OPACITY),
    [group.hoverOpacity]
  )
  const boxOpacity = useMemo(
    () => densityOf(group.boxOpacity, DEFAULT_BOX_OPACITY),
    [group.boxOpacity]
  )
  const chromeOpacity = useMemo(
    () => densityOf(group.chromeOpacity, DEFAULT_CHROME_OPACITY),
    [group.chromeOpacity]
  )

  // 头部在照片上压一层同向渐层，保证文字区干净。
  // 浓度只是顶部那一档的 alpha，往下自己衰减到 40%，这样「顶栏」看起来仍然是一道从上往下的渐变
  const scrim = onImage && chromeOpacity > 0
    ? (lightText
        ? `linear-gradient(to bottom, rgba(8, 10, 14, ${chromeOpacity}), rgba(8, 10, 14, ${(chromeOpacity * 0.4).toFixed(3)}))`
        : `linear-gradient(to bottom, rgba(255, 255, 255, ${chromeOpacity}), rgba(255, 255, 255, ${(chromeOpacity * 0.4).toFixed(3)}))`)
    : null

  // -1 表示还没有用方向键 / 鼠标悬浮选中任何条目
  const [cursor, setCursor] = useState(-1)
  const cursorRef = useRef(-1)
  const listRef = useRef(null)
  const rootRef = useRef(null)
  const [menu, setMenu] = useState(null)
  // 「添加」二级菜单：挂着它的那个 MenuItem 作为定位锚点
  const [addMenuAnchor, setAddMenuAnchor] = useState(null)
  const addMenuTimerRef = useRef(0)

  // 空白处右键弹出的是「当前分组自己」的菜单：造一条等价的分组入口，进入 / 修改分组都走同一套回调
  const groupAsEntry = useMemo(() => ({
    id: `__self__${group.id}`,
    type: ITEM_TYPES.GROUP,
    groupId: group.id,
    name: group.name,
    path: '',
    command: '',
    openWith: '',
    icon: group.icon,
    color: group.color
  }), [group.id, group.name, group.icon, group.color])

  // 右键换目标时要在「所有分组的所有条目」里找：盒子的条目不在 visibleItems 里
  // （它们被拆成盒子了），只查 visibleItems 会找不到 → 菜单被关掉，得再右击一次。
  // 顺手记住「它属于哪个分组」，删除时才知道该从哪儿摘
  const entryById = useMemo(() => {
    const map = new Map()
    ;(groups || []).forEach((entry) => {
      ;(entry.items || []).forEach((item) => map.set(item.id, { item, groupId: entry.id }))
    })
    return map
  }, [groups])

  const applyCursor = (index) => {
    if (cursorRef.current === index) return
    cursorRef.current = index
    setCursor(index)
  }

  useEffect(() => {
    applyCursor(-1)
  }, [group.id, query])

  const activeIndex = visibleItems.length
    ? Math.min(cursor, visibleItems.length - 1)
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
  const fadeEdges = useScrollFade(listRef)

  // 行数随窗口宽度 / 布局变化，高度交给 App 按实际内容调整（宽度固定后不会来回抖）。
  // 只量「当前视图」：另一种视图也铺一份去量，会多渲染一整份格子（图标 / 分组头像），
  // 而且取两者最大值时矮的那个视图会白白多出一条空白带
  useEffect(() => {
    if (!onHeightChange || fading) return undefined
    const rootEl = rootRef.current
    const listEl = listRef.current
    if (!rootEl || !listEl) return undefined
    let raf = 0
    const measure = () => {
      raf = 0
      // 直接子元素就是一行 / 一个格子 / 一列盒子，取最靠下的那个；
      // 用 offsetTop/offsetHeight（布局值）而不是 rect：入场动画带 transform，rect 量出来会偏小
      const nodes = Array.prototype.filter.call(
        listEl.children,
        (node) => node instanceof HTMLElement
      )
      if (!nodes.length) return
      let contentHeight = 0
      if (view === 'list') {
        // 列表视图最多给 9 行的位置，第 10 条起在列表里滚动：
        // 行高一致，取第 9 行的下沿就是这批行的高度
        const last = nodes[Math.min(nodes.length, LIST_MAX_ROWS) - 1]
        contentHeight = last.offsetTop + last.offsetHeight
      } else {
        // 格子 / 盒子混排：直接取最下面那个元素的底边。盒子本身已经在内部限了行数，
        // 外面这一层再按「几行盒子」截断就说不通了（格子和盒子现在共用一条流动的排布）
        nodes.forEach((node) => {
          const bottom = node.offsetTop + node.offsetHeight
          if (bottom > contentHeight) contentHeight = bottom
        })
      }
      const style = window.getComputedStyle(listEl)
      const padBottom = parseFloat(style.paddingBottom) || 0
      // 头部 + 面板内边距 / 边框的高度 = 外层容器高度 - 列表可视高度。
      // 必须量最外层容器（窗口高度就是给它设的），只量 Paper 会漏掉 Paper 外面的 padding，
      // 结果窗口比内容矮十几像素，满幅时永远「可滚动」
      const chrome = rootEl.offsetHeight - listEl.clientHeight
      // 多给几像素余量：内容高度一旦和可视高度精确相等，亚像素四舍五入就会溢出 1px，
      // 满幅内容会因此「可滚动」，底部渐隐也跟着亮起来
      const measured = Math.round(chrome + contentHeight + padBottom) + HEIGHT_SLACK
      onHeightChange(measured)
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
  }, [visibleItems, view, columns, group.id, query, onHeightChange, fading])

  useEffect(() => {
    if (fading || preview) return undefined
    const handleKeyDown = (event) => {
      const items = visibleItems
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
  }, [visibleItems, onLaunch, onExpand, onRevealItem, onRunAsAdmin, adminEnabled, fading, preview, query])

  const closeMenu = () => {
    setMenu(null)
    setAddMenuAnchor(null)
    window.clearTimeout(addMenuTimerRef.current)
  }

  // 「添加」二级菜单挂在菜单项右侧，鼠标扫过去要留一点时间差，否则进不去
  const openAddMenu = (event) => {
    window.clearTimeout(addMenuTimerRef.current)
    setAddMenuAnchor(event.currentTarget)
  }
  const keepAddMenu = () => window.clearTimeout(addMenuTimerRef.current)
  const closeAddMenuSoon = () => {
    window.clearTimeout(addMenuTimerRef.current)
    addMenuTimerRef.current = window.setTimeout(() => setAddMenuAnchor(null), 180)
  }

  // 二级菜单里的每一项：点完先收菜单再执行，和主界面 + 号菜单一致。
  // targetGroupId 是「往哪个分组里加」：空白处右键 = 当前分组；对着盒子右键 = 那个盒子的分组，
  // 加完能直接在盒子里看到，而不是莫名其妙加到外层分组去
  const addTargetGroupId = menu?.item?.type === ITEM_TYPES.GROUP && !menu.blank
    ? menu.item.groupId
    : undefined
  // 顺序与主界面 + 号菜单逐项对齐：文件、目录 / 网址、软件、插件 / 分组。
  // 某一段的处理器没接上（含权限相关的能力），这一段就整段不出现，
  // 连带它前面的分割线也一起去掉，菜单里不留点不动的项
  const addMenuSections = [
    [
      { key: 'files', label: '添加文件…', icon: InsertDriveFileRoundedIcon, run: onAddFiles && (() => onAddFiles(addTargetGroupId)) },
      { key: 'folders', label: '添加目录…', icon: FolderRoundedIcon, run: onAddFolders && (() => onAddFolders(addTargetGroupId)) }
    ],
    [
      { key: 'url', label: '添加网址…', icon: LanguageRoundedIcon, run: onAddUrl && (() => onAddUrl(addTargetGroupId)) },
      { key: 'software', label: '添加软件…', icon: WidgetsRoundedIcon, run: onAddSoftware && (() => onAddSoftware(addTargetGroupId)) },
      { key: 'plugin', label: '添加 uTools 插件…', icon: ExtensionRoundedIcon, run: onAddPlugin && (() => onAddPlugin(addTargetGroupId)) }
    ],
    [
      { key: 'group', label: '添加分组…', icon: CreateNewFolderRoundedIcon, run: onAddGroup && (() => onAddGroup(addTargetGroupId)) }
    ]
  ]
    .map((section) => section.filter((entry) => entry.run))
    .filter((section) => section.length)
  const addMenuItems = addMenuSections.reduce((acc, section, index) => {
    if (index) acc.push({ key: `sep-${index}`, divider: true })
    acc.push(...section)
    return acc
  }, [])

  // 「添加」二级菜单跟着窗口边界走：下面放不下就往上翻，翻上去也放不下就把菜单
  // 锁在可用高度内、让它自己滚动 —— 否则贴着窗口底边时，最后几项会被直接切掉
  const addMenuFit = (() => {
    const fallback = { placement: 'right-start', maxHeight: 320 }
    if (!addMenuAnchor?.getBoundingClientRect) return fallback
    const rect = addMenuAnchor.getBoundingClientRect()
    const gap = 8
    // 高度按窗口算：插件窗口本身就是可见区域，超出去的部分会被窗口边缘裁掉
    const viewportHeight = window.innerHeight || 0
    const spaceBelow = viewportHeight - rect.top - gap
    const spaceAbove = rect.bottom - gap
    const flipUp = spaceBelow < 200 && spaceAbove > spaceBelow
    const space = Math.max(spaceBelow, spaceAbove, 0)
    return {
      placement: flipUp ? 'right-end' : 'right-start',
      // 上限 320：项少时不留空白，项多时（翻上去还放不下）就地滚动
      maxHeight: Math.max(120, Math.min(320, space))
    }
  })()

  // ---- 长按拖动排序 / 移动 ----
  // 搜索状态下顺序是过滤后的，拖了也对不上原始顺序，所以只在没有关键词时开放
  const canReorder = Boolean(onReorderItems) && !preview && !query.trim()
  const dragPressRef = useRef(null)
  const dragSuppressClickRef = useRef(0)
  const [drag, setDrag] = useState(null)

  // 拖动时的「让位」动画：换位是重排 DOM，浏览器会瞬移；
  // 这里用 FLIP（先记旧位置 → 重排 → 从旧位置滑回 0）让其他格子 / 盒子滑过去，
  // 观感才对得上手机桌面。只记顶层块，盒子里面的格子跟着盒子走，别重复动两遍
  const flipRectsRef = useRef(null)
  const flipTimerRef = useRef(0)

  const captureFlip = () => {
    const list = listRef.current
    if (!list) return
    const base = list.getBoundingClientRect()
    const map = new Map()
    list.querySelectorAll('[data-flip-id]').forEach((node) => {
      if (node.parentElement?.closest('[data-flip-id]')) return
      const rect = node.getBoundingClientRect()
      map.set(node.dataset.flipId, {
        x: rect.left - base.left + list.scrollLeft,
        y: rect.top - base.top + list.scrollTop
      })
    })
    flipRectsRef.current = map
  }

  useLayoutEffect(() => {
    const previous = flipRectsRef.current
    if (!previous) return
    flipRectsRef.current = null
    const list = listRef.current
    if (!list) return
    const base = list.getBoundingClientRect()
    const moved = []
    list.querySelectorAll('[data-flip-id]').forEach((node) => {
      if (node.parentElement?.closest('[data-flip-id]')) return
      const before = previous.get(node.dataset.flipId)
      if (!before) return
      const rect = node.getBoundingClientRect()
      const dx = before.x - (rect.left - base.left + list.scrollLeft)
      const dy = before.y - (rect.top - base.top + list.scrollTop)
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
      node.style.transition = 'none'
      node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
      moved.push(node)
    })
    if (!moved.length) return
    // 先让上面那帧位移落进样式，再放开过渡回到 0（否则浏览器会把两帧合成一帧，看不到滑动）
    void list.offsetHeight
    moved.forEach((node) => {
      node.style.transition = 'transform 210ms cubic-bezier(0.2, 0.8, 0.25, 1)'
      node.style.transform = ''
    })
    window.clearTimeout(flipTimerRef.current)
    flipTimerRef.current = window.setTimeout(() => {
      moved.forEach((node) => {
        node.style.transition = ''
        node.style.transform = ''
      })
    }, 260)
  })

  const nativeSrcFor = (item) => (
    item.type === ITEM_TYPES.PLUGIN
      ? pluginLogos[String(item.path).toLocaleLowerCase()]
      : icons[item.path]
  )

  // 左右 / 上下过半算「放到后面」。带一点滞回：已经判定在「后」时，指针得往回收过 0.38
  // 才翻回「前」——不然正好压在中心线上时，手抖一两像素就会来回翻，看着就是闪
  const placeAfterIn = (rect, x, y, horizontal, previous) => {
    const ratio = horizontal
      ? (x - rect.left) / Math.max(1, rect.width)
      : (y - rect.top) / Math.max(1, rect.height)
    const edge = previous === true ? 0.38 : (previous === false ? 0.62 : 0.5)
    return ratio > edge
  }

  const dropKey = (drop) => (drop
    ? [drop.type, drop.id || '', drop.groupId || '', drop.blockId || '',
        drop.targetId || '', drop.placeAfter ? 1 : 0].join('|')
    : '')

  // 落点落在目标的哪一段：before / core / after。
  // core 是「中间那一块」，意思是「塞进这个分组」；两边就是「排在它前面 / 后面」。
  // checkVertical 给盒子用：压在标题条（顶部）上不该算「塞进去」
  const dropZone = (rect, x, y, horizontal, checkVertical = false) => {
    const nx = (x - rect.left) / Math.max(1, rect.width)
    const ny = (y - rect.top) / Math.max(1, rect.height)
    if (checkVertical && (ny < DROP_CORE.top || ny > DROP_CORE.bottom)) {
      return ny < DROP_CORE.top ? 'before' : 'after'
    }
    const ratio = horizontal ? nx : ny
    if (ratio < DROP_CORE.start) return 'before'
    if (ratio > DROP_CORE.end) return 'after'
    return 'core'
  }

  // 分组入口不能挪进它自己指向的那个分组：会变成「A 里再套一条指向 A 的入口」，点进去还是原地。
  // 只是 A↔B 互相包含是可以的（盒子展开时按 ancestors 只展开一次，不会无限套娃）。
  const nestsIntoSelf = (item, targetGroupId) => (
    Boolean(item) &&
    item.type === ITEM_TYPES.GROUP &&
    Boolean(item.groupId) &&
    Boolean(targetGroupId) &&
    item.groupId === targetGroupId
  )

  // 指针落在条目区的空白处（格子 / 盒子之间的缝隙、最后一个条目后面）时，
  // 找同级里离指针最近的那一格 / 那个盒子入口，按它的中点决定插在前面还是后面。
  // 盒子视图里格子与盒子共用一条顺序，只有按「最近的一条」算，拖到盒子左右才落得下
  const nearestSiblingDrop = (press, x, y) => {
    const list = listRef.current
    if (!list) return null
    let best = null
    let bestScore = Infinity
    Array.prototype.forEach.call(list.children, (node) => {
      if (!(node instanceof HTMLElement)) return
      const tileId = node.dataset.compactId
      const boxId = node.dataset.blockKind === 'box' ? node.dataset.blockId : ''
      if (!tileId && !boxId) return
      if (tileId && tileId === press.item.id) return
      const rect = node.getBoundingClientRect()
      // 指针在元素外面时按到边框的距离算；贴得最近的那一条就是落点参照物
      const dx = rect.left > x ? rect.left - x : Math.max(0, x - rect.right)
      const dy = rect.top > y ? rect.top - y : Math.max(0, y - rect.bottom)
      const score = dx * dx + dy * dy
      if (score >= bestScore) return
      bestScore = score
      const horizontal = !tileId || node.dataset.compactAxis !== 'y'
      const center = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2
      best = {
        id: boxId || tileId,
        type: boxId ? 'box' : 'item',
        placeAfter: horizontal ? x > center : y > center
      }
    })
    return best
  }

  // 落点解析：条目 → 同组换位 / 别的分组 = 移动；盒子 → 落在别的盒子内容区 = 整个移进去
  // （所以可以一层层套下去），落在顶层盒子标题条上 = 盒子之间换位
  const resolveDrop = (press, x, y) => {
    const hit = document.elementFromPoint(x, y)
    if (!hit || typeof hit.closest !== 'function') return null
    const inList = Boolean(listRef.current?.contains(hit))

    if (press.kind === 'box') {
      const block = hit.closest('[data-block-kind="box"]')
      const id = block?.dataset.blockId
      // 落在自己身上（那个空位）：沿用上一次落点，否则会和实时让位互相打架、抖个不停
      if (id && id === press.item.id) return press.drop || null
      if (!block) {
        // 压在盒子外面的普通格子上：按这一格的前 / 后插入。
        // 盒子视图里格子和盒子共用一条顺序，所以只有「比上一次落点更靠前 / 更靠后」才算新落点
        const tile = hit.closest('[data-compact-id]')
        const tileId = tile?.dataset.compactId
        const tileGroup = tile?.dataset.compactGroup || ''
        if (tileId && tileId !== press.item.id && tileGroup === press.groupId) {
          const rect = tile.getBoundingClientRect()
          const horizontal = tile.dataset.compactAxis !== 'y'
          const previous = press.drop?.id === tileId ? press.drop.placeAfter : undefined
          return {
            type: 'box',
            id: tileId,
            placeAfter: placeAfterIn(rect, x, y, horizontal, previous)
          }
        }
        return inList ? (press.drop || null) : null
      }
      const hostGroup = block.dataset.blockGroup || ''
      const depth = Number(block.dataset.blockDepth || 0)
      const previous = press.drop?.type === 'box' && press.drop.id === id
        ? press.drop.placeAfter
        : undefined
      const rect = block.getBoundingClientRect()
      // 只有指针压在盒子「中间那一块」才算塞进去；落在四边附近都按排序处理。
      // 这样拖着重排顺序、从别的盒子上掠过时，不会顺手把分组塞进人家里面
      const zone = dropZone(rect, x, y, true, true)
      const canNest = zone === 'core' &&
        hostGroup &&
        hostGroup !== press.groupId &&
        groupsById.has(hostGroup) &&
        !nestsIntoSelf(press.item, hostGroup)
      if (canNest) return { type: 'move', groupId: hostGroup, blockId: id }
      // 顶层兄弟盒子之间：换位置。指针在中间却没塞进去（比如同一个分组）时，
      // 退回按左右中点排序，别把落点丢了
      if (depth === 0) {
        return {
          type: 'box',
          id,
          placeAfter: zone === 'core'
            ? placeAfterIn(rect, x, y, true, previous)
            : zone === 'after'
        }
      }
      // 更深的楼层里没有「换位」可言，落不到别的分组就当没落点
      return press.drop || null
    }

    const tile = hit.closest('[data-compact-id]')
    const tileId = tile?.dataset.compactId
    const tileGroup = tile?.dataset.compactGroup || ''
    // data-block-group 在整个条目区和每个盒子上都有：落点属于哪个分组就看它
    const container = hit.closest('[data-block-group]')
    const containerGroup = container?.dataset.blockGroup || ''
    const block = hit.closest('[data-block-kind="box"]')
    const containerBoxId = block?.dataset.blockId || null

    if (tileId && tileId === press.item.id) return press.drop || null

    // 压在别的分组的盒子上：和拖整块盒子一样，只有指针在「中间那一块」才算移进这个分组，
    // 靠边（含标题条）一律按「排到这个盒子入口的前 / 后」处理。
    // 不这么分的话，盒子几乎占满条目区，想把条目插到它前面 / 后面时会怎么拖都被吞进分组
    if (containerBoxId && containerGroup !== press.groupId && groupsById.has(containerGroup)) {
      const rect = block.getBoundingClientRect()
      const zone = dropZone(rect, x, y, true, true)
      const canNest = zone === 'core' && !nestsIntoSelf(press.item, containerGroup)
      if (canNest) {
        const overTile = tileId && tileId !== press.item.id && tileGroup === containerGroup
        if (!overTile) return { type: 'move', groupId: containerGroup, blockId: containerBoxId }
        const tileRect = tile.getBoundingClientRect()
        const horizontal = tile.dataset.compactAxis !== 'y'
        const previous = press.drop?.targetId === tileId ? press.drop.placeAfter : undefined
        return {
          type: 'move',
          groupId: containerGroup,
          blockId: containerBoxId,
          targetId: tileId,
          placeAfter: placeAfterIn(tileRect, x, y, horizontal, previous)
        }
      }
      // 拖的是当前分组自己的条目：插到这个盒子入口的前 / 后（与拖盒子排序同一套落点语义）。
      // 拖的是别的盒子里的条目：落到这个盒子的边上 = 移进当前分组，同样插在它前面 / 后面
      if (press.groupId === group.id) {
        const previous = press.drop?.type === 'box' && press.drop.id === containerBoxId
          ? press.drop.placeAfter
          : undefined
        return {
          type: 'box',
          id: containerBoxId,
          placeAfter: zone === 'after' || (zone === 'core' && placeAfterIn(rect, x, y, true, previous))
        }
      }
      return {
        type: 'move',
        groupId: group.id,
        targetId: containerBoxId,
        placeAfter: zone === 'after'
      }
    }

    // 落到别的分组的容器里（不是盒子）= 把这个条目移过去
    if (
      containerGroup &&
      containerGroup !== press.groupId &&
      groupsById.has(containerGroup) &&
      !nestsIntoSelf(press.item, containerGroup)
    ) {
      const overTile = tileId && tileId !== press.item.id && tileGroup === containerGroup
      if (!overTile) return { type: 'move', groupId: containerGroup, blockId: containerBoxId }
      const rect = tile.getBoundingClientRect()
      const horizontal = tile.dataset.compactAxis !== 'y'
      const previous = press.drop?.targetId === tileId ? press.drop.placeAfter : undefined
      return {
        type: 'move',
        groupId: containerGroup,
        blockId: containerBoxId,
        targetId: tileId,
        placeAfter: placeAfterIn(rect, x, y, horizontal, previous)
      }
    }

    // 拖到「分组入口」的正中间才算移进那个分组；压在上 / 下（列表行）或左 / 右（格子）边缘
    // 时留给下面的「同组换位」，不然想排个顺序都会顺手把条目吞进分组里
    if (tileId && tileId !== press.item.id) {
      const targetItem = visibleItems.find((entry) => entry.id === tileId)
      const rect = tile.getBoundingClientRect()
      const horizontal = tile.dataset.compactAxis !== 'y'
      const zone = dropZone(rect, x, y, horizontal)
      if (
        zone === 'core' &&
        targetItem?.type === ITEM_TYPES.GROUP &&
        targetItem.groupId &&
        targetItem.groupId !== press.groupId &&
        groupsById.has(targetItem.groupId) &&
        !nestsIntoSelf(press.item, targetItem.groupId)
      ) {
        return { type: 'move', groupId: targetItem.groupId, blockId: null }
      }
    }

    // 同一个分组内换位
    if (tileId && tileId !== press.item.id && tileGroup === press.groupId) {
      const rect = tile.getBoundingClientRect()
      const horizontal = tile.dataset.compactAxis !== 'y'
      const previous = press.drop?.id === tileId ? press.drop.placeAfter : undefined
      return {
        type: 'item',
        id: tileId,
        placeAfter: placeAfterIn(rect, x, y, horizontal, previous)
      }
    }

    // 落在格子之间的空隙里：保持上一次落点。返回 null 会让实时让位「弹回去」，
    // 指针下面又出现新的格子、于是又让位……这一来一回就是抖动闪烁。
    // 只对「拖动源本来就在当前分组」成立；从盒子里往外拖时，飘回盒子自己的空隙
    // 应该算「没落点」，否则会沿用上一次的「移到外层分组」，松手就被意外拖出去
    if (!inList) return null
    // 指针已经不在任何盒子里（落在条目区的空白处）：盒子视图里按最近的同级条目算插入位置。
    // 上一次落点如果还是「移入某个分组」，绝不能沿用 —— 指针明明已经离开盒子中间，
    // 松手却仍会被吞进分组，正是「怎么拖都会放进分组」的另一半原因
    if (!block && columns) {
      if (press.drop && press.drop.type !== 'move') return press.drop
      const sibling = nearestSiblingDrop(press, x, y)
      if (sibling) {
        // 当前分组自己的条目 = 排序；从盒子里拖出来的条目 = 移进当前分组并插到这个位置
        if (press.groupId === group.id) {
          return { type: sibling.type, id: sibling.id, placeAfter: sibling.placeAfter }
        }
        return {
          type: 'move',
          groupId: group.id,
          targetId: sibling.id,
          placeAfter: sibling.placeAfter
        }
      }
    }
    if (press.drop?.type === 'move') return null
    return press.groupId === group.id ? (press.drop || null) : null
  }

  const startDragPress = (spec) => (event) => {
    if (!canReorder || (event.pointerType === 'mouse' && event.button !== 0)) return
    const inside = event.target instanceof Element ? event.target : null
    // 行内的虚线按钮 / 盒子头部的图标按钮不参与拖动；只有盒子标题那条允许「按住标题拖整块」
    const button = inside?.closest('button')
    if (button && !(spec.kind === 'box' && button.hasAttribute('data-box-grab'))) return
    // 盒子容器上的监听也会收到「盒子里条目」冒泡上来的按下事件，那种情况交给条目自己
    if (spec.kind === 'box' && inside?.closest('[data-compact-id]')) return
    // 同理，按在「嵌在里面的子盒子」上也别把整个外层盒子拎起来
    if (spec.kind === 'box') {
      const inner = inside?.closest('[data-block-kind="box"]')
      if (inner && inner !== event.currentTarget) return
    }
    dragPressRef.current?.cleanup?.()

    const element = event.currentTarget
    const rect = element?.getBoundingClientRect?.() ||
      { left: event.clientX, top: event.clientY, width: 0, height: 0 }

    const press = {
      kind: spec.kind,
      item: spec.item,
      groupId: spec.groupId,
      nativeSrc: spec.nativeSrc,
      // 格子是横向排布（左右换位），列表行是纵向（上下换位）：落点判定和「提起来」的放大倍数都看它
      axis: element?.dataset?.compactAxis === 'y' ? 'y' : 'x',
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      drop: null,
      point: null,
      rendered: null,
      timer: 0,
      cleanup: null,
      // 整块盒子拖动时贴在指针下面的那份克隆（原生节点，免得每帧重渲染整个盒子）
      ghost: null
    }

    // 拎起一个盒子 = 把盒子自己克隆一份贴在指针下面：和手机上「拿起一个文件夹」一样，
    // 浮层就是容器本体（带投影、微微放大），原位留一个空槽；不再是一小条标签飘着
    const spawnBoxGhost = () => {
      if (press.kind !== 'box' || press.ghost || !element?.cloneNode) return
      const clone = element.cloneNode(true)
      // 克隆件只是「被拎起来的那一份」，不参与落点命中，也不再是拖动源
      ;['data-block-kind', 'data-block-id', 'data-block-group', 'data-block-depth', 'data-flip-id']
        .forEach((name) => clone.removeAttribute(name))
      clone.querySelectorAll('[data-compact-id]').forEach((node) => node.removeAttribute('data-compact-id'))
      const style = clone.style
      style.position = 'fixed'
      style.left = '0'
      style.top = '0'
      style.margin = '0'
      style.width = `${rect.width}px`
      style.height = `${rect.height}px`
      // 缩放原点钉在抓取点：拎起来的瞬间手指下面那块内容不会跑偏
      style.transformOrigin = `${press.grabX}px ${press.grabY}px`
      style.pointerEvents = 'none'
      style.zIndex = '2600'
      style.willChange = 'transform'
      style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.34)'
      // 底色沿用盒子自己的（半透明），拎起来之后和没拖动时长得一模一样，
      // 背后的壁纸照样透出来
      style.transition = 'scale 170ms cubic-bezier(0.2, 0.85, 0.3, 1.2)'
      style.scale = '1.02'
      style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`
      document.body.appendChild(clone)
      press.ghost = clone
    }

    const moveBoxGhost = (x, y) => {
      if (!press.ghost) return
      press.ghost.style.transform = `translate3d(${Math.round(x - press.grabX)}px, ${Math.round(y - press.grabY)}px, 0)`
    }

    const killBoxGhost = () => {
      press.ghost?.remove()
      press.ghost = null
    }

    const stopListening = () => {
      window.clearTimeout(press.timer)
      window.removeEventListener('pointermove', press.move)
      window.removeEventListener('pointerup', press.up)
      window.removeEventListener('pointercancel', press.up)
      if (listRef.current) listRef.current.style.userSelect = ''
      document.body.style.cursor = ''
      killBoxGhost()
      if (dragPressRef.current === press) dragPressRef.current = null
    }
    press.cleanup = stopListening

    // 拖到列表上下边缘时自己滚一段，长列表也能拖到屏幕外的位置
    const autoScroll = (y) => {
      const box = listRef.current
      if (!box) return
      const rect = box.getBoundingClientRect()
      if (y < rect.top + 24) box.scrollTop -= 12
      else if (y > rect.bottom - 24) box.scrollTop += 12
    }

    // 算一次落点并按需更新浮层。落点没变、指针也没挪动整整一格像素时直接不 setState——
    // 静止时的细小抖动就不会再一轮轮重渲染，也就不会闪
    const flushMove = () => {
      if (!press.active || !press.point) return
      const nextDrop = resolveDrop(press, press.point.x, press.point.y)
      const changed = dropKey(nextDrop) !== dropKey(press.drop)
      if (changed) press.drop = nextDrop
      const x = Math.round(press.point.x)
      const y = Math.round(press.point.y)
      if (!changed && press.rendered && press.rendered.x === x && press.rendered.y === y) return
      // 先记下这一帧的位置，重排之后才知道谁该从哪儿滑过来（只有落点变了才会重排）
      if (changed) captureFlip()
      press.rendered = { x, y }
      moveBoxGhost(press.point.x, press.point.y)
      setDrag({
        kind: press.kind,
        item: press.item,
        groupId: press.groupId,
        nativeSrc: press.nativeSrc,
        axis: press.axis,
        grabX: press.grabX,
        grabY: press.grabY,
        width: press.width,
        height: press.height,
        drop: press.drop,
        x: press.point.x,
        y: press.point.y
      })
    }

    press.move = (moveEvent) => {
      if (!press.active) {
        // 长按还没成立就动起来：当成滚动 / 普通点击，直接放弃这次拖动
        if (Math.hypot(moveEvent.clientX - press.startX, moveEvent.clientY - press.startY) > DRAG_MOVE_TOLERANCE) {
          stopListening()
        }
        return
      }
      moveEvent.preventDefault()
      autoScroll(moveEvent.clientY)
      press.point = { x: moveEvent.clientX, y: moveEvent.clientY }
      flushMove()
    }

    press.up = () => {
      const active = press.active
      const drop = press.drop
      stopListening()
      setDrag(null)
      if (!active) return
      // 松手后浏览器还会补一个 click，别让它顺手把条目启动了
      dragSuppressClickRef.current = Date.now() + 240
      if (!drop) return
      if (drop.type === 'box' || drop.type === 'item') {
        onReorderItems?.(press.item.id, drop.id, drop.placeAfter, press.groupId)
      } else if (drop.type === 'move') {
        onMoveItem?.(press.item, {
          groupId: drop.groupId,
          targetId: drop.targetId,
          placeAfter: drop.placeAfter
        })
      }
    }

    press.timer = window.setTimeout(() => {
      press.active = true
      press.rendered = { x: Math.round(press.startX), y: Math.round(press.startY) }
      dragSuppressClickRef.current = Date.now() + 320
      if (listRef.current) listRef.current.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'
      spawnBoxGhost()
      setDrag({
        kind: press.kind,
        item: press.item,
        groupId: press.groupId,
        nativeSrc: press.nativeSrc || nativeSrcFor(press.item),
        axis: press.axis,
        grabX: press.grabX,
        grabY: press.grabY,
        width: press.width,
        height: press.height,
        drop: null,
        x: press.startX,
        y: press.startY
      })
    }, DRAG_HOLD_MS)

    dragPressRef.current = press
    window.addEventListener('pointermove', press.move)
    window.addEventListener('pointerup', press.up)
    window.addEventListener('pointercancel', press.up)
  }

  // 拖动刚结束的那次 click 不要当成「启动条目」
  const launchFromItem = (item) => {
    if (Date.now() < dragSuppressClickRef.current) return
    onLaunch(item)
  }

  // 组件卸载时（比如切视图）别留下 window 上的拖动监听
  useEffect(() => () => { dragPressRef.current?.cleanup?.() }, [])

  const openMenu = (item, index, itemGroup) => (event) => {
    event.preventDefault()
    if (preview) return
    applyCursor(index)
    setMenu({ x: event.clientX, y: event.clientY, item, itemGroup })
  }

  // 菜单已经打开时右键另一个条目：MUI 的遮罩会吃掉这次 contextmenu（下层条目根本收不到事件），
  // 所以在捕获阶段自己从坐标里找下层条目，直接把菜单换成新目标，不用先关再开
  useEffect(() => {
    if (!menu || preview) return undefined
    const handle = (event) => {
      const nodes = typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(event.clientX, event.clientY)
        : []
      const overMenu = nodes.some(
        (node) => node instanceof Element && node.closest('[role="menu"]')
      )
      if (overMenu) return
      event.preventDefault()
      event.stopPropagation()
      // 先找条目（盒子里的小格子 / 列表行），再退回它所在的盒子（标题条、边框）
      const pick = () => {
        for (const node of nodes) {
          if (!(node instanceof Element)) continue
          const tileId = node.closest('[data-compact-id]')?.dataset.compactId
          const blockId = tileId
            ? ''
            : node.closest('[data-block-kind="box"]')?.dataset.blockId
          const id = tileId || blockId
          if (!id) continue
          const found = entryById.get(id)
          if (!found) continue
          return { ...found, index: visibleIndexById.get(id) ?? -1 }
        }
        return null
      }
      const hit = pick()
      if (hit) {
        applyCursor(hit.index)
        setMenu({ x: event.clientX, y: event.clientY, item: hit.item, itemGroup: hit.groupId })
        return
      }
      // 点在面板内的空白处：换成「当前分组」的菜单（进入 / 修改分组 + 添加）；面板外则收起
      if (nodes.some((node) => node instanceof Element && rootRef.current?.contains(node))) {
        applyCursor(-1)
        setMenu({
          x: event.clientX,
          y: event.clientY,
          item: groupAsEntry,
          itemGroup: group.id,
          blank: true
        })
        return
      }
      setMenu(null)
    }
    window.addEventListener('contextmenu', handle, true)
    return () => window.removeEventListener('contextmenu', handle, true)
  }, [menu, entryById, groupAsEntry, visibleIndexById])

  // 拖动时的实时让位（手机桌面那种）：把被拖的条目挪到落点位置再渲染，
  // 这样手指下面的图标跟着走、其他图标自己让出空位
  const orderPreview = (list, containerGroupId) => {
    if (!drag || drag.kind !== 'item' || !drag.drop || drag.drop.type !== 'item') return list
    if (drag.groupId !== containerGroupId) return list
    const from = list.findIndex((entry) => entry.id === drag.item.id)
    const target = list.findIndex((entry) => entry.id === drag.drop.id)
    if (from < 0 || target < 0) return list
    let insert = drag.drop.placeAfter ? target + 1 : target
    if (from < insert) insert -= 1
    if (insert === from) return list
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(insert, 0, moved)
    return next
  }

  // 盒子视图里格子与盒子共用一条顺序：拖动时一起实时让位。
  // drop.id 可能是某个盒子入口的 id，也可能是某个格子的 id，两种都按「插到它前面 / 后面」处理
  const childrenPreview = (children) => {
    if (!drag || !drag.drop) return children
    const drop = drag.drop
    if (drop.type !== 'box' && drop.type !== 'item') return children
    const from = children.findIndex((child) => child.item.id === drag.item.id)
    const target = children.findIndex((child) => child.item.id === drop.id)
    if (from < 0 || target < 0) return children
    let insert = drop.placeAfter ? target + 1 : target
    if (from < insert) insert -= 1
    if (insert === from) return children
    const next = [...children]
    const [moved] = next.splice(from, 1)
    next.splice(insert, 0, moved)
    return next
  }

  // 盒子与平铺共用一套条目属性，index 决定键盘高亮顺序；
  // itemGroup 给长按拖动用：条目属于哪个分组（盒子里的条目属于目标分组）
  const tileProps = (item, index = visibleIndexById.get(item.id) ?? -1, itemGroup = group.id) => {
    const nativeSrc = nativeSrcFor(item)
    const isDragged = Boolean(drag && drag.kind === 'item' && drag.item.id === item.id)
    return {
      item,
      index,
      itemGroup,
      // 拖动中不要跟着指针点亮悬停格，会盖住「让位」的观感
      // 深层盒子里的条目没有 index（不在键盘顺序里），别让它误判成「选中」
      active: !drag && index >= 0 && index === activeIndex,
      dragging: isDragged,
      placeholder: isDragged,
      // 同组换位靠实时让位表达，不再画落点线；跨组移动时高亮的是目标盒子
      dropEdge: null,
      onImage,
      fg: foreground,
      activeOpacity,
      hoverOpacity,
      nativeSrc,
      onLaunch: () => launchFromItem(item),
      onHover: () => { if (!drag) applyCursor(index) },
      onContextMenu: openMenu(item, index, itemGroup),
      onPointerDown: startDragPress({ kind: 'item', item, groupId: itemGroup, nativeSrc })
    }
  }
  const renderTile = (item, owner = group.id) => (
    <CompactTile key={item.id} {...tileProps(item, undefined, owner)} />
  )

  // 空结果占位：两种视图共用
  const emptyState = (
    <Box
      sx={{
        gridColumn: '1 / -1',
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: foreground ? foreground.muted : 'text.secondary',
        gap: 0.8,
        py: 3
      }}
    >
      <SearchOffRoundedIcon sx={{ fontSize: 30, opacity: 0.45 }} />
      <Typography
        sx={{
          fontSize: 12.5,
          fontWeight: 550,
          color: foreground ? foreground.main : 'text.primary',
          textShadow: foreground ? foreground.shadow : 'none'
        }}
      >
        没有匹配结果
      </Typography>
      {query && (
        <Button size="small" onClick={() => onQueryChange?.('')}>
          清除搜索
        </Button>
      )}
    </Box>
  )

  // ---- 盒子（分组入口展开）的递归渲染 ----

  // 盒子内部：按「行数 × 行高」锁死可视高度，多出来的内容在盒子里滚动。
  // 不锁的话层数一多，每层都往上撑，整个面板会被撑爆
  const boxScrollSx = (maxHeight) => ({
    maxHeight,
    overflowY: 'auto',
    // 竖向滚动条占掉几像素时，横向别冒出一条没用的滚动条
    overflowX: 'hidden',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'thin',
    scrollbarColor: onImage
      ? (lightText ? 'rgba(255, 255, 255, 0.36) transparent' : 'rgba(17, 24, 39, 0.26) transparent')
      : (theme) => (theme.palette.mode === 'dark'
        ? 'rgba(255, 255, 255, 0.24) transparent'
        : 'rgba(15, 23, 42, 0.22) transparent'),
    '&::-webkit-scrollbar': { width: 6 },
    '&::-webkit-scrollbar-thumb': {
      borderRadius: '3px',
      bgcolor: onImage
        ? (lightText ? 'rgba(255, 255, 255, 0.36)' : 'rgba(17, 24, 39, 0.26)')
        : (theme) => (theme.palette.mode === 'dark'
          ? 'rgba(255, 255, 255, 0.24)'
          : 'rgba(15, 23, 42, 0.22)')
    },
    '&::-webkit-scrollbar-track': { bgcolor: 'transparent' }
  })

  const boxButton = {
    width: 20,
    height: 20,
    flexShrink: 0,
    p: 0,
    borderRadius: '5px',
    color: foreground ? foreground.muted : 'text.secondary',
    opacity: 0.72,
    '&:hover': {
      opacity: 1,
      color: foreground ? foreground.main : 'primary.main',
      bgcolor: onImage ? chromeHover(lightText) : 'action.hover'
    }
  }

  // 盒子里的这一层怎么拆，交给模块级的 splitByBoxes（键盘顺序那边也用同一套规则）。
  // allowBoxes 传 false：盒子里不再画子盒子，里面的分组入口就是一个普通格子
  const splitGroupItems = (owner, ancestors, allowBoxes = true) => splitByBoxes(
    owner,
    groupsById,
    query.trim(),
    ancestors,
    allowBoxes
  )

  // 画一级盒子：当前分组里的一条分组入口 → 一块固定列宽、横着铺开的盒子。
  // 盒子内部只画一层（自己的条目 + 里面的分组入口，都当普通格子），不再往深套
  const renderBox = (box) => {
    const target = box.target
    if (!target) return null
    const boxList = box.entry.boxView === 'list'
    const innerCols = nestedBoxCols
    const innerRows = nestedBoxRows
    const { own } = splitGroupItems(target, new Set([group.id, target.id]), false)
    const boxDragged = Boolean(drag && drag.kind === 'box' && drag.item.id === box.entry.id)
    const boxMoveTarget = Boolean(drag && drag.drop?.type === 'move' && drag.drop.blockId === box.entry.id)
    const boxOwn = orderPreview(own, target.id)
    // 条目按「行数 × 行高」限高，多出来的在盒子里自己滚
    const ownMaxHeight = innerRows * TILE_ROW_HEIGHT + (innerRows - 1) * TILE_GAP
    // 盒子占几行网格：内容高度 + 标题条 / 内边距，再按整行向上取整。
    // 必须按整行来占，右边那些格子才能被后面的条目补上 —— 否则盒子会把整行顶高，
    // 后面的条目只能另起一行，左边空出一大片
    const contentRows = Math.min(
      Math.max(1, Math.ceil(boxOwn.length / (boxList ? 1 : innerCols))),
      innerRows
    )
    const contentHeight = boxList
      ? contentRows * BOX_LIST_ROW_HEIGHT
      : contentRows * TILE_ROW_HEIGHT + (contentRows - 1) * TILE_GAP
    const spanRows = Math.max(
      1,
      Math.ceil((BOX_CHROME_HEIGHT + contentHeight) / (TILE_ROW_HEIGHT + TILE_GAP))
    )

    return (
      <Box
        key={box.entry.id}
        data-block-kind="box"
        data-block-id={box.entry.id}
        data-block-group={target.id}
        data-block-depth={0}
        data-flip-id={`b:${box.entry.id}`}
        onPointerDown={startDragPress({ kind: 'box', item: box.entry, groupId: group.id })}
        onContextMenu={(event) => {
          // 盒子里条目自己的右键菜单由条目负责；这里只接管标题条 / 边框 / 留白
          if (preview) return
          if (event.target instanceof Element && event.target.closest('[data-compact-id]')) return
          event.preventDefault()
          event.stopPropagation()
          setMenu({ x: event.clientX, y: event.clientY, item: box.entry, itemGroup: group.id })
        }}
        sx={{
          // 一格 = 一个格子；盒子按 nestedBoxCols 格铺开，按整行高占 spanRows 行，
          // 和格子同在一个网格里，右边的空位留给后面的条目回填
          gridColumn: `span ${nestedBoxCols}`,
          gridRow: `span ${spanRows}`,
          minWidth: 0,
          p: 0.7,
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid',
          borderColor: (theme) => (
            boxDragged
              ? (theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.06)')
              : onImage
                ? (lightText ? 'rgba(255, 255, 255, 0.18)' : 'rgba(17, 24, 39, 0.1)')
                : surfaces.border
          ),
          // 落点提示只压一层很淡的中性底（不再描主色环 / 画蓝色落点线，
          // 拖动时整片界面不该突然亮一块蓝）
          bgcolor: boxMoveTarget
            ? (onImage
                ? (lightText ? 'rgba(255, 255, 255, 0.26)' : 'rgba(255, 255, 255, 0.86)')
                : (mode === 'dark' ? 'rgba(255, 255, 255, 0.11)' : 'rgba(15, 23, 42, 0.07)'))
            : boxDragged
              ? (onImage
                  ? (lightText ? 'rgba(8, 10, 14, 0.18)' : 'rgba(255, 255, 255, 0.4)')
                  : (mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.02)'))
              : onImage
                // 盒子背景浓度：比单个格子实体一档，一眼能看出这是「一块区域」
                ? (lightText
                    ? `rgba(8, 10, 14, ${boxOpacity})`
                    : `rgba(255, 255, 255, ${boxOpacity})`)
                : (mode === 'dark' ? 'rgba(255, 255, 255, 0.045)' : 'rgba(15, 23, 42, 0.035)'),
          // 整块被拖走时原位只留一个空位（内容藏起来），和条目选中被拎走时一致
          ...(boxDragged ? { '& > *': { opacity: 0 } } : {}),
          transition: 'background-color 120ms ease, opacity 120ms ease'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.2, mb: 0.5, px: 0.1 }}>
          <Box
            component="button"
            type="button"
            data-box-grab="true"
            onClick={() => {
              // 刚拖完整块盒子时别顺手把分组点开
              if (Date.now() < dragSuppressClickRef.current) return
              onLaunch(box.entry)
            }}
            title={`进入「${box.entry.name}」分组`}
            aria-label={`进入「${box.entry.name}」分组`}
            sx={{
              // 只有「头像 + 名称」这一块可点（点空白不该跳分组），但给它留足高度和左右留白，
              // 点起来不至于只有一条细缝
              flex: '0 1 auto',
              maxWidth: '100%',
              minWidth: 0,
              appearance: 'none',
              border: 0,
              bgcolor: 'transparent',
              ml: '-4px',
              minHeight: 28,
              p: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 0.7,
              fontFamily: 'inherit',
              color: foreground ? foreground.main : 'text.primary',
              textAlign: 'left',
              textShadow: foreground ? foreground.shadow : 'none',
              cursor: 'pointer',
              borderRadius: '6px',
              opacity: 0.92,
              transition: 'opacity 120ms ease, background-color 120ms ease',
              '&:hover': {
                opacity: 1,
                bgcolor: onImage
                  ? (lightText ? 'rgba(255, 255, 255, 0.1)' : 'rgba(17, 24, 39, 0.05)')
                  : 'action.hover'
              },
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
                outlineOffset: 1
              }
            }}
          >
            <GroupAvatar group={target || box.entry} size={18} />
            <Typography
              noWrap
              sx={{
                minWidth: 0,
                fontSize: 11.5,
                fontWeight: 650,
                lineHeight: 1.4
              }}
            >
              {box.entry.name}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }} />
          {/* 平铺 / 列表、添加、移除都是「这条入口在宿主分组里」的设置 */}
          {!preview && (
            <>
              <IconButton
                size="small"
                sx={boxButton}
                aria-label={boxList ? '切到平铺' : '切到列表'}
                title={boxList ? '平铺' : '列表'}
                onClick={() => onSetBoxView?.(box.entry, boxList ? 'grid' : 'list')}
              >
                {boxList
                  ? <ViewModuleRoundedIcon sx={{ fontSize: 14 }} />
                  : <ViewListRoundedIcon sx={{ fontSize: 14 }} />}
              </IconButton>
              <IconButton
                size="small"
                sx={boxButton}
                aria-label="添加分组"
                title="添加分组"
                onClick={() => onAddGroup?.(box.entry.groupId)}
              >
                <AddRoundedIcon sx={{ fontSize: 15 }} />
              </IconButton>
              <IconButton
                size="small"
                sx={{
                  ...boxButton,
                  '&:hover': {
                    opacity: 1,
                    color: 'error.main',
                    bgcolor: onImage ? chromeHover(lightText) : 'action.hover'
                  }
                }}
                aria-label={`把「${box.entry.name}」从「${group.name}」移出`}
                title="移出分组"
                // 只摘掉这条入口，分组本身（以及它的内容）原样保留
                onClick={() => onRemoveItem?.(box.entry, group.id)}
              >
                <DeleteForeverRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </>
          )}
        </Box>
        <Box
          data-box-body
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.7,
            minHeight: 0,
            // 盒子被撑到整行高，剩下的高度留给这里（内容不够时底部留白，不拉伸图标）
            flex: '1 1 auto',
            ...boxScrollSx(ownMaxHeight)
          }}
        >
          {boxOwn.length > 0 && (boxList
            ? boxOwn.map((item) => (
              <CompactRow
                key={item.id}
                {...tileProps(item, undefined, target.id)}
                dense
                adminEnabled={adminEnabled}
                onReveal={onRevealItem}
                onRunAsAdmin={onRunAsAdmin}
              />
            ))
            : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${innerCols}, minmax(0, 1fr))`,
                  gridAutoRows: 'min-content',
                  alignContent: 'start',
                  columnGap: 0.5,
                  rowGap: 0.5
                }}
              >
                {boxOwn.map((item) => renderTile(item, target.id))}
              </Box>
              ))}
        </Box>
      </Box>
    )
  }

  // 条目区：mode 决定格子还是行；cols 非空时画嵌套盒子
  const renderBody = (viewMode, cols, items) => {
    if (!items.length && !cols) return emptyState
    if (cols) {
      // 格子与盒子按分组里的原始顺序混排：谁在前就排在前面，
      // 拖盒子 / 拖格子的落点才有意义（盒子不再固定排在自己条目那一块后面）
      const children = childrenPreview(columnsChildren || [])
      return children.map((child) => (child.kind === 'box'
        ? renderBox(child.box)
        : renderTile(child.item)))
    }
    const flatOrder = orderPreview(items, group.id)
    return flatOrder.map((item, index) => (
      viewMode === 'grid'
        ? <CompactTile key={item.id} {...tileProps(item, index, group.id)} />
        : (
          <CompactRow
            key={item.id}
            {...tileProps(item, index, group.id)}
            adminEnabled={adminEnabled}
            onReveal={onRevealItem}
            onRunAsAdmin={onRunAsAdmin}
          />
          )
    ))
  }

  // 列表容器 / 离屏测量层共用的布局
  const contentLayout = (viewMode, cols) => {
    if (cols) {
      // 格子与盒子同一套网格：格子占一格一行，盒子占 nestedBoxCols 格 × 若干整行。
      // 行高写死成格子高度，dense 让后面的条目回填盒子旁边 / 下方的空格
      return {
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${BLOCK_TILE_WIDTH}px, 1fr))`,
        gridAutoRows: `${TILE_ROW_HEIGHT}px`,
        gridAutoFlow: 'row dense',
        alignItems: 'stretch',
        alignContent: 'start',
        columnGap: 0.5,
        rowGap: 0.5,
        px: 0.9,
        py: 0.9,
        overflowX: 'hidden'
      }
    }
    return viewMode === 'grid'
      ? {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
          gridAutoRows: 'min-content',
          alignContent: 'start',
          columnGap: 0.5,
          rowGap: 0.5,
          px: 0.9,
          py: 0.9
        }
      : { px: 0.8, py: 0.6 }
  }

  return (
    <Box
      ref={rootRef}
      onContextMenu={(event) => {
        // 条目 / 盒子自己会开更具体的菜单；这里只接空白处（面板底、盒子之间的空隙）
        if (preview) return
        if (event.target instanceof Element && event.target.closest('[data-compact-id],[data-block-kind]')) return
        event.preventDefault()
        event.stopPropagation()
        applyCursor(-1)
        setMenu({
          x: event.clientX,
          y: event.clientY,
          item: groupAsEntry,
          itemGroup: group.id,
          blank: true
        })
      }}
      sx={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        // 预览嵌在弹窗里，外面已经有边框与底图，不再留白底
        p: preview ? 0 : 1.2,
        bgcolor: preview
          ? 'transparent'
          : (mode === 'dark' ? '#17181b' : '#f4f4f5')
      }}
    >
      <Paper
        elevation={0}
        sx={{
          position: 'relative',
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
        {backgroundSrc && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              // 模糊会把软边糊到画布外，负 inset 把图放大一圈，边缘才不会透出底色
              inset: backgroundBlur ? -backgroundBlur * 2 : 0,
              zIndex: 0,
              pointerEvents: 'none',
              backgroundImage: `url("${backgroundSrc}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: backgroundBlur ? `blur(${backgroundBlur}px)` : undefined
            }}
          />
        )}
        {backgroundSrc && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              pointerEvents: 'none',
              bgcolor: mode === 'dark'
                ? `rgba(17, 18, 21, ${backgroundDim / 100})`
                : `rgba(244, 244, 245, ${backgroundDim / 100})`
            }}
          />
        )}
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            px: 1.6,
            py: 1.1,
            display: 'flex',
            alignItems: 'center',
            gap: 1.2,
            flexShrink: 0,
            background: scrim || undefined,
            borderBottom: '1px solid',
            borderColor: onImage ? 'transparent' : surfaces.border
          }}
        >
          <GroupAvatar group={group} size={30} />
          <Box sx={{ flex: '0 1 auto', minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: 13.5,
                fontWeight: 700,
                lineHeight: 1.3,
                color: foreground ? foreground.main : 'inherit',
                textShadow: foreground ? foreground.shadow : 'none'
              }}
              noWrap
            >
              {group.name}
            </Typography>
            <Typography
              sx={{
                fontSize: 10.5,
                color: foreground ? foreground.muted : 'text.secondary',
                lineHeight: 1.3
              }}
            >
              {columns
                ? (query.trim() ? `${visibleItems.length} 项` : `${group.items.length} 项`)
                : (visibleItems.length === group.items.length
                    ? `${group.items.length} 项`
                    : `${visibleItems.length} / ${group.items.length} 项`)}
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
              bgcolor: foreground ? chromeBackground(lightText) : surfaces.inset,
              borderRadius: '8px',
              gap: '1px',
              '& .MuiToggleButton-root': {
                width: 27,
                p: 0,
                border: 0,
                borderRadius: '7px',
                color: foreground ? foreground.muted : 'text.secondary',
                transition: 'background-color 120ms ease, color 120ms ease',
                '&:hover': {
                  bgcolor: foreground
                    ? chromeHover(lightText)
                    : (mode === 'dark' ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.42)')
                },
                '&.Mui-selected': {
                  color: foreground ? foreground.main : 'primary.main',
                  bgcolor: foreground
                    ? chromeSelected(lightText, true)
                    : (mode === 'dark' ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.86)'),
                  '&:hover': {
                    bgcolor: foreground
                      ? chromeSelected(lightText, true)
                      : (mode === 'dark' ? 'rgba(255, 255, 255, 0.20)' : 'rgba(255, 255, 255, 0.92)')
                  }
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
            <Tooltip title="展开完整界面">
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
                  color: foreground ? foreground.muted : 'text.secondary',
                  transition: 'color 120ms ease, background-color 120ms ease',
                  '&:hover': {
                    color: foreground ? foreground.main : 'primary.main',
                    bgcolor: foreground
                      ? chromeHover(lightText)
                      : (mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.5)')
                  }
                }}
              >
                <OpenInFullRoundedIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>

            <Box
              component="button"
              type="button"
              onClick={onExpand}
              title="展开"
              aria-label="展开完整界面"
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
                color: foreground ? foreground.muted : 'text.secondary',
                opacity: 0.9,
                textShadow: foreground ? foreground.shadow : 'none',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'color 120ms ease, opacity 120ms ease',
                '&:hover': {
                  color: foreground ? foreground.main : 'primary.main',
                  opacity: 1
                },
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
          className="compact-view-in scroll-fade"
          // 整块条目区也标成「当前分组的容器」：这样从盒子里往外拖时，
          // 拖到盒子外面的空白处松手 = 把这条移进当前分组（把分组里的分组捞出来）
          data-block-group={group.id}
          sx={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            // 滚动条本体藏起来（右侧不再出现一条竖线），可滚动性由上下渐隐表达
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none', width: 0, height: 0 },
            // 边缘渐隐高度：滚开顶部 / 还有内容在下方时才撑开（CSS 里做了长度过渡）
            // 预览窗里的缩放比不一定是 1，渐隐跟着放大一点才看得清
            ...scrollFadeSx(fadeEdges, preview ? 26 : undefined),
            ...contentLayout(view, columns)
          }}
        >
          {renderBody(view, columns, visibleItems)}
        </Box>

      </Paper>

      {/* 拎起来的那一份跟着指针走；原位只留一个空位（见 placeholder 样式） */}
      {drag && drag.kind !== 'box' && (
        <DragGhost
          drag={drag}
          foreground={foreground}
        />
      )}

      {/* 落点提示独立于浮层：浮层贴着指针，提示再放进去就会被自己盖住 */}
      <DropBadge drag={drag} groupsById={groupsById} />

      <Menu
        open={Boolean(menu)}
        onClose={closeMenu}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
        slotProps={{
          paper: {
            'data-menu-item': menu?.item?.id || '',
            sx: {
              minWidth: 178,
              borderRadius: '10px',
              py: 0.4
            }
          }
        }}
      >
        {menu && menu.item.type === ITEM_TYPES.GROUP && [
          (onEnterGroup || onLaunch) && (
            <MenuItem
              key="enter"
              onClick={() => {
                closeMenu()
                // 「进入分组」= 展开完整界面并定位到这个分组；点盒子上的图标 / 名称只是就地切过去
                ;(onEnterGroup || onLaunch)?.(menu.item)
              }}
              sx={{ fontSize: 12.5 }}
            >
              <LoginRoundedIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
              进入分组
            </MenuItem>
          ),
          onEditGroupEntry && (
            <MenuItem
              key="edit-group"
              onClick={() => {
                closeMenu()
                onEditGroupEntry(menu.item)
              }}
              sx={{ fontSize: 12.5 }}
            >
              <EditRoundedIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
              修改分组
            </MenuItem>
          ),
          // 「添加」二级菜单：空白处 = 加到当前分组；对着盒子右键 = 加进那个盒子的分组。
          // 二级菜单一项都点不了时，这一项也不出现，免得展开一个空菜单
          menu.blank && addMenuItems.length > 0 && <Divider key="add-sep" sx={{ my: 0.5 }} />,
          addMenuItems.length > 0 && (
            <MenuItem
              key="add"
              aria-haspopup="menu"
              aria-expanded={Boolean(addMenuAnchor)}
              onMouseEnter={openAddMenu}
              onMouseLeave={closeAddMenuSoon}
              onClick={openAddMenu}
              sx={{ fontSize: 12.5 }}
            >
              <AddRoundedIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
              添加
              <ChevronRightRoundedIcon sx={{ fontSize: 16, ml: 'auto', color: 'text.secondary' }} />
            </MenuItem>
          ),
          // 只有「别的分组的入口」（盒子 / 格子）才有这一项：当前分组自己的菜单里
          // 不能把自己从身上摘掉，免得面板当场没了内容。
          // 注意这里只摘掉这条入口，目标分组本身（和里面的东西）原样保留
          !menu.blank && onRemoveItem && [
            <Divider key="group-sep" sx={{ my: 0.5 }} />,
            <MenuItem
              key="remove-entry"
              onClick={() => {
                closeMenu()
                onRemoveItem(menu.item, menu.itemGroup)
              }}
              sx={{ fontSize: 12.5, gap: 1.2, color: 'error.main' }}
            >
              <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
              移出分组
            </MenuItem>
          ]
        ]}
        {menu && menu.item.type !== ITEM_TYPES.GROUP && [
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
          // 没有本地路径（网址 / uTools 插件）就不出现「打开所在目录」，
          // 紧凑面板里不放置灰项：菜单只留当下真的能点的
          CAN_REVEAL.has(menu.item.type) && (
            <MenuItem
              key="reveal"
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
            </MenuItem>
          ),
          adminEnabled && CAN_ADMIN.has(menu.item.type) && (
            <MenuItem
              key="admin"
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
          ),
          // 修改：和主界面一致，放在「移出分组」上面，两段之间用分割线隔开
          onEditItem && [
            <Divider key="item-edit-sep" sx={{ my: 0.5 }} />,
            <MenuItem
              key="edit"
              onClick={() => {
                closeMenu()
                onEditItem(menu.item, menu.itemGroup)
              }}
              sx={{ fontSize: 12.5 }}
            >
              <EditRoundedIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
              修改
            </MenuItem>
          ],
          onRemoveItem && [
            <Divider key="item-sep" sx={{ my: 0.5 }} />,
            <MenuItem
              key="remove"
              onClick={() => {
                closeMenu()
                onRemoveItem(menu.item, menu.itemGroup)
              }}
              sx={{ fontSize: 12.5, color: 'error.main', gap: 1.2 }}
            >
              <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
              移出分组
            </MenuItem>
          ]
        ]}
      </Menu>

      {/* 「添加」二级菜单：用 Popper 而不是再套一个 Menu，避免它的遮罩把父菜单盖住 */}
      <Popper
        open={Boolean(addMenuAnchor) && Boolean(menu)}
        anchorEl={addMenuAnchor}
        placement={addMenuFit.placement}
        modifiers={[
          // 贴着窗口边缘时先翻转，翻不动就整体推回可见区域
          { name: 'preventOverflow', options: { padding: 6, altAxis: true } },
          { name: 'flip', options: { padding: 6 } }
        ]}
        sx={{ zIndex: 1400 }}
      >
        <Paper
          onMouseEnter={keepAddMenu}
          onMouseLeave={closeAddMenuSoon}
          sx={{
            ml: 0.3,
            minWidth: 186,
            maxHeight: addMenuFit.maxHeight,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            py: 0.4,
            borderRadius: '10px',
            border: '1px solid',
            borderColor: surfaces.border,
            bgcolor: mode === 'dark' ? 'rgba(38, 40, 46, 0.98)' : 'rgba(255, 255, 255, 0.99)',
            boxShadow: '0 14px 30px rgba(0, 0, 0, 0.22)'
          }}
        >
          <MenuList
            dense
            sx={{
              p: 0,
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              scrollbarWidth: 'thin'
            }}
          >
            {addMenuItems.map((entry) => {
              if (entry.divider) return <Divider key={entry.key} sx={{ my: 0.5 }} />
              const Icon = entry.icon
              return (
                <MenuItem
                  key={entry.key}
                  onClick={() => {
                    closeMenu()
                    entry.run?.()
                  }}
                  sx={{ fontSize: 12.5, gap: 1.2 }}
                >
                  <Icon sx={{ fontSize: 17, color: 'text.secondary' }} />
                  {entry.label}
                </MenuItem>
              )
            })}
          </MenuList>
        </Paper>
      </Popper>
    </Box>
  )
}
