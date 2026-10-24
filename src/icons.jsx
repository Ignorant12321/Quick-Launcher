import React, { useEffect, useMemo, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Box from '@mui/material/Box'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import WorkRoundedIcon from '@mui/icons-material/WorkRounded'
import CodeRoundedIcon from '@mui/icons-material/CodeRounded'
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded'
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded'
import BookmarkRoundedIcon from '@mui/icons-material/BookmarkRounded'
import MusicNoteRoundedIcon from '@mui/icons-material/MusicNoteRounded'
import MovieRoundedIcon from '@mui/icons-material/MovieRounded'
import ImageRoundedIcon from '@mui/icons-material/ImageRounded'
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded'
import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded'
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded'
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded'
import DesignServicesRoundedIcon from '@mui/icons-material/DesignServicesRounded'
import CloudRoundedIcon from '@mui/icons-material/CloudRounded'
import ChatBubbleRoundedIcon from '@mui/icons-material/ChatBubbleRounded'
import ConstructionRoundedIcon from '@mui/icons-material/ConstructionRounded'
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded'
import BoltRoundedIcon from '@mui/icons-material/BoltRounded'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded'
import BusinessCenterRoundedIcon from '@mui/icons-material/BusinessCenterRounded'
import BrushRoundedIcon from '@mui/icons-material/BrushRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import EmailRoundedIcon from '@mui/icons-material/EmailRounded'
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded'
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded'
import PhotoLibraryRoundedIcon from '@mui/icons-material/PhotoLibraryRounded'
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded'
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded'
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded'
import SlideshowRoundedIcon from '@mui/icons-material/SlideshowRounded'
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded'
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded'
import StorageRoundedIcon from '@mui/icons-material/StorageRounded'
import WifiRoundedIcon from '@mui/icons-material/WifiRounded'
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import BuildRoundedIcon from '@mui/icons-material/BuildRounded'
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded'
import MusicVideoRoundedIcon from '@mui/icons-material/MusicVideoRounded'
import PodcastsRoundedIcon from '@mui/icons-material/PodcastsRounded'
import NewspaperRoundedIcon from '@mui/icons-material/NewspaperRounded'
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded'
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded'
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import FlightRoundedIcon from '@mui/icons-material/FlightRounded'
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded'
import RestaurantRoundedIcon from '@mui/icons-material/RestaurantRounded'
import FitnessCenterRoundedIcon from '@mui/icons-material/FitnessCenterRounded'
import PetsRoundedIcon from '@mui/icons-material/PetsRounded'
import ForestRoundedIcon from '@mui/icons-material/ForestRounded'
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded'
import RocketLaunchRoundedIcon from '@mui/icons-material/RocketLaunchRounded'
import DiamondRoundedIcon from '@mui/icons-material/DiamondRounded'
import GroupRoundedIcon from '@mui/icons-material/GroupRounded'
import PublicRoundedIcon from '@mui/icons-material/PublicRounded'
import DnsRoundedIcon from '@mui/icons-material/DnsRounded'
import FolderSpecialRoundedIcon from '@mui/icons-material/FolderSpecialRounded'
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded'
import SavingsRoundedIcon from '@mui/icons-material/SavingsRounded'
import ArchitectureRoundedIcon from '@mui/icons-material/ArchitectureRounded'
import SmartphoneRoundedIcon from '@mui/icons-material/SmartphoneRounded'
import ComputerRoundedIcon from '@mui/icons-material/ComputerRounded'
import { DEFAULT_COLOR, DEFAULT_ICON, ITEM_TYPES, getReadableColor } from './data'

export const GROUP_ICONS = [
  { key: 'folder', label: '文件夹', Icon: FolderRoundedIcon },
  { key: 'star', label: '收藏', Icon: StarRoundedIcon },
  { key: 'work', label: '工作', Icon: WorkRoundedIcon },
  { key: 'code', label: '代码', Icon: CodeRoundedIcon },
  { key: 'terminal', label: '终端', Icon: TerminalRoundedIcon },
  { key: 'globe', label: '网络', Icon: LanguageRoundedIcon },
  { key: 'bookmark', label: '书签', Icon: BookmarkRoundedIcon },
  { key: 'music', label: '音乐', Icon: MusicNoteRoundedIcon },
  { key: 'movie', label: '影音', Icon: MovieRoundedIcon },
  { key: 'image', label: '图片', Icon: ImageRoundedIcon },
  { key: 'camera', label: '摄影', Icon: PhotoCameraRoundedIcon },
  { key: 'game', label: '游戏', Icon: SportsEsportsRoundedIcon },
  { key: 'school', label: '学习', Icon: SchoolRoundedIcon },
  { key: 'science', label: '实验', Icon: ScienceRoundedIcon },
  { key: 'design', label: '设计', Icon: DesignServicesRoundedIcon },
  { key: 'cloud', label: '云端', Icon: CloudRoundedIcon },
  { key: 'chat', label: '沟通', Icon: ChatBubbleRoundedIcon },
  { key: 'build', label: '构建', Icon: ConstructionRoundedIcon },
  { key: 'heart', label: '喜欢', Icon: FavoriteRoundedIcon },
  { key: 'bolt', label: '效率', Icon: BoltRoundedIcon },
  { key: 'home', label: '主页', Icon: HomeRoundedIcon },
  { key: 'explore', label: '探索', Icon: TravelExploreRoundedIcon },
  { key: 'business', label: '商务', Icon: BusinessCenterRoundedIcon },
  { key: 'brush', label: '创作', Icon: BrushRoundedIcon },
  { key: 'calendar', label: '日程', Icon: CalendarMonthRoundedIcon },
  { key: 'email', label: '邮件', Icon: EmailRoundedIcon },
  { key: 'phone', label: '电话', Icon: PhoneRoundedIcon },
  { key: 'cart', label: '购物', Icon: ShoppingCartRoundedIcon },
  { key: 'photos', label: '图库', Icon: PhotoLibraryRoundedIcon },
  { key: 'videos', label: '视频库', Icon: VideoLibraryRoundedIcon },
  { key: 'document', label: '文档', Icon: DescriptionRoundedIcon },
  { key: 'table', label: '表格', Icon: TableChartRoundedIcon },
  { key: 'slides', label: '演示', Icon: SlideshowRoundedIcon },
  { key: 'bug', label: '调试', Icon: BugReportRoundedIcon },
  { key: 'chip', label: '硬件', Icon: MemoryRoundedIcon },
  { key: 'storage', label: '存储', Icon: StorageRoundedIcon },
  { key: 'wifi', label: '网络设备', Icon: WifiRoundedIcon },
  { key: 'security', label: '安全', Icon: SecurityRoundedIcon },
  { key: 'settings', label: '设置', Icon: SettingsRoundedIcon },
  { key: 'tools', label: '工具', Icon: BuildRoundedIcon },
  { key: 'palette', label: '配色', Icon: PaletteRoundedIcon },
  { key: 'musicvideo', label: '音乐视频', Icon: MusicVideoRoundedIcon },
  { key: 'podcast', label: '播客', Icon: PodcastsRoundedIcon },
  { key: 'news', label: '资讯', Icon: NewspaperRoundedIcon },
  { key: 'book', label: '阅读', Icon: MenuBookRoundedIcon },
  { key: 'translate', label: '翻译', Icon: TranslateRoundedIcon },
  { key: 'calculate', label: '计算', Icon: CalculateRoundedIcon },
  { key: 'map', label: '地图', Icon: MapRoundedIcon },
  { key: 'place', label: '位置', Icon: PlaceRoundedIcon },
  { key: 'flight', label: '出行', Icon: FlightRoundedIcon },
  { key: 'car', label: '驾驶', Icon: DirectionsCarRoundedIcon },
  { key: 'restaurant', label: '餐饮', Icon: RestaurantRoundedIcon },
  { key: 'fitness', label: '健身', Icon: FitnessCenterRoundedIcon },
  { key: 'pets', label: '宠物', Icon: PetsRoundedIcon },
  { key: 'eco', label: '自然', Icon: ForestRoundedIcon },
  { key: 'idea', label: '灵感', Icon: LightbulbRoundedIcon },
  { key: 'rocket', label: '启动', Icon: RocketLaunchRoundedIcon },
  { key: 'diamond', label: '精选', Icon: DiamondRoundedIcon },
  { key: 'group', label: '团队', Icon: GroupRoundedIcon },
  { key: 'public', label: '互联网', Icon: PublicRoundedIcon },
  { key: 'server', label: '服务器', Icon: DnsRoundedIcon },
  { key: 'special', label: '特别收藏', Icon: FolderSpecialRoundedIcon },
  { key: 'task', label: '任务', Icon: TaskAltRoundedIcon },
  { key: 'savings', label: '财务', Icon: SavingsRoundedIcon },
  { key: 'architecture', label: '建筑', Icon: ArchitectureRoundedIcon },
  { key: 'mobile', label: '手机', Icon: SmartphoneRoundedIcon },
  { key: 'computer', label: '电脑', Icon: ComputerRoundedIcon }
]

const ICON_MAP = Object.fromEntries(GROUP_ICONS.map((item) => [item.key, item.Icon]))
const customIconCache = new Map()
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

export function getGroupIcon (key) {
  return ICON_MAP[key] || ICON_MAP[DEFAULT_ICON]
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
  const Icon = getGroupIcon(group?.icon)
  const markup = renderToStaticMarkup(<Icon />)
  const inner = markup
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
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

export async function getGroupFeatureIcon (group) {
  const customRef = group?.customIconRef
  if (customRef) {
    const cached = customIconCache.get(customRef)
    if (cached) return cached
    const dataUrl = window.services?.readCustomIconSync?.(customRef)
    if (dataUrl) {
      customIconCache.set(customRef, dataUrl)
      return dataUrl
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

export function getGroupFeatureIconSync (group) {
  const customRef = group?.customIconRef
  if (customRef) {
    const cached = customIconCache.get(customRef)
    if (cached) return cached
    const dataUrl = window.services?.readCustomIconSync?.(customRef)
    if (dataUrl) {
      customIconCache.set(customRef, dataUrl)
      return dataUrl
    }
  }

  const color = /^#[0-9a-f]{6}$/i.test(group?.color || '') ? group.color : DEFAULT_COLOR
  return featureIconCache.get(`${group?.icon || DEFAULT_ICON}|${color}`) || ''
}

export function cacheCustomIcon (ref, dataUrl) {
  if (!ref) return
  if (dataUrl) customIconCache.set(ref, dataUrl)
  else customIconCache.delete(ref)
}

export function useCustomIcon (ref) {
  const [src, setSrc] = useState(() => (ref ? customIconCache.get(ref) || null : null))

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
    window.services?.readCustomIcon(ref)
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
  }, [ref])

  return src
}

export function GroupAvatarFace ({ group, size = 40, customSrc = null }) {
  const color = group.color || DEFAULT_COLOR
  const Icon = getGroupIcon(group.icon)

  if (customSrc) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: `${Math.round(size * 0.29)}px`,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: `${Math.max(3, Math.round(size * 0.11))}px`,
          backgroundColor: 'rgba(255, 255, 255, 0.88)',
          border: '1px solid',
          borderColor: (theme) => (
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.16)' : 'divider'
          ),
          boxSizing: 'border-box'
        }}
      >
        <Box
          component="img"
          src={customSrc}
          alt=""
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
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
      <Icon sx={{ fontSize: Math.round(size * 0.52) }} />
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
