import React, { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import WheelSlider from './WheelSlider'
import { MAX_ICON_RADIUS } from '../data'

const FRAME = 240
const OUTPUT_SIZE = 512
const MAX_ZOOM = 3
const MAX_ROTATION = 180

function clampOffset (x, y, width, height) {
  return {
    x: Math.min(0, Math.max(FRAME - width, x)),
    y: Math.min(0, Math.max(FRAME - height, y))
  }
}

function zoomViewAt (view, meta, baseScale, nextZoom, anchorX, anchorY) {
  if (!meta) return view
  const zoom = Math.min(MAX_ZOOM, Math.max(1, nextZoom))
  if (Math.abs(zoom - view.zoom) < 0.0001) return view

  const previousScale = baseScale * view.zoom
  const imageX = (anchorX - view.offset.x) / previousScale
  const imageY = (anchorY - view.offset.y) / previousScale
  const nextScale = baseScale * zoom
  const nextWidth = meta.width * nextScale
  const nextHeight = meta.height * nextScale

  return {
    zoom,
    offset: clampOffset(
      anchorX - imageX * nextScale,
      anchorY - imageY * nextScale,
      nextWidth,
      nextHeight
    )
  }
}

function ValueInput ({ value, min, max, disabled, ariaLabel, unit = '%', onCommit }) {
  const signed = min < 0
  const [text, setText] = useState(String(value))
  const focusedRef = useRef(false)
  const skipCommitRef = useRef(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!focusedRef.current) setText(String(value))
  }, [value])

  const commit = () => {
    const parsed = Number.parseInt(text, 10)
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value
    setText(String(next))
    if (next !== value) onCommit(next)
  }

  // React 的 onWheel 是 passive 的，无法阻止页面滚动，这里用原生监听
  useEffect(() => {
    const node = inputRef.current
    if (!node) return undefined
    const handleWheel = (event) => {
      if (node.disabled || !focusedRef.current || !event.deltaY) return
      event.preventDefault()
      const parsed = Number.parseInt(text, 10)
      const base = Number.isFinite(parsed) ? parsed : value
      const next = Math.min(max, Math.max(min, base + (event.deltaY < 0 ? 1 : -1)))
      setText(String(next))
      if (next !== value) onCommit(next)
    }
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [text, value, min, max, onCommit])

  return (
    <Box sx={{ position: 'relative', width: 54, flexShrink: 0 }}>
      <Box
        ref={inputRef}
        component="input"
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        value={text}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value
          if (!signed) {
            setText(raw.replace(/[^\d]/g, '').slice(0, 3))
            return
          }
          // 负角度：只允许开头那一个减号
          const sign = raw.trimStart().startsWith('-') ? '-' : ''
          const digits = raw.replace(/[^\d]/g, '').slice(0, 3)
          setText(`${sign}${digits}`)
        }}
        onFocus={(event) => {
          focusedRef.current = true
          event.target.select()
        }}
        onBlur={() => {
          focusedRef.current = false
          if (skipCommitRef.current) {
            skipCommitRef.current = false
            setText(String(value))
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
          width: '100%',
          height: 26,
          boxSizing: 'border-box',
          pl: '7px',
          pr: '17px',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '7px',
          bgcolor: 'transparent',
          color: 'text.secondary',
          fontFamily: 'inherit',
          fontSize: 10.5,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          outline: 'none',
          transition: 'border-color 120ms ease, color 120ms ease',
          '&:hover': { borderColor: 'text.disabled' },
          '&:focus': { borderColor: 'primary.main', color: 'text.primary' },
          '&:disabled': { opacity: 0.5, cursor: 'not-allowed' }
        }}
      />
      <Box
        component="span"
        aria-hidden
        sx={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 9.5,
          color: 'text.secondary',
          pointerEvents: 'none'
        }}
      >
        {unit}
      </Box>
    </Box>
  )
}

export default function IconCropDialog ({
  open,
  source,
  radius = 0,
  onRadiusChange,
  onCancel,
  onConfirm
}) {
  const [meta, setMeta] = useState(null)
  const [view, setView] = useState({ zoom: 1, offset: { x: 0, y: 0 } })
  // 旋转直接烘焙进导出的图片，所以只留在弹窗里，不跟着数据走
  const [rotation, setRotation] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [localSource, setLocalSource] = useState(source || '')
  const [picking, setPicking] = useState(false)
  const dragRef = useRef(null)
  const imageRef = useRef(null)
  const frameRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setMeta(null)
    setView({ zoom: 1, offset: { x: 0, y: 0 } })
    setRotation(0)
    setDragging(false)
    setLocalSource(source || '')
    setPicking(false)
    dragRef.current = null
  }, [open, source])

  const { zoom, offset } = view
  const baseScale = meta ? FRAME / Math.min(meta.width, meta.height) : 1
  const scale = baseScale * zoom
  const width = meta ? meta.width * scale : FRAME
  const height = meta ? meta.height * scale : FRAME
  const frameRadius = `${Math.min(MAX_ICON_RADIUS, Math.max(0, Number(radius) || 0))}%`

  const handleLoad = (event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget
    if (!naturalWidth || !naturalHeight) return
    const nextScale = FRAME / Math.min(naturalWidth, naturalHeight)
    const nextWidth = naturalWidth * nextScale
    const nextHeight = naturalHeight * nextScale
    setMeta({ width: naturalWidth, height: naturalHeight })
    setView({
      zoom: 1,
      offset: { x: (FRAME - nextWidth) / 2, y: (FRAME - nextHeight) / 2 }
    })
  }

  const handleChangeImage = async () => {
    if (picking) return
    setPicking(true)
    try {
      const result = await window.services?.selectCustomIcon?.('选择图片')
      if (result?.ok && result.dataUrl) {
        setLocalSource(result.dataUrl)
        setMeta(null)
        setView({ zoom: 1, offset: { x: 0, y: 0 } })
        setRotation(0)
        setDragging(false)
        dragRef.current = null
      }
    } finally {
      setPicking(false)
    }
  }

  const applyZoomAt = (nextZoom, anchorX, anchorY) => {
    setView((current) => zoomViewAt(current, meta, baseScale, nextZoom, anchorX, anchorY))
  }

  const applyZoom = (nextZoom) => {
    applyZoomAt(nextZoom, FRAME / 2, FRAME / 2)
  }

  useEffect(() => {
    if (!open) return undefined
    const frame = frameRef.current
    if (!frame) return undefined

    const handleWheel = (event) => {
      if (!meta || !event.deltaY) return
      event.preventDefault()
      const rect = frame.getBoundingClientRect()
      const scaleFactor = Math.exp(-event.deltaY * 0.0015)
      const anchorX = event.clientX - rect.left
      const anchorY = event.clientY - rect.top
      setView((current) => zoomViewAt(
        current,
        meta,
        baseScale,
        current.zoom * scaleFactor,
        anchorX,
        anchorY
      ))
    }

    frame.addEventListener('wheel', handleWheel, { passive: false })
    return () => frame.removeEventListener('wheel', handleWheel)
  }, [open, meta, baseScale])

  const handlePointerDown = (event) => {
    if (!meta) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y
    }
    setDragging(true)
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !meta) return
    setView((current) => {
      const nextScale = baseScale * current.zoom
      return {
        ...current,
        offset: clampOffset(
          drag.originX + event.clientX - drag.startX,
          drag.originY + event.clientY - drag.startY,
          meta.width * nextScale,
          meta.height * nextScale
        )
      }
    })
  }

  const endDrag = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
      setDragging(false)
    }
  }

  const handleConfirm = () => {
    const image = imageRef.current
    if (!image || !meta) return
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const context = canvas.getContext('2d')
    if (!context) return
    const ratio = OUTPUT_SIZE / FRAME
    const half = OUTPUT_SIZE / 2
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    if (rotation) {
      // 先挪到画布中心转，再把图片按「相对中心」的坐标画回去
      context.save()
      context.translate(half, half)
      context.rotate((rotation * Math.PI) / 180)
      context.drawImage(
        image,
        offset.x * ratio - half,
        offset.y * ratio - half,
        width * ratio,
        height * ratio
      )
      context.restore()
    } else {
      context.drawImage(
        image,
        offset.x * ratio,
        offset.y * ratio,
        width * ratio,
        height * ratio
      )
    }
    onConfirm(canvas.toDataURL('image/png'))
  }

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            width: 320,
            maxWidth: 'calc(100vw - 24px)',
            borderRadius: '16px'
          }
        }
      }}
    >
      <DialogTitle sx={{ px: 2, pt: 1.6, pb: 0.8, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ flex: 1, fontSize: 14.5, fontWeight: 700 }}>
          自定义图标
        </Typography>
        <IconButton size="small" onClick={onCancel} aria-label="关闭">
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 2, pt: '4px !important', pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Box
            ref={frameRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            sx={{
              position: 'relative',
              width: FRAME,
              height: FRAME,
              overflow: 'hidden',
              borderRadius: frameRadius,
              transition: 'border-radius 120ms ease',
              bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#101114' : '#eef1f4'),
              border: '1px solid',
              borderColor: 'divider',
              cursor: dragging ? 'grabbing' : 'grab',
              touchAction: 'none',
              userSelect: 'none',
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                backgroundImage: [
                  'linear-gradient(to right, rgba(255,255,255,0.20) 1px, transparent 1px)',
                  'linear-gradient(to bottom, rgba(255,255,255,0.20) 1px, transparent 1px)'
                ].join(','),
                backgroundSize: '33.333% 33.333%'
              }
            }}
          >
            {localSource && (
              <Box
                component="img"
                ref={imageRef}
                src={localSource}
                alt=""
                draggable={false}
                onLoad={handleLoad}
                sx={{
                  position: 'absolute',
                  left: offset.x,
                  top: offset.y,
                  width,
                  height,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  display: 'block',
                  pointerEvents: 'none',
                  // 绕画框中心转，和导出时的画布旋转保持一致
                  transform: rotation ? `rotate(${rotation}deg)` : 'none',
                  transformOrigin: `${FRAME / 2 - offset.x}px ${FRAME / 2 - offset.y}px`
                }}
              />
            )}
            {!localSource && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none'
                }}
              >
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                  还没有选择图片
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        <Box sx={{ mt: 1.4, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 56, flexShrink: 0 }}>
            <Typography sx={{ fontSize: 10.5, lineHeight: 1.25, color: 'text.secondary' }}>
              缩放
            </Typography>
            <Typography sx={{ fontSize: 9, lineHeight: 1.2, color: 'text.secondary', opacity: 0.78 }}>
              100%~300%
            </Typography>
          </Box>
          <WheelSlider
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            // 一格 5%，既有「微调」的手感，又不至于滚半天才放大一点
            wheelStep={0.05}
            value={zoom}
            onChange={applyZoom}
            aria-label="缩放"
            disabled={!meta}
            sx={{ flex: 1 }}
          />
          <ValueInput
            value={Math.round(zoom * 100)}
            min={100}
            max={Math.round(MAX_ZOOM * 100)}
            disabled={!meta}
            ariaLabel="缩放百分比"
            onCommit={(percent) => applyZoom(percent / 100)}
          />
        </Box>

        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 56, flexShrink: 0 }}>
            <Typography sx={{ fontSize: 10.5, lineHeight: 1.25, color: 'text.secondary' }}>
              旋转
            </Typography>
            <Typography sx={{ fontSize: 9, lineHeight: 1.2, color: 'text.secondary', opacity: 0.78 }}>
              -{MAX_ROTATION}~{MAX_ROTATION}°
            </Typography>
          </Box>
          <WheelSlider
            min={-MAX_ROTATION}
            max={MAX_ROTATION}
            step={1}
            // 滚轮一格 5°，拖滑杆还是一度一度地走
            wheelStep={5}
            value={rotation}
            onChange={setRotation}
            aria-label="旋转"
            disabled={!meta}
            sx={{ flex: 1 }}
          />
          <ValueInput
            value={Math.round(rotation)}
            min={-MAX_ROTATION}
            max={MAX_ROTATION}
            disabled={!meta}
            ariaLabel="旋转角度"
            unit="°"
            onCommit={setRotation}
          />
        </Box>

        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 56, flexShrink: 0 }}>
            <Typography sx={{ fontSize: 10.5, lineHeight: 1.25, color: 'text.secondary' }}>
              圆角
            </Typography>
            <Typography sx={{ fontSize: 9, lineHeight: 1.2, color: 'text.secondary', opacity: 0.78 }}>
              0~{MAX_ICON_RADIUS}%
            </Typography>
          </Box>
          <WheelSlider
            min={0}
            max={MAX_ICON_RADIUS}
            step={1}
            value={Math.min(MAX_ICON_RADIUS, Math.max(0, Number(radius) || 0))}
            onChange={(value) => onRadiusChange?.(value)}
            aria-label="圆角"
            disabled={!onRadiusChange}
          />
          <ValueInput
            value={Math.round(Math.min(MAX_ICON_RADIUS, Math.max(0, Number(radius) || 0)))}
            min={0}
            max={MAX_ICON_RADIUS}
            disabled={!onRadiusChange}
            ariaLabel="圆角百分比"
            onCommit={(percent) => onRadiusChange?.(percent)}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 1.6 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={picking
            ? <CircularProgress size={14} color="inherit" />
            : <ImageRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={handleChangeImage}
          disabled={picking}
          sx={{ mr: 'auto' }}
        >
          更改图片
        </Button>
        <Button size="small" onClick={onCancel} sx={{ color: 'text.secondary' }}>
          取消
        </Button>
        <Button size="small" variant="contained" onClick={handleConfirm} disabled={!meta || picking}>
          使用此图标
        </Button>
      </DialogActions>
    </Dialog>
  )
}
