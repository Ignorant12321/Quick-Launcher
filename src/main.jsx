import React from 'react'
import ReactDOM from 'react-dom/client'
import './main.css'
import App from './App.jsx'
import { ITEM_TYPES, loadGroups } from './data'
import { primeCustomIcons } from './icons'

const container = document.getElementById('root')
const root = ReactDOM.createRoot(container)
const render = () => root.render(<App />)

// Only prime the initial viewport; offscreen images load when their components need them.
function collectPrimeRefs () {
  try {
    const refs = []
    const groups = loadGroups()
    const visibleGroups = Math.ceil(window.innerHeight / 40) + 2
    groups.slice(0, visibleGroups).forEach((group) => {
      if (group?.customIconRef) refs.push(group.customIconRef)
    })
    const columns = Math.max(1, Math.ceil((window.innerWidth - 220) / 150))
    const visibleItems = columns * (Math.ceil(window.innerHeight / 48) + 1)
    groups[0]?.items?.slice(0, visibleItems).forEach((item) => {
      if (item.customIconRef && (item.iconSource === 'custom' || item.type === ITEM_TYPES.GROUP)) {
        refs.push(item.customIconRef)
      }
    })
    return refs
  } catch {
    return []
  }
}

// 先把图标读进缓存再渲染首帧，避免「先内置图标、再闪成自定义图标」。
// 但读盘可能很慢（换设备后要等附件同步），所以封顶 300ms：
// 超时先渲染，晚到的图标由 refreshCustomIcons 通知已挂载的组件补上。
function bootstrap () {
  const refs = collectPrimeRefs()
  if (!refs.length) {
    render()
    return
  }

  let started = false
  const start = () => {
    if (started) return
    started = true
    render()
  }

  const timer = setTimeout(start, 300)
  primeCustomIcons(refs)
    .catch(() => {})
    .finally(() => {
      clearTimeout(timer)
      start()
    })
}

bootstrap()
