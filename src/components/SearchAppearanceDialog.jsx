import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import CompactGroupPanel from './CompactGroupPanel'
import { getSurfaces } from '../theme'
import { useScrollFade, scrollFadeSx } from '../useScrollFade'
import { ITEM_TYPES, MAX_BACKGROUND_DIM } from '../data'

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

// 字色预设：null = 自动跟随底图明暗，其余按分组记忆
const TEXT_PRESETS = [
  { value: null, label: '自动', swatch: null },
  { value: '#ffffff', label: '白色', swatch: '#ffffff' },
  { value: '#111827', label: '黑色', swatch: '#111827' }
]

// 自定义取色器里的常用色：黑白灰阶 + 压在照片上也够醒目的浅彩
const SWATCH_COLORS = [
  '#ffffff', '#f1f5f9', '#cbd5e1', '#94a3b8', '#475569', '#0f172a',
  '#fef08a', '#fcd34d', '#fda4af', '#f9a8d4', '#93c5fd', '#6ee7b7'
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

// 操作区里的一行「标签 + 控件 + 右侧数值」，行与行之间用虚线分开
function ControlRow ({ label, title, value, children }) {
  return (
    <Box
      sx={{
        mt: 1.1,
        pt: 1.1,
        borderTop: '1px dashed',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1.2
      }}
    >
      <Typography
        title={title}
        sx={{
          width: 52,
          flexShrink: 0,
          fontSize: 10.5,
          color: 'text.secondary',
          whiteSpace: 'nowrap'
        }}
      >
        {label}
      </Typography>
      {children}
      {value != null && (
        <Typography
          sx={{
            width: 42,
            flexShrink: 0,
            fontSize: 10.5,
            color: 'text.secondary',
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {value}
        </Typography>
      )}
    </Box>
  )
}

// 字体颜色：自动 / 白 / 黑，加上自定义颜色。
// 自定义走弹窗内的小色板，不用原生 input[color]——那个会打开系统颜色对话框，
// 位置由系统决定、会跑到弹窗外侧
function TextColorPicker ({ value, onChange }) {
  const [anchor, setAnchor] = useState(null)
  const [draft, setDraft] = useState('#FFFFFF')
  const isCustom = Boolean(value) && !TEXT_PRESETS.some((preset) => preset.value === value)
  const current = TEXT_PRESETS.find((preset) => preset.value === value)

  const openPicker = (event) => {
    setDraft(String(value || '#ffffff').toUpperCase())
    setAnchor(event.currentTarget)
  }
  const closePicker = () => setAnchor(null)
  const commit = (next) => {
    const normalized = normalizeHexInput(next)
    if (!normalized) return false
    onChange(normalized)
    setDraft(normalized.toUpperCase())
    return true
  }

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
    '&:focus-visible': {
      outline: '2px solid',
      outlineColor: 'primary.main',
      outlineOffset: 1
    }
  })

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flex: 1, minWidth: 0 }}>
      {TEXT_PRESETS.map((preset) => {
        const selected = preset.value === value
        if (!preset.swatch) {
          return (
            <Box
              key="auto"
              component="button"
              type="button"
              title="自动跟随底图明暗"
              aria-pressed={selected}
              onClick={() => onChange(null)}
              sx={{
                ...chip(selected),
                height: 24,
                px: 1,
                fontSize: 10.5,
                fontWeight: 550,
                color: selected ? 'primary.main' : 'text.secondary',
                bgcolor: selected ? 'action.selected' : 'background.paper'
              }}
            >
              自动
            </Box>
          )
        }
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
      <Box
        component="button"
        type="button"
        title="自定义颜色"
        aria-label="自定义颜色"
        aria-pressed={isCustom}
        aria-haspopup="dialog"
        onClick={openPicker}
        sx={{ ...chip(isCustom || Boolean(anchor)), width: 24, height: 24 }}
      >
        <Box
          aria-hidden
          sx={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: isCustom ? value : CUSTOM_SWATCH,
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
      </Box>

      {/* 色板挂在按钮上方（悬浮在预览上），不压住下面的设置行；出界时 MUI 会自动翻转 */}
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={closePicker}
        marginThreshold={12}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mb: 0.8, p: 1.1, width: 178, borderRadius: '12px' } } }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '5px' }}>
          {SWATCH_COLORS.map((color) => (
            <Box
              key={color}
              component="button"
              type="button"
              title={color.toUpperCase()}
              aria-label={color.toUpperCase()}
              onClick={() => {
                commit(color)
                closePicker()
              }}
              sx={{
                width: '100%',
                aspectRatio: '1 / 1',
                p: 0,
                borderRadius: '5px',
                border: '1px solid',
                borderColor: 'rgba(0, 0, 0, 0.14)',
                bgcolor: color,
                cursor: 'pointer',
                transition: 'transform 90ms ease',
                '&:hover': { transform: 'scale(1.08)' }
              }}
            />
          ))}
        </Box>

        <Box
          sx={{
            mt: 1,
            pt: 1,
            borderTop: '1px dashed',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 0.6
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 20,
              height: 20,
              flexShrink: 0,
              borderRadius: '6px',
              border: '1px solid rgba(0, 0, 0, 0.14)',
              bgcolor: normalizeHexInput(draft) || '#ffffff'
            }}
          />
          <Box
            component="input"
            value={draft}
            spellCheck={false}
            aria-label="十六进制颜色"
            onChange={(event) => setDraft(event.target.value.toUpperCase())}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (commit(draft)) closePicker()
              }
            }}
            sx={{
              flex: 1,
              minWidth: 0,
              height: 24,
              px: 0.7,
              fontSize: 10.5,
              fontFamily: 'inherit',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
              borderRadius: '6px',
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              color: 'text.primary',
              outline: 'none',
              '&:focus': { borderColor: 'primary.main' }
            }}
          />
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              if (commit(draft)) closePicker()
            }}
            sx={{ minWidth: 0, px: 1, py: 0.1, fontSize: 10.5 }}
          >
            应用
          </Button>
        </Box>
      </Popover>

      <Typography
        sx={{
          ml: 'auto',
          flexShrink: 0,
          fontSize: 10.5,
          color: 'text.secondary',
          fontVariantNumeric: 'tabular-nums',
          pl: 0.6
        }}
      >
        {isCustom ? String(value).toUpperCase() : (current?.label || '自动')}
      </Typography>
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
// 顶部标题 → 中间操作区（预览 + 背景 / 遮罩 / 文字控件）→ 底部取消与保存
export default function SearchAppearanceDialog ({
  open,
  onCancel,
  onComplete,
  group,
  view,
  backgroundSrc,
  dim,
  onDimChange,
  textColor,
  onTextColorChange,
  textOpacity,
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
    textColor: textColor || null,
    textOpacity,
    items: previewItems
  }), [group, previewView, dim, textColor, textOpacity, previewItems])

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
            设置搜索面板的背景与遮罩，改动即时生效。
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={onCancel}
          aria-label="关闭"
          sx={{ flexShrink: 0, color: 'text.secondary' }}
        >
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      {/* ② 操作区：内容超出时滚动，上下边缘渐隐 */}
      <DialogContent
        ref={contentRef}
        className="scroll-fade"
        sx={{
          px: 2.8,
          pt: '14px !important',
          pb: 2.2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          overflowY: 'auto',
          overflowX: 'hidden',
          ...scrollFadeSx(fadeEdges)
        }}
      >
        <Box
          sx={{
            // 预览跟着窗口高度伸缩，保证整个弹窗永远不出滚动条
            height: 'clamp(200px, calc(100vh - 336px), 356px)',
            flexShrink: 0,
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
            p: 1.4,
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
                      sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
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
            <>
              <ControlRow
                label="遮罩"
                title="压暗 / 提亮底图，保证条目可读"
                value={`${dim}%`}
              >
                <Slider
                  size="small"
                  min={0}
                  max={MAX_BACKGROUND_DIM}
                  step={5}
                  value={dim}
                  onChange={(_event, value) => onDimChange(value)}
                  aria-label="背景遮罩浓度"
                  sx={{ ...smallSliderSx, flex: 1 }}
                />
              </ControlRow>

              <ControlRow label="字体颜色" title="条目标题、路径与提示条的颜色">
                <TextColorPicker value={textColor || null} onChange={onTextColorChange} />
              </ControlRow>
            </>
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
