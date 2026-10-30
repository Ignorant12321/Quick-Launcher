import { useMemo, useRef } from 'react'

// 稳定回调分发器：对外永远返回同一组函数，调用时才去取「最新实现」。
//
// 卡片 / 格子做了 memo，props 里只要有一个函数引用变了，整屏都会重画；
// 而这些实现每次渲染都会重建（依赖选中态、拖拽态、父组件传下来的 props），
// 所以不能把实现本身直接当 props 传下去。
//
// 用法：把「这一帧的实现」放进对象传进来，拿到的函数引用永远不变。
export default function useStableHandlers (impl) {
  const latest = useRef(impl)
  // 渲染期赋值是这里的关键：事件一定发生在渲染提交之后，拿到的总是最新实现
  latest.current = impl
  return useMemo(() => {
    const stable = {}
    for (const key of Object.keys(impl)) {
      stable[key] = (...args) => latest.current[key]?.(...args)
    }
    return stable
  }, [])
}
