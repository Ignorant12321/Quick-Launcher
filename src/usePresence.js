import { useEffect, useRef, useState } from 'react'

export function usePresence (open, duration = 220, resetKey = true) {
  const [mounted, setMounted] = useState(Boolean(open))
  const [visible, setVisible] = useState(Boolean(open))
  const timerRef = useRef(null)

  useEffect(() => {
    if (resetKey === false) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setMounted(false)
      setVisible(false)
      return
    }

    if (open) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setMounted(true)
      setVisible(true)
      return
    }

    if (!mounted) return
    setVisible(false)
    if (timerRef.current) return
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setMounted(false)
    }, duration)
  }, [open, mounted, duration, resetKey])

  useEffect(() => () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return { mounted, open: visible }
}

export function useRetainedValue (value) {
  const lastValueRef = useRef(value)

  useEffect(() => {
    if (value != null) lastValueRef.current = value
  }, [value])

  return value != null ? value : lastValueRef.current
}
