import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import CompactGroupPanel from './CompactGroupPanel'
import ValueField from './ValueField'
import WheelSlider from './WheelSlider'
import { getSurfaces } from '../theme'
import { foregroundFromColor } from '../imageTone'
import { useScrollFade, scrollFadeSx } from '../useScrollFade'
import {
  ITEM_TYPES,
  DEFAULT_ACTIVE_OPACITY,
  DEFAULT_BACKGROUND_BLUR,
  DEFAULT_BACKGROUND_DIM,
  DEFAULT_BOX_OPACITY,
  DEFAULT_CHROME_OPACITY,
  DEFAULT_HOVER_OPACITY,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_OPACITY,
  MAX_BACKGROUND_BLUR,
  MAX_BACKGROUND_DIM,
  MIN_TEXT_OPACITY
} from '../data'

// 新分组还没有条目时，用几张示例卡撑起预览，方便判断格子密度和文字可读性
const SAMPLE_ITEMS = [
  { name: '示例条目', icon: 'globe', color: '#1276C5' },
  { name: '工作文档', icon: 'document', color: '#2E9E6B' },
  { name: '常用工具', icon: 'terminal', color: '#8B5CF6' },
  { name: '参考资料', icon: 'bookmark', color: '#D8A43A' },
  { name: '影音娱乐', icon: 'movie', color: '#E05A6B' },
  { name: '图库相册', icon: 'photos', color: '#2C9C9C' },
  { name: '代码仓库', icon: 'code', color: '#4A6CF7' },
  { name: '日程安排', icon: 'calendar', color: '#B4632B' }
].map((sample, index) => ({
  id: `preview-${index}`,
  type: ITEM_TYPES.URL,
  path: '',
  iconSource: 'builtin',
  ...sample
}))

// 预览的逻辑宽度：里面按这个宽度排版，再整体等比缩放到容器，字号与间距不变形
const PREVIEW_DESIGN_WIDTH = 520

// 字色预设：白 / 黑两档，其余走自定义取色。
// 「自动跟随底图明暗」已经拿掉了 —— 自动判定在壁纸上经常翻错，用户也没法预期
const TEXT_PRESETS = [
  { value: '#ffffff', label: '白色', swatch: '#ffffff' },
  { value: '#111827', label: '黑色', swatch: '#111827' }
]

// 自定义色块的底纹：没选过自定义色时显示彩虹圆点，提示这里是取色入口
const CUSTOM_SWATCH = 'conic-gradient(from 210deg, #f87171, #fbbf24, #34d399, #60a5fa, #c084fc, #f87171)'

// 允许 #RGB / #RRGGBB，允许省略 #，统一成小写 #rrggbb
function normalizeHexInput (value) {
  const raw = String(value || '').trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.split('').map((char) => char + char).join('')}`.toLowerCase()
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toLowerCase()
  return null
}

// 一行里的一格「标签 + 控件 + 右侧数值」。四格按 2×2 排，
// 比四条整行矮一半，弹窗就不用出滚动条了
// 一格「标签 + 控件 + 右侧数值」。数值不是只读文本，点一下就能直接输入
function ControlCell ({ label, title, number, unit = '%', min = 0, max = 100, onNumberChange, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Typography
        title={title}
        sx={{
          width: 72,
          flexShrink: 0,
          fontSize: 10.5,
          color: 'text.secondary',
          whiteSpace: 'nowrap'
        }}
      >
        {label}
      </Typography>
      {children}
      {number != null && (
        <ValueField
          value={number}
          min={min}
          max={max}
          unit={unit}
          ariaLabel={`${label}数值`}
          onCommit={onNumberChange}
        />
      )}
    </Box>
  )
}

// 色值本身也能直接改：平时显示 #RRGGBB，点一下变成输入框。
// 和数值框一样做成双态 —— 常驻 input 会多出一条边框，和旁边「10%」那种纯文字不齐。
// 宽度不写死：定宽 + 右对齐时，色值右侧留白会在框里显得像「左边多出一块」，
// 所以改成按字符数收着走，框永远贴着字
function HexField ({ value, onChange, ariaLabel = '字体颜色十六进制', titlePrefix = '当前' }) {
  const hex = String(value || DEFAULT_TEXT_COLOR).toUpperCase()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(hex)
  const inputRef = useRef(null)
  const skipCommitRef = useRef(false)

  // 外面改了颜色（点色块、点白/黑预设）就同步过来；正在输入时不打扰
  useEffect(() => {
    if (!editing) setText(hex)
  }, [hex, editing])

  useEffect(() => {
    if (!editing) return
    const node = inputRef.current
    if (!node) return
    node.focus()
    node.select()
  }, [editing])

  const commit = () => {
    const next = normalizeHexInput(text)
    setEditing(false)
    if (!next) {
      setText(hex)
      return
    }
    setText(next.toUpperCase())
    if (next !== String(value || '').toLowerCase()) onChange(next)
  }

  return (
    <Box
      title={`${titlePrefix} ${hex} · 点击可直接输入色值（可省略 #，支持 #RGB 与 #RRGGBB）`}
      onClick={() => {
        if (!editing) setEditing(true)
      }}
      sx={{
        // 定宽时右对齐会把留白全堆在左边，看着像框里多出一块；按字符数收着走就没这问题
        width: editing ? `calc(max(${text.length}ch + 9px, 40px))` : 'auto',
        flexShrink: 0,
        height: 20,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        px: '2px',
        border: '1px solid transparent',
        borderRadius: '5px',
        fontSize: 10.5,
        lineHeight: '16px',
        color: 'text.secondary',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.02em',
        cursor: 'text',
        transition: 'border-color 120ms ease, background-color 120ms ease',
        '&:hover': { borderColor: 'divider', bgcolor: 'action.hover' },
        ...(editing ? { borderColor: 'primary.main', bgcolor: 'background.paper' } : {})
      }}
    >
      {editing
        ? (
          <Box
            ref={inputRef}
            component="input"
            type="text"
            spellCheck={false}
            aria-label={ariaLabel}
            value={text}
            onChange={(event) => {
              // 「#」由组件自己补：用户只敲 FF3B30 也会实时变成 #FF3B30
              const digits = event.target.value.toUpperCase().replace(/[^0-9A-F]/g, '')
              setText(`#${digits.slice(0, 6)}`)
            }}
            onBlur={() => {
              if (skipCommitRef.current) {
                skipCommitRef.current = false
                setText(hex)
                setEditing(false)
                return
              }
              commit()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                skipCommitRef.current = true
                event.currentTarget.blur()
              }
            }}
            sx={{
              flex: 1,
              minWidth: 0,
              p: 0,
              m: 0,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              textAlign: 'right',
              color: 'text.primary',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: 'inherit'
            }}
          />
          )
        : hex}
    </Box>
  )
}

// 字体颜色：白 / 黑两个预设 + 一个自定义，右侧再挂一个可编辑的 #RRGGBB。
// 自定义用原生 input[type=color]：取色浮层由 Chromium 贴着控件弹出（和分组编辑器一致），
// 位置是跟着控件走的，不需要自己画色板；两处取色体验也因此统一
function TextColorPicker ({ value, onChange }) {
  const active = String(value || DEFAULT_TEXT_COLOR).toLowerCase()
  const isCustom = !TEXT_PRESETS.some((preset) => preset.value === active)

  const chip = (selected) => ({
    position: 'relative',
    flexShrink: 0,
    p: 0,
    borderRadius: '7px',
    border: '1px solid',
    borderColor: selected ? 'primary.main' : 'divider',
    bgcolor: 'background.paper',
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
    boxShadow: selected ? '0 0 0 2px rgba(18, 118, 197, 0.16)' : 'none',
    '&:hover': { borderColor: 'primary.main' },
    '&:focus-within': {
      outline: '2px solid',
      outlineColor: 'primary.main',
      outlineOffset: 1
    }
  })

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flex: 1, minWidth: 0 }}>
      {TEXT_PRESETS.map((preset) => {
        const selected = preset.value === active
        return (
          <Box
            key={preset.value}
            component="button"
            type="button"
            title={preset.label}
            aria-label={preset.label}
            aria-pressed={selected}
            onClick={() => onChange(preset.value)}
            sx={{ ...chip(selected), width: 24, height: 24 }}
          >
            <Box
              aria-hidden
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                bgcolor: preset.swatch,
                border: '1px solid',
                borderColor: 'rgba(0, 0, 0, 0.16)'
              }}
            />
            {selected && (
              <CheckRoundedIcon
                sx={{
                  position: 'absolute',
                  fontSize: 13,
                  color: preset.value === '#ffffff' ? 'rgba(17, 24, 39, 0.85)' : '#fff'
                }}
              />
            )}
          </Box>
        )
      })}

      {/* 彩虹圆点本身就是入口：透明 input[type=color] 铺满整个按钮，点哪都弹原生取色器 */}
      <Box
        component="label"
        title="自定义颜色"
        sx={{ ...chip(isCustom), width: 24, height: 24, overflow: 'hidden' }}
      >
        <Box
          aria-hidden
          sx={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: isCustom ? active : CUSTOM_SWATCH,
            border: '1px solid',
            borderColor: 'rgba(0, 0, 0, 0.16)'
          }}
        />
        {isCustom && (
          <CheckRoundedIcon
            sx={{
              position: 'absolute',
              fontSize: 13,
              color: 'rgba(255, 255, 255, 0.95)',
              textShadow: '0 0 2px rgba(0, 0, 0, 0.6)'
            }}
          />
        )}
        <Box
          component="input"
          type="color"
          aria-label="自定义颜色"
          value={active}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            p: 0,
            border: 0,
            opacity: 0,
            cursor: 'pointer'
          }}
        />
      </Box>

      <Box sx={{ ml: 'auto', pl: 0.6 }}>
        <HexField value={active} onChange={onChange} />
      </Box>
    </Box>
  )
}

// 衬底颜色（顶栏 / 盒子 / 悬浮 / 高亮 共用一个底色）：控件和「字体颜色」同一套 ——
// 一排色块 + 右侧可编辑的 #RRGGBB，只是多一档「自动」。
// 自动 = 不存颜色，由字色明暗推导（浅字配深底、深字配白底），也就是这组设置出现之前的表现
function SurfaceColorPicker ({ value, autoColor, onChange }) {
  const customHex = /^#[0-9a-f]{6}$/i.test(String(value || ''))
    ? String(value).toLowerCase()
    : null
  // 色块上显示实际会用的颜色：选了就显示选的，自动就显示推导出来的那一档
  const active = customHex || autoColor
  const presets = [
    { value: '#ffffff', label: '白色', swatch: '#ffffff' },
    { value: '#0b0d11', label: '黑色', swatch: '#0b0d11' }
  ]
  const isCustom = Boolean(customHex) && !presets.some((preset) => preset.value === customHex)

  const chip = (selected) => ({
    position: 'relative',
    flexShrink: 0,
    p: 0,
    borderRadius: '7px',
    border: '1px solid',
    borderColor: selected ? 'primary.main' : 'divider',
    bgcolor: 'background.paper',
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
    boxShadow: selected ? '0 0 0 2px rgba(18, 118, 197, 0.16)' : 'none',
    '&:hover': { borderColor: 'primary.main' },
    '&:focus-within': {
      outline: '2px solid',
      outlineColor: 'primary.main',
      outlineOffset: 1
    }
  })

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flex: 1, minWidth: 0 }}>
      {/* 自动：不存颜色，回到「按字色明暗推导」。其它三档都是明确指定 */}
      <Box
        component="button"
        type="button"
        title="自动：跟着字色明暗走（浅字配深底、深字配白底）"
        aria-label="自动"
        aria-pressed={!customHex}
        onClick={() => onChange(null)}
        sx={{
          ...chip(!customHex),
          width: 34,
          height: 24,
          px: 0.4,
          fontSize: 9.5,
          fontWeight: 600,
          color: customHex ? 'text.secondary' : 'primary.main'
        }}
      >
        自动
      </Box>

      {presets.map((preset) => {
        const selected = preset.value === customHex
        return (
          <Box
            key={preset.value}
            component="button"
            type="button"
            title={preset.label}
            aria-label={preset.label}
            aria-pressed={selected}
            onClick={() => onChange(preset.value)}
            sx={{ ...chip(selected), width: 24, height: 24 }}
          >
            <Box
              aria-hidden
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                bgcolor: preset.swatch,
                border: '1px solid',
                borderColor: 'rgba(0, 0, 0, 0.16)'
              }}
            />
            {selected && (
              <CheckRoundedIcon
                sx={{
                  position: 'absolute',
                  fontSize: 13,
                  color: preset.value === '#ffffff' ? 'rgba(17, 24, 39, 0.85)' : '#fff'
                }}
              />
            )}
          </Box>
        )
      })}

      {/* 彩虹圆点就是取色入口：透明 input[type=color] 铺满按钮，点哪都弹原生取色器 */}
      <Box
        component="label"
        title="自定义颜色"
        sx={{ ...chip(isCustom), width: 24, height: 24, overflow: 'hidden' }}
      >
        <Box
          aria-hidden
          sx={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: isCustom ? customHex : CUSTOM_SWATCH,
            border: '1px solid',
            borderColor: 'rgba(0, 0, 0, 0.16)'
          }}
        />
        {isCustom && (
          <CheckRoundedIcon
            sx={{
              position: 'absolute',
              fontSize: 13,
              color: 'rgba(255, 255, 255, 0.95)',
              textShadow: '0 0 2px rgba(0, 0, 0, 0.6)'
            }}
          />
        )}
        <Box
          component="input"
          type="color"
          aria-label="自定义衬底颜色"
          value={active}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            p: 0,
            border: 0,
            opacity: 0,
            cursor: 'pointer'
          }}
        />
      </Box>

      <Box sx={{ ml: 'auto', pl: 0.6 }}>
        <HexField
          value={active}
          onChange={onChange}
          ariaLabel="衬底颜色十六进制"
          titlePrefix={customHex ? '当前' : '自动，约'}
        />
      </Box>
    </Box>
  )
}

// 等比缩放容器：宽度按容器折算缩放比，逻辑高度用 CSS 反算（100% / scale），
// 所以不管容器的宽高怎么变，缩放后的面板永远刚好铺满，不会在底部留一条空带
function ScaledPreview ({ designWidth, children }) {
  const wrapRef = useRef(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const node = wrapRef.current
    if (!node) return undefined
    const measure = () => {
      const width = node.clientWidth
      if (!width) return
      const next = width / designWidth
      setScale((prev) => (Math.abs(prev - next) < 0.0005 ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [designWidth])

  return (
    <Box ref={wrapRef} sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: designWidth,
          height: `calc(100% / ${scale})`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

const smallSliderSx = {
  p: 0,
  mt: 0.1,
  '& .MuiSlider-rail, & .MuiSlider-track': { height: 3 },
  '& .MuiSlider-thumb': { width: 12, height: 12 }
}

// 搜索外观的所见即所得弹窗，三段式：
// 顶部标题 → 中间操作区（预览 + 背景 / 遮罩 / 模糊 / 文字控件）→ 底部取消与保存
export default function SearchAppearanceDialog ({
  open,
  onCancel,
  onComplete,
  group,
  // 预览嵌套分组视图时要用目标分组的真实条目
  groups,
  view,
  backgroundSrc,
  dim,
  onDimChange,
  blur = 0,
  onBlurChange,
  textColor,
  onTextColorChange,
  textOpacity = 100,
  onTextOpacityChange,
  chromeOpacity = DEFAULT_CHROME_OPACITY,
  onChromeOpacityChange,
  boxOpacity = DEFAULT_BOX_OPACITY,
  onBoxOpacityChange,
  hoverOpacity = DEFAULT_HOVER_OPACITY,
  onHoverOpacityChange,
  activeOpacity = DEFAULT_ACTIVE_OPACITY,
  onActiveOpacityChange,
  // 衬底颜色（顶栏 / 盒子 / 悬浮 / 高亮 共用）：null = 自动（按字色明暗推导）
  surfaceColor = null,
  onSurfaceColorChange,
  onReset,
  picking,
  error,
  onPickBackground,
  onRemoveBackground
}) {
  const theme = useTheme()
  const mode = theme.palette.mode
  const surfaces = useMemo(() => getSurfaces(mode), [mode])
  // 默认视图在分组编辑器里直接切换，弹窗内的切换只影响预览
  const [previewView, setPreviewView] = useState(view === 'list' ? 'list' : 'grid')
  const contentRef = useRef(null)
  const fadeEdges = useScrollFade(contentRef)
  const previewItems = useMemo(
    () => (group?.items?.length ? group.items.slice(0, 12) : SAMPLE_ITEMS),
    [group?.items]
  )
  const previewGroup = useMemo(() => ({
    ...(group || {}),
    name: (group?.name || '').trim() || '分组名称',
    compactView: previewView,
    backgroundDim: dim,
    backgroundBlur: blur,
    textColor: textColor || DEFAULT_TEXT_COLOR,
    textOpacity,
    chromeOpacity,
    boxOpacity,
    hoverOpacity,
    activeOpacity,
    surfaceColor,
    items: previewItems
  }), [
    group,
    previewView,
    dim,
    blur,
    textColor,
    textOpacity,
    chromeOpacity,
    boxOpacity,
    hoverOpacity,
    activeOpacity,
    surfaceColor,
    previewItems
  ])

  // 自动底色的示意色：浅字配深底、深字配白底，和渲染层同一套判定
  const autoSurface = useMemo(
    () => (foregroundFromColor(textColor || DEFAULT_TEXT_COLOR, textOpacity)?.isLight
      ? '#0c0e12'
      : '#ffffff'),
    [textColor, textOpacity]
  )

  // 全部等于默认值时把重置按钮置灰，省得点了没反应
  const isDefault = dim === DEFAULT_BACKGROUND_DIM &&
    blur === DEFAULT_BACKGROUND_BLUR &&
    String(textColor || DEFAULT_TEXT_COLOR).toLowerCase() === DEFAULT_TEXT_COLOR &&
    textOpacity === DEFAULT_TEXT_OPACITY &&
    chromeOpacity === DEFAULT_CHROME_OPACITY &&
    boxOpacity === DEFAULT_BOX_OPACITY &&
    hoverOpacity === DEFAULT_HOVER_OPACITY &&
    activeOpacity === DEFAULT_ACTIVE_OPACITY &&
    !surfaceColor

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth={false}
      fullWidth
      // 和分组编辑器保持一致：进场快一点，别让人以为点了没反应
      transitionDuration={{ enter: 130, exit: 170 }}
      slotProps={{
        paper: {
          sx: {
            width: 620,
            maxWidth: 'calc(100vw - 40px)',
            maxHeight: 'calc(100vh - 32px)',
            m: 2,
            borderRadius: '20px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }
        }
      }}
    >
      {/* ① 标题区 */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.2,
          px: 2.8,
          pt: 2,
          pb: 0,
          flexShrink: 0
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
            预览
          </Typography>
          <Typography sx={{ mt: 0.4, fontSize: 10.5, lineHeight: 1.45, color: 'text.secondary' }}>
            设置搜索面板的背景、遮罩与文字，改动即时生效。
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={onReset}
          disabled={!onReset || isDefault}
          aria-label="恢复默认外观"
          title="恢复默认外观（保留背景图片）"
          sx={{ flexShrink: 0, color: 'text.secondary' }}
        >
          <RestartAltRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <IconButton
          size="small"
          onClick={onCancel}
          aria-label="关闭"
          sx={{ flexShrink: 0, color: 'text.secondary' }}
        >
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      {/* ② 操作区：预览吃掉剩余高度，控件卡片按内容固定，正常窗口尺寸下不出滚动条 */}
      <DialogContent
        ref={contentRef}
        className="scroll-fade"
        sx={{
          px: 2.8,
          pt: '12px !important',
          pb: 1.8,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.2,
          overflowY: 'auto',
          overflowX: 'hidden',
          ...scrollFadeSx(fadeEdges)
        }}
      >
        <Box
          sx={{
            // 预览占据「剩下的高度」：窗口矮时它先缩，控件和按钮保持原样，正常尺寸不出滚动条
            flex: '1 1 220px',
            minHeight: 160,
            maxHeight: 320,
            width: '100%',
            borderRadius: '14px',
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: mode === 'dark' ? '#17181b' : '#f4f4f5'
          }}
        >
          <ScaledPreview designWidth={PREVIEW_DESIGN_WIDTH}>
            <CompactGroupPanel
              preview
              group={previewGroup}
              groups={groups}
              query=""
              mode={mode}
              surfaces={surfaces}
              backgroundSrc={backgroundSrc || null}
              onLaunch={() => {}}
              onExpand={() => {}}
              onViewChange={setPreviewView}
            />
          </ScaledPreview>
        </Box>

        <Box
          sx={{
            flexShrink: 0,
            p: 1.2,
            borderRadius: '13px',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'action.hover'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box
              sx={{
                position: 'relative',
                width: 56,
                height: 36,
                flexShrink: 0,
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {backgroundSrc
                ? (
                  <>
                    <Box
                      component="img"
                      src={backgroundSrc}
                      alt=""
                      draggable={false}
                      sx={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        filter: blur ? `blur(${Math.round(blur / 2)}px)` : undefined,
                        transform: blur ? 'scale(1.2)' : undefined
                      }}
                    />
                    <Box
                      aria-hidden
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        bgcolor: mode === 'dark'
                          ? `rgba(17, 18, 21, ${dim / 100})`
                          : `rgba(244, 244, 245, ${dim / 100})`
                      }}
                    />
                  </>
                  )
                : <ImageRoundedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>
                背景图片
              </Typography>
              <Typography
                sx={{ mt: 0.2, fontSize: 10, lineHeight: 1.35, color: 'text.secondary' }}
              >
                PNG / JPG / WebP，最大 5MB
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              onClick={onPickBackground}
              disabled={picking}
              startIcon={picking
                ? <CircularProgress size={12} color="inherit" />
                : <ImageRoundedIcon sx={{ fontSize: 15 }} />}
              sx={{ flexShrink: 0, minWidth: 0, px: 1.4, py: 0.4 }}
            >
              {backgroundSrc ? '更换图片' : '选择图片'}
            </Button>
            {backgroundSrc && (
              <IconButton
                size="small"
                onClick={onRemoveBackground}
                disabled={picking}
                aria-label="移除背景图片"
                title="移除背景图片"
                sx={{
                  flexShrink: 0,
                  color: 'error.main',
                  '&:hover': { color: 'error.dark', bgcolor: 'action.hover' }
                }}
              >
                <DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} />
              </IconButton>
            )}
          </Box>

          {backgroundSrc && (
            <Box
              sx={{
                mt: 1,
                pt: 1,
                borderTop: '1px dashed',
                borderColor: 'divider',
                display: 'grid',
                // 纵向优先：先填满左列的「底图 + 文字」，再填右列 ——
                // 右列从「衬底颜色」开始，下面是它的四个浓度
                gridAutoFlow: 'column',
                gridTemplateRows: 'repeat(5, auto)',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                columnGap: 2.4,
                rowGap: 0.8
              }}
            >
              <ControlCell
                label="背景遮罩"
                title="把底图往当前主题的纸色拉：浅色主题提亮，深色主题压暗 · 滚轮微调"
                number={dim}
                min={0}
                max={MAX_BACKGROUND_DIM}
                onNumberChange={onDimChange}
              >
                <WheelSlider
                  min={0}
                  max={MAX_BACKGROUND_DIM}
                  step={5}
                  value={dim}
                  onChange={onDimChange}
                  aria-label="背景遮罩浓度"
                  sx={{ ...smallSliderSx, flex: 1, minWidth: 0 }}
                />
              </ControlCell>

              <ControlCell
                label="背景模糊"
                title="柔化底图细节，字更容易看清 · 滚轮微调"
                number={blur}
                unit="px"
                min={0}
                max={MAX_BACKGROUND_BLUR}
                onNumberChange={onBlurChange}
              >
                <WheelSlider
                  min={0}
                  max={MAX_BACKGROUND_BLUR}
                  step={1}
                  value={blur}
                  onChange={onBlurChange}
                  aria-label="背景模糊半径"
                  sx={{ ...smallSliderSx, flex: 1, minWidth: 0 }}
                />
              </ControlCell>

              <ControlCell label="字体颜色" title="条目标题、路径与提示文字的颜色">
                <TextColorPicker
                  value={textColor || DEFAULT_TEXT_COLOR}
                  onChange={onTextColorChange}
                />
              </ControlCell>

              <ControlCell
                label="字体不透明度"
                title="文字整体的浓度，100% 最实 · 滚轮微调"
                number={textOpacity}
                min={MIN_TEXT_OPACITY}
                max={100}
                onNumberChange={onTextOpacityChange}
              >
                <WheelSlider
                  min={MIN_TEXT_OPACITY}
                  max={100}
                  step={5}
                  value={textOpacity}
                  onChange={onTextOpacityChange}
                  aria-label="字体不透明度"
                  sx={{ ...smallSliderSx, flex: 1, minWidth: 0 }}
                />
              </ControlCell>

              {/* 左列第 5 格空着，把后面那组顶到右列，从第一格开始排 */}
              <Box aria-hidden />

              {/* 衬底颜色 = 右列第一格：先选底色，下面四个浓度就是它的不透明度。
                  控件和「字体颜色」同一套（自动 / 白 / 黑 / 自定义 + 可编辑 #RRGGBB） */}
              <ControlCell
                label="衬底颜色"
                title="顶栏、盒子、悬浮、高亮四种衬底共用的底色；自动 = 跟着字色明暗走，下面四个浓度就是它的不透明度"
              >
                <SurfaceColorPicker
                  value={surfaceColor}
                  autoColor={autoSurface}
                  onChange={onSurfaceColorChange}
                />
              </ControlCell>

              <ControlCell
                label="顶栏浓度"
                title="面板顶部那层渐变遮罩的浓度，0 = 完全透出底图 · 滚轮微调"
                number={chromeOpacity}
                min={0}
                max={100}
                onNumberChange={onChromeOpacityChange}
              >
                <WheelSlider
                  min={0}
                  max={100}
                  step={5}
                  value={chromeOpacity}
                  onChange={onChromeOpacityChange}
                  aria-label="顶栏浓度"
                  sx={{ ...smallSliderSx, flex: 1, minWidth: 0 }}
                />
              </ControlCell>

              <ControlCell
                label="盒子背景浓度"
                title="装了子分组的盒子，背景衬底要多实 · 滚轮微调"
                number={boxOpacity}
                min={0}
                max={100}
                onNumberChange={onBoxOpacityChange}
              >
                <WheelSlider
                  min={0}
                  max={100}
                  step={5}
                  value={boxOpacity}
                  onChange={onBoxOpacityChange}
                  aria-label="盒子背景浓度"
                  sx={{ ...smallSliderSx, flex: 1, minWidth: 0 }}
                />
              </ControlCell>

              <ControlCell
                label="悬浮浓度"
                title="鼠标停在条目上时的衬底浓度 · 滚轮微调"
                number={hoverOpacity}
                min={0}
                max={100}
                onNumberChange={onHoverOpacityChange}
              >
                <WheelSlider
                  min={0}
                  max={100}
                  step={5}
                  value={hoverOpacity}
                  onChange={onHoverOpacityChange}
                  aria-label="悬浮浓度"
                  sx={{ ...smallSliderSx, flex: 1, minWidth: 0 }}
                />
              </ControlCell>

              <ControlCell
                label="高亮浓度"
                title="键盘 / 鼠标选中条目时的衬底浓度 · 滚轮微调"
                number={activeOpacity}
                min={0}
                max={100}
                onNumberChange={onActiveOpacityChange}
              >
                <WheelSlider
                  min={0}
                  max={100}
                  step={5}
                  value={activeOpacity}
                  onChange={onActiveOpacityChange}
                  aria-label="高亮浓度"
                  sx={{ ...smallSliderSx, flex: 1, minWidth: 0 }}
                />
              </ControlCell>

            </Box>
          )}
        </Box>

        {error && (
          <Alert
            severity="error"
            variant="outlined"
            sx={{ flexShrink: 0, py: 0.2, fontSize: 11.5 }}
          >
            {error}
          </Alert>
        )}
      </DialogContent>

      {/* ③ 操作按钮区 */}
      <DialogActions
        sx={{
          px: 2.8,
          py: 1.8,
          borderTop: '1px solid',
          borderColor: 'divider',
          flexShrink: 0
        }}
      >
        <Button onClick={onCancel} sx={{ color: 'text.secondary' }}>
          取消
        </Button>
        <Button variant="contained" onClick={onComplete} sx={{ minWidth: 92 }}>
          完成
        </Button>
      </DialogActions>
    </Dialog>
  )
}
