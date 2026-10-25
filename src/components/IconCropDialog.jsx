import React, { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded'
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded'

const FRAME = 240
const OUTPUT_SIZE = 512
const MAX_ZOOM = 3

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

export default function IconCropDialog ({ open, source, onCancel, onConfirm }) {
  const [meta, setMeta] = useState(null)
  const [view, setView] = useState({ zoom: 1, offset: { x: 0, y: 0 } })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)
  const imageRef = useRef(null)
  const frameRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setMeta(null)
    setView({ zoom: 1, offset: { x: 0, y: 0 } })
    setDragging(false)
    dragRef.current = null
  }, [open, source])

  const { zoom, offset } = view
  const baseScale = meta ? FRAME / Math.min(meta.width, meta.height) : 1
  const scale = baseScale * zoom
  const width = meta ? meta.width * scale : FRAME
  const height = meta ? meta.height * scale : FRAME

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
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      image,
      offset.x * ratio,
      offset.y * ratio,
      width * ratio,
      height * ratio
    )
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
      <DialogTitle sx={{ px: 2, pt: 1.6, pb: 0.8, fontSize: 14.5, fontWeight: 700 }}>
        裁剪图标
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
              borderRadius: '14px',
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
            {source && (
              <Box
                component="img"
                ref={imageRef}
                src={source}
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
                  pointerEvents: 'none'
                }}
              />
            )}
          </Box>
        </Box>

        <Box sx={{ mt: 1.4, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ZoomOutRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Slider
            size="small"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(_event, value) => applyZoom(value)}
            aria-label="缩放"
            disabled={!meta}
          />
          <ZoomInRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography
            sx={{
              width: 38,
              flexShrink: 0,
              fontSize: 10.5,
              color: 'text.secondary',
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {Math.round(zoom * 100)}%
          </Typography>
        </Box>
        <Typography sx={{ mt: 0.7, fontSize: 10.5, color: 'text.secondary', textAlign: 'center' }}>
          滚轮缩放 · 拖动调整位置
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 1.6 }}>
        <Button size="small" onClick={onCancel} sx={{ color: 'text.secondary' }}>
          取消
        </Button>
        <Button size="small" variant="contained" onClick={handleConfirm} disabled={!meta}>
          使用此图标
        </Button>
      </DialogActions>
    </Dialog>
  )
}
