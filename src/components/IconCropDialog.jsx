import React, { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Slider from '@mui/material/Slider'
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

export default function IconCropDialog ({ open, source, onCancel, onConfirm }) {
  const [meta, setMeta] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)
  const imageRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setMeta(null)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setDragging(false)
    dragRef.current = null
  }, [open, source])

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
    setZoom(1)
    setOffset({ x: (FRAME - nextWidth) / 2, y: (FRAME - nextHeight) / 2 })
  }

  const applyZoom = (nextZoom) => {
    if (!meta) return
    const previousScale = baseScale * zoom
    const centerX = (FRAME / 2 - offset.x) / previousScale
    const centerY = (FRAME / 2 - offset.y) / previousScale
    const nextScale = baseScale * nextZoom
    const nextWidth = meta.width * nextScale
    const nextHeight = meta.height * nextScale
    setZoom(nextZoom)
    setOffset(clampOffset(
      FRAME / 2 - centerX * nextScale,
      FRAME / 2 - centerY * nextScale,
      nextWidth,
      nextHeight
    ))
  }

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
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset(clampOffset(
      drag.originX + event.clientX - drag.startX,
      drag.originY + event.clientY - drag.startY,
      width,
      height
    ))
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
        </Box>
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
