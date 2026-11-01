import { useEffect, useRef, useState } from 'react'

// 1px 容差：滚动位置在设备像素上会有小数，太紧会在贴边时来回切换
const OVERFLOW_TOLERANCE = 1
const DEFAULT_FADE = 18

/**
 * 判断滚动区上下两个方向各自「还有没有内容没看」，用来驱动边缘渐隐。
 *
 * 用法：
 *   const ref = useRef(null)
 *   const edges = useScrollFade(ref)
 *   <Box ref={ref} className="scroll-fade" sx={scrollFadeSx(edges)}>…</Box>
 *
 * 三个细节：
 * - 对话框里的滚动区是「打开时才挂载」的，挂载时 ref 才有值，所以每次渲染后同步一次节点；
 * - 内容高度变化不一定改变容器自身尺寸（DialogContent 就是典型），
 *   所以除了容器本身，还监听它的子元素尺寸与子结构变化；
 * - 只在该方向真的有溢出时才把渐隐撑开，不滚动时不会压暗首行 / 末行。
 */
export function useScrollFade (ref) {
  const [edges, setEdges] = useState({ top: false, bottom: false })
  const lastRef = useRef({ top: false, bottom: false })
  const [node, setNode] = useState(null)

  // 没有依赖数组：每次渲染后确认一次节点，对话框开 / 关时能重新绑定
  useEffect(() => {
    const next = ref.current || null
    if (next !== node) setNode(next)
  })

  useEffect(() => {
    if (!node) return undefined
    let raf = 0

    const measure = () => {
      raf = 0
      // 节点已被卸载（例如对话框关闭进入退场动画）时 scrollHeight 归零，跳过以免误判
      if (!node.isConnected) return
      const top = node.scrollTop > OVERFLOW_TOLERANCE
      const bottom = node.scrollHeight - node.scrollTop - node.clientHeight > OVERFLOW_TOLERANCE
      if (lastRef.current.top === top && lastRef.current.bottom === bottom) return
      lastRef.current = { top, bottom }
      setEdges({ top, bottom })
    }

    const schedule = () => {
      if (raf) return
      raf = window.requestAnimationFrame(measure)
    }

    // 换节点（换视图 / 重新打开对话框）时从头算
    lastRef.current = { top: false, bottom: false }
    setEdges({ top: false, bottom: false })
    schedule()

    node.addEventListener('scroll', schedule, { passive: true })

    const resize = new ResizeObserver(schedule)
    const observedChildren = new Set()
    resize.observe(node)
    const syncObserved = () => {
      const children = new Set(node.children)
      observedChildren.forEach((child) => {
        if (children.has(child)) return
        resize.unobserve(child)
        observedChildren.delete(child)
      })
      children.forEach((child) => {
        if (observedChildren.has(child)) return
        resize.observe(child)
        observedChildren.add(child)
      })
    }
    syncObserved()

    const mutation = new MutationObserver((records) => {
      if (records.some((record) => record.target === node)) syncObserved()
      schedule()
    })
    mutation.observe(node, { childList: true, subtree: true })

    window.addEventListener('resize', schedule)
    return () => {
      node.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      resize.disconnect()
      mutation.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [node])

  return edges
}

/** 把 useScrollFade 的结果转成 sx 里的两个 CSS 变量（配合 main.css 的 .scroll-fade） */
export function scrollFadeSx (edges, size = DEFAULT_FADE) {
  return {
    '--ql-fade-top': edges.top ? `${size}px` : '0px',
    '--ql-fade-bottom': edges.bottom ? `${size}px` : '0px'
  }
}
