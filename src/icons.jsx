import React, { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
// 由 scripts/generate-group-icons.mjs 从 @mui/icons-material 生成
import GROUP_ICON_MARKUP from './groupIconMarkup.json'
import { DEFAULT_COLOR, DEFAULT_ICON, ITEM_TYPES, getReadableColor } from './data'

export const GROUP_ICONS = [
  { key: 'folder', label: '文件夹' },
  { key: 'star', label: '收藏' },
  { key: 'work', label: '工作' },
  { key: 'code', label: '代码' },
  { key: 'terminal', label: '终端' },
  { key: 'globe', label: '网络' },
  { key: 'bookmark', label: '书签' },
  { key: 'music', label: '音乐' },
  { key: 'movie', label: '影音' },
  { key: 'image', label: '图片' },
  { key: 'camera', label: '摄影' },
  { key: 'game', label: '游戏' },
  { key: 'school', label: '学习' },
  { key: 'science', label: '实验' },
  { key: 'design', label: '设计' },
  { key: 'cloud', label: '云端' },
  { key: 'chat', label: '沟通' },
  { key: 'build', label: '构建' },
  { key: 'heart', label: '喜欢' },
  { key: 'bolt', label: '效率' },
  { key: 'home', label: '主页' },
  { key: 'explore', label: '探索' },
  { key: 'business', label: '商务' },
  { key: 'brush', label: '创作' },
  { key: 'calendar', label: '日程' },
  { key: 'email', label: '邮件' },
  { key: 'phone', label: '电话' },
  { key: 'cart', label: '购物' },
  { key: 'photos', label: '图库' },
  { key: 'videos', label: '视频库' },
  { key: 'document', label: '文档' },
  { key: 'table', label: '表格' },
  { key: 'slides', label: '演示' },
  { key: 'bug', label: '调试' },
  { key: 'chip', label: '硬件' },
  { key: 'storage', label: '存储' },
  { key: 'wifi', label: '网络设备' },
  { key: 'security', label: '安全' },
  { key: 'settings', label: '设置' },
  { key: 'tools', label: '工具' },
  { key: 'palette', label: '配色' },
  { key: 'musicvideo', label: '音乐视频' },
  { key: 'podcast', label: '播客' },
  { key: 'news', label: '资讯' },
  { key: 'book', label: '阅读' },
  { key: 'translate', label: '翻译' },
  { key: 'calculate', label: '计算' },
  { key: 'map', label: '地图' },
  { key: 'place', label: '位置' },
  { key: 'flight', label: '出行' },
  { key: 'car', label: '驾驶' },
  { key: 'restaurant', label: '餐饮' },
  { key: 'fitness', label: '健身' },
  { key: 'pets', label: '宠物' },
  { key: 'eco', label: '自然' },
  { key: 'idea', label: '灵感' },
  { key: 'rocket', label: '启动' },
  { key: 'diamond', label: '精选' },
  { key: 'group', label: '团队' },
  { key: 'public', label: '互联网' },
  { key: 'server', label: '服务器' },
  { key: 'special', label: '特别收藏' },
  { key: 'task', label: '任务' },
  { key: 'savings', label: '财务' },
  { key: 'architecture', label: '建筑' },
  { key: 'mobile', label: '手机' },
  { key: 'computer', label: '电脑' }
]

const FALLBACK_ICON_MARKUP = GROUP_ICON_MARKUP[DEFAULT_ICON]

export function getGroupIconMarkup (key) {
  return GROUP_ICON_MARKUP[key] || FALLBACK_ICON_MARKUP
}

export function GroupGlyph ({ iconKey, size = 24, sx }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      sx={{
        width: size,
        height: size,
        display: 'block',
        fill: 'currentColor',
        flexShrink: 0,
        ...sx
      }}
      dangerouslySetInnerHTML={{ __html: getGroupIconMarkup(iconKey) }}
    />
  )
}

const customIconCache = new Map()
const customIconRefreshListeners = new Set()
const customFeatureIconCache = new Map()
const customFeatureIconPending = new Map()
const featureIconCache = new Map()
const featureIconPending = new Map()
const fileIconCache = new Map()

export function useFileIcons (items) {
  const paths = useMemo(
    () => [...new Set(
      items
        .filter((item) => (
          item.type === ITEM_TYPES.FILE ||
          item.type === ITEM_TYPES.FOLDER ||
          item.type === ITEM_TYPES.APP
        ))
        .map((item) => item.path)
    )],
    [items]
  )
  const pathsKey = paths.join('\n')
  const [icons, setIcons] = useState({})

  useEffect(() => {
    let active = true
    const cached = {}
    const missing = []

    paths.forEach((itemPath) => {
      if (fileIconCache.has(itemPath)) cached[itemPath] = fileIconCache.get(itemPath)
      else missing.push(itemPath)
    })
    setIcons(cached)

    if (!missing.length || !window.services?.getFileIcons) return undefined

    window.services.getFileIcons(missing)
      .then((result) => {
        Object.entries(result || {}).forEach(([itemPath, icon]) => {
          if (icon) fileIconCache.set(itemPath, icon)
        })
        if (active) setIcons((previous) => ({ ...previous, ...result }))
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [pathsKey])

  return icons
}

export function refreshCustomIcons () {
  customIconRefreshListeners.forEach((listener) => {
    try {
      listener()
    } catch {}
  })
}

function isLightColor (hex) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : DEFAULT_COLOR.slice(1)
  const red = parseInt(value.slice(0, 2), 16)
  const green = parseInt(value.slice(2, 4), 16)
  const blue = parseInt(value.slice(4, 6), 16)
  return (red * 0.299 + green * 0.587 + blue * 0.114) / 255 > 0.7
}

function buildFeatureSvg (group) {
  const color = /^#[0-9a-f]{6}$/i.test(group?.color || '') ? group.color : DEFAULT_COLOR
  const inner = getGroupIconMarkup(group?.icon)
  const glyph = isLightColor(color) ? '#1c2633' : '#ffffff'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="16" fill="${color}"/>` +
    `<g transform="translate(14 14) scale(1.5)" fill="${glyph}">${inner}</g>` +
    '</svg>'
}

function rasterizeFeatureSvg (svg) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        const size = 128
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('无法创建图标画布'))
          return
        }
        context.clearRect(0, 0, size, size)
        context.drawImage(image, 0, 0, size, size)
        resolve(canvas.toDataURL('image/png'))
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => reject(new Error('图标渲染失败'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

function loadImage (src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

async function buildRoundedCustomFeatureIcon (dataUrl, radius) {
  const image = await loadImage(dataUrl)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) return dataUrl

  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return dataUrl

  const coverScale = Math.max(size / width, size / height)
  const drawWidth = width * coverScale
  const drawHeight = height * coverScale
  const drawX = (size - drawWidth) / 2
  const drawY = (size - drawHeight) / 2
  const radiusPx = size * Math.min(50, Math.max(0, radius)) / 100

  context.clearRect(0, 0, size, size)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.save()
  if (radiusPx > 0) {
    const r = Math.min(radiusPx, size / 2)
    context.beginPath()
    context.moveTo(r, 0)
    context.lineTo(size - r, 0)
    context.quadraticCurveTo(size, 0, size, r)
    context.lineTo(size, size - r)
    context.quadraticCurveTo(size, size, size - r, size)
    context.lineTo(r, size)
    context.quadraticCurveTo(0, size, 0, size - r)
    context.lineTo(0, r)
    context.quadraticCurveTo(0, 0, r, 0)
    context.closePath()
    context.clip()
  }
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
  context.restore()
  return canvas.toDataURL('image/png')
}

function getRoundedCustomFeatureIcon (ref, dataUrl, radius) {
  const key = `${ref}|${Math.round(radius)}`
  if (customFeatureIconCache.has(key)) return customFeatureIconCache.get(key)
  if (customFeatureIconPending.has(key)) return customFeatureIconPending.get(key)

  const pending = buildRoundedCustomFeatureIcon(dataUrl, radius)
    .then((result) => {
      if (result) customFeatureIconCache.set(key, result)
      return result || dataUrl
    })
    .catch(() => dataUrl)
    .finally(() => {
      customFeatureIconPending.delete(key)
    })

  customFeatureIconPending.set(key, pending)
  return pending
}

export async function getGroupFeatureIcon (group) {
  const customRef = group?.customIconRef
  if (customRef) {
    let dataUrl = customIconCache.get(customRef)
    if (!dataUrl) {
      try {
        dataUrl = await window.services?.readCustomIcon?.(customRef) || ''
      } catch {
        dataUrl = ''
      }
      if (dataUrl) customIconCache.set(customRef, dataUrl)
    }
    if (dataUrl) {
      return getRoundedCustomFeatureIcon(
        customRef,
        dataUrl,
        Number(group?.customIconRadius) || 0
      )
    }
  }

  const color = /^#[0-9a-f]{6}$/i.test(group?.color || '') ? group.color : DEFAULT_COLOR
  const cacheKey = `${group?.icon || DEFAULT_ICON}|${color}`
  if (featureIconCache.has(cacheKey)) return featureIconCache.get(cacheKey)
  if (featureIconPending.has(cacheKey)) return featureIconPending.get(cacheKey)

  // uTools 的动态功能图标需要位图，先把内置 SVG 图标栅格化为 PNG
  let svg = ''
  try {
    svg = buildFeatureSvg(group)
  } catch {
    return ''
  }

  const pending = rasterizeFeatureSvg(svg)
    .then((dataUrl) => {
      if (dataUrl) featureIconCache.set(cacheKey, dataUrl)
      return dataUrl
    })
    .catch(() => '')
    .finally(() => {
      featureIconPending.delete(cacheKey)
    })

  featureIconPending.set(cacheKey, pending)
  return pending
}

function clearCustomFeatureIconCache (ref) {
  const prefix = `${ref}|`
  for (const key of [...customFeatureIconCache.keys()]) {
    if (key.startsWith(prefix)) customFeatureIconCache.delete(key)
  }
  for (const key of [...customFeatureIconPending.keys()]) {
    if (key.startsWith(prefix)) customFeatureIconPending.delete(key)
  }
}

export function cacheCustomIcon (ref, dataUrl) {
  if (!ref) return
  clearCustomFeatureIconCache(ref)
  if (dataUrl) customIconCache.set(ref, dataUrl)
  else customIconCache.delete(ref)
}

export function useCustomIcon (ref) {
  const [src, setSrc] = useState(() => (ref ? customIconCache.get(ref) || null : null))
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    if (!ref) return undefined
    const handleRefresh = () => setRefreshToken((value) => value + 1)
    customIconRefreshListeners.add(handleRefresh)
    return () => customIconRefreshListeners.delete(handleRefresh)
  }, [ref])

  useEffect(() => {
    let active = true
    if (!ref) {
      setSrc(null)
      return undefined
    }

    const cached = customIconCache.get(ref)
    if (cached) {
      setSrc(cached)
      return undefined
    }

    setSrc(null)
    window.services?.readCustomIcon?.(ref)
      .then((dataUrl) => {
        if (dataUrl) customIconCache.set(ref, dataUrl)
        if (active) setSrc(dataUrl || null)
      })
      .catch(() => {
        if (active) setSrc(null)
      })

    return () => {
      active = false
    }
  }, [ref, refreshToken])

  return src
}

export function GroupAvatarFace ({ group, size = 40, customSrc = null }) {
  const color = group.color || DEFAULT_COLOR

  if (customSrc) {
    const radiusValue = Number(group?.customIconRadius)
    const customRadius = Number.isFinite(radiusValue)
      ? Math.min(50, Math.max(0, radiusValue))
      : 0

    return (
      <Box
        sx={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: `${customRadius}%`,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
          boxSizing: 'border-box'
        }}
      >
        <Box
          component="img"
          src={customSrc}
          alt=""
          draggable={false}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block'
          }}
        />
      </Box>
    )
  }

  return (
    <Box
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: `${Math.round(size * 0.29)}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: (theme) => getReadableColor(color, theme.palette.mode),
        backgroundColor: (theme) => (
          theme.palette.mode === 'dark'
            ? `color-mix(in srgb, ${color} 20%, transparent)`
            : `${color}24`
        ),
        boxSizing: 'border-box'
      }}
    >
      <GroupGlyph iconKey={group.icon} size={Math.round(size * 0.52)} />
    </Box>
  )
}

export function GroupAvatar ({ group, size = 40, customSrc }) {
  const resolved = useCustomIcon(group.customIconRef)
  return (
    <GroupAvatarFace
      group={group}
      size={size}
      customSrc={customSrc === undefined ? resolved : customSrc}
    />
  )
}
