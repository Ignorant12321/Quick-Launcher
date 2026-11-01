import React from 'react'
import ReactDOM from 'react-dom/client'
import './main.css'
import App from './App.jsx'
import { loadGroups } from './data'
import { primeCustomIcons } from './icons'

const container = document.getElementById('root')
const root = ReactDOM.createRoot(container)
const render = () => root.render(<App />)

// 首屏要用的自定义图标：分组头像 + 分组里各条目的自定义图标
function collectPrimeRefs () {
  try {
    const refs = []
    loadGroups().forEach((group) => {
      if (group?.customIconRef) refs.push(group.customIconRef)
      group?.items?.forEach((item) => {
        if (item?.customIconRef) refs.push(item.customIconRef)
      })
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
