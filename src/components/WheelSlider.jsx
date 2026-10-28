import { useEffect, useRef } from 'react'
import Slider from '@mui/material/Slider'

// 按 step 对齐的取整：min 不一定是 0（比如文字不透明度从 40 起、步长 5），
// 所以按「离 min 多少个 step」来算，而不是直接除 step
function snap (value, min, max, step) {
  if (!step) return Math.min(max, Math.max(min, value))
  const steps = Math.round((value - min) / step)
  const next = min + steps * step
  // 浮点步长（缩放用的 0.01）算完会留下 1.2300000000000002 这种尾巴，按 step 的小数位收一下
  const decimals = Math.min(6, (String(step).split('.')[1] || '').length)
  return Math.min(max, Math.max(min, Number(next.toFixed(decimals))))
}

// 支持滚轮微调的滑杆：指针停在滑杆上滚动滚轮，按 step 加减一档。
// 用原生监听而不是 onWheel —— React 把 wheel 注册成 passive 监听，里面 preventDefault 会被忽略，
// 结果是滑杆动了、外层容器也跟着滚一段，手感很糟
export default function WheelSlider ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  // 滚轮一次走多少：默认跟 step 一致，缩放这种 0.01 步长的可以单独调大一点
  wheelStep = step,
  ...rest
}) {
  const rootRef = useRef(null)
  // 参数放 ref 里，wheel 监听只注册一次，不用每次改值都解绑重绑
  const latest = useRef({ value, onChange, min, max, step: wheelStep })
  latest.current = { value, onChange, min, max, step: wheelStep }
  // 触控板一滑就是一串 wheel 事件，React 还没来得及重渲染就已经全发出去了。
  // 这串事件里后面的都读到同一个旧 value，结果滚十格只走一格 —— 所以自己记一个「串内基准」
  const burst = useRef({ value: null, timer: 0 })

  useEffect(() => {
    const node = rootRef.current
    if (!node) return undefined
    const handleWheel = (event) => {
      const state = latest.current
      if (!Number.isFinite(state.value) || !event.deltaY) return
      // 接管这一刻的滚动，否则调完滑杆页面还会跟着跳
      event.preventDefault()
      const base = burst.current.value ?? state.value
      const next = snap(base + (event.deltaY > 0 ? -state.step : state.step),
        state.min, state.max, state.step)
      burst.current.value = next
      clearTimeout(burst.current.timer)
      // 停手 300ms 就把基准交还给外部 value，免得手动拖动之后还接着旧基准算
      burst.current.timer = setTimeout(() => { burst.current.value = null }, 300)
      if (next !== state.value) state.onChange(next)
    }
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <Slider
      ref={rootRef}
      size="small"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(_event, next) => onChange(next)}
      {...rest}
    />
  )
}
