import React, { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'

// 滑杆右边那个数值：平时就是一行小字（渲染成「10%」这种连着的文本，和标签字重字号完全一致），
// 点一下才变成一个输入框 —— 这样静止状态下不会因为「数字 + 单位」被拆成两个元素而出现缝隙
// 回车 / 失焦提交，Esc 放弃，上下键 ±1；鼠标停在这行字上滚轮也能加减
export default function ValueField ({
  value,
  min = 0,
  max = 100,
  unit = '%',
  width = 38,
  ariaLabel,
  title = '点击可直接输入数值',
  onCommit
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(String(value))
  const inputRef = useRef(null)
  const wrapperRef = useRef(null)
  const skipCommitRef = useRef(false)
  // 事件回调里要读到最新值，但又不想为它们重建监听
  const latest = useRef({ text, value, min, max, onCommit })
  latest.current = { text, value, min, max, onCommit }

  const clamp = (number) => Math.min(max, Math.max(min, number))

  // 外部值变了（拖滑杆、点重置）就同步；正在输入时不打扰
  useEffect(() => {
    if (!editing) setText(String(value))
  }, [value, editing])

  useEffect(() => {
    if (!editing) return
    const node = inputRef.current
    if (!node) return
    node.focus()
    node.select()
  }, [editing])

  const commit = () => {
    const parsed = Number.parseInt(text, 10)
    const next = Number.isFinite(parsed) ? clamp(parsed) : value
    setText(String(next))
    setEditing(false)
    if (next !== value) onCommit(next)
  }

  // 滚轮：React 的 onWheel 是 passive，拦不住页面滚动，所以用原生监听
  useEffect(() => {
    const node = wrapperRef.current
    if (!node) return undefined
    const handleWheel = (event) => {
      const state = latest.current
      if (!event.deltaY) return
      event.preventDefault()
      const parsed = Number.parseInt(state.text, 10)
      const base = Number.isFinite(parsed) ? clamp(parsed) : state.value
      const next = clamp(base + (event.deltaY < 0 ? 1 : -1))
      setText(String(next))
      if (next !== state.value) state.onCommit(next)
    }
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <Box
      ref={wrapperRef}
      title={title}
      onClick={() => {
        if (!editing) setEditing(true)
      }}
      sx={{
        width,
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
        cursor: 'text',
        transition: 'border-color 120ms ease, background-color 120ms ease',
        '&:hover': { borderColor: 'divider', bgcolor: 'action.hover' },
        ...(editing ? { borderColor: 'primary.main', bgcolor: 'background.paper' } : {})
      }}
    >
      {editing
        ? (
          <>
            <Box
              ref={inputRef}
              component="input"
              type="text"
              inputMode="numeric"
              aria-label={ariaLabel}
              value={text}
              onChange={(event) => setText(event.target.value.replace(/[^\d]/g, '').slice(0, 3))}
              onBlur={() => {
                if (skipCommitRef.current) {
                  skipCommitRef.current = false
                  setText(String(value))
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
                  return
                }
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  const parsed = Number.parseInt(text, 10)
                  const base = Number.isFinite(parsed) ? clamp(parsed) : value
                  const next = clamp(base + (event.key === 'ArrowUp' ? 1 : -1))
                  setText(String(next))
                  if (next !== value) onCommit(next)
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
                fontVariantNumeric: 'tabular-nums'
              }}
            />
            {/* 输入时把单位留在旁边，免得「40」到底指百分比还是像素全靠记忆 */}
            <Box
              component="span"
              aria-hidden
              sx={{ flexShrink: 0, pl: '1px', fontSize: 9.5, color: 'text.secondary', pointerEvents: 'none' }}
            >
              {unit}
            </Box>
          </>
          )
        : `${value}${unit}`}
    </Box>
  )
}
