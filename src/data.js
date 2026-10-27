import { pinyin } from 'pinyin-pro'

export const GROUPS_KEY = 'quick-launcher:groups'
export const VIEW_KEY = 'quick-launcher:view'
export const THEME_KEY = 'quick-launcher:theme-mode'
export const WINDOW_HEIGHT_KEY = 'quick-launcher:full-height'
export const SIDEBAR_KEY = 'quick-launcher:sidebar-collapsed'
export const FEATURE_PREFIX = 'launcher-group-'
export const ADD_TO_GROUP_FEATURE_CODE = 'add-to-group'
export const DEFAULT_ICON = 'folder'
export const DEFAULT_ITEM_ICON = 'globe'
export const DEFAULT_COLOR = '#1276C5'
export const DEFAULT_THEME = 'auto'
export const DEFAULT_FULL_HEIGHT = 700
export const THEME_MODES = ['auto', 'light', 'dark']
export const MAX_KEYWORD_LENGTH = 24
export const MAX_ALIASES = 4
export const MAX_ICON_RADIUS = 50
export const MAX_BACKGROUND_DIM = 90
export const DEFAULT_BACKGROUND_DIM = 55
export const MIN_TEXT_OPACITY = 40
export const DEFAULT_TEXT_OPACITY = 100
export const MAIN_PUSH_LIMIT = 5
export const BACKUP_VERSION = 1
// 嵌套分组盒子的自定义网格上限（列 / 行）
export const MAX_NESTED_GRID = 5
// 嵌套分组盒子的默认网格：取消「自动」后统一按 3×3 起
export const DEFAULT_NESTED_GRID = 3

export const ITEM_TYPES = {
  FILE: 'file',
  FOLDER: 'folder',
  URL: 'url',
  PLUGIN: 'plugin',
  APP: 'app',
  // 分组入口：把另一个分组当作一条条目放进当前分组，点开就切过去
  GROUP: 'group'
}

export const ITEM_DEFAULT_ICONS = {
  [ITEM_TYPES.FILE]: 'document',
  [ITEM_TYPES.FOLDER]: 'folder',
  [ITEM_TYPES.URL]: 'globe',
  [ITEM_TYPES.PLUGIN]: 'settings',
  [ITEM_TYPES.APP]: 'computer',
  [ITEM_TYPES.GROUP]: 'group'
}

export const ITEM_DEFAULT_COLORS = {
  [ITEM_TYPES.FILE]: '#5C6B7A',
  [ITEM_TYPES.FOLDER]: '#D8A43A',
  [ITEM_TYPES.URL]: DEFAULT_COLOR,
  [ITEM_TYPES.PLUGIN]: '#8B5CF6',
  [ITEM_TYPES.APP]: '#2E9E6B',
  [ITEM_TYPES.GROUP]: DEFAULT_COLOR
}

export const BROWSER_MODES = [
  { id: 'default', label: '系统默认浏览器打开', color: DEFAULT_COLOR },
  { id: 'ie', label: 'Windows IE 浏览器打开', color: '#0078D7', platform: 'win32' },
  { id: 'safari', label: 'macOS Safari 浏览器打开', color: '#0FB5EE', platform: 'darwin' },
  { id: 'edge', label: 'Microsoft Edge 打开', color: '#0F6CBD' },
  { id: 'edge-private', label: 'Microsoft Edge 隐私模式打开', color: '#0F6CBD' },
  { id: 'chrome', label: 'Chrome 打开', color: '#4285F4' },
  { id: 'chrome-app', label: 'Chrome 应用模式打开', color: '#4285F4' },
  { id: 'chrome-incognito', label: 'Chrome 隐私模式打开', color: '#4285F4' },
  { id: 'firefox', label: 'Firefox 打开', color: '#FF7139' },
  { id: 'firefox-private', label: 'Firefox 隐私模式打开', color: '#FF7139' },
  { id: 'ubrowser', label: 'ubrowser 自动化浏览器打开', color: '#8B5CF6' }
]

const BROWSER_MODE_IDS = new Set(BROWSER_MODES.map((mode) => mode.id))

export function normalizeBrowserMode (value) {
  return typeof value === 'string' && BROWSER_MODE_IDS.has(value) ? value : ''
}

export function getBrowserModeLabel (value) {
  return BROWSER_MODES.find((mode) => mode.id === value)?.label || ''
}

function normalizeItemAppearance (type, appearance = {}) {
  const defaultIcon = ITEM_DEFAULT_ICONS[type] || 'document'
  const defaultColor = ITEM_DEFAULT_COLORS[type] || DEFAULT_COLOR
  const radiusValue = Number(appearance.customIconRadius)
  const customIconRef = typeof appearance.customIconRef === 'string' && appearance.customIconRef
    ? appearance.customIconRef
    : null

  let iconSource = ['native', 'builtin', 'custom'].includes(appearance.iconSource)
    ? appearance.iconSource
    : (customIconRef
        ? 'custom'
        : ([ITEM_TYPES.URL, ITEM_TYPES.GROUP].includes(type) ? 'builtin' : 'native'))
  if (iconSource === 'custom' && !customIconRef) {
    iconSource = [ITEM_TYPES.URL, ITEM_TYPES.GROUP].includes(type) ? 'builtin' : 'native'
  }

  return {
    icon: typeof appearance.icon === 'string' && appearance.icon ? appearance.icon : defaultIcon,
    color: /^#[0-9a-f]{6}$/i.test(appearance.color) ? appearance.color : defaultColor,
    iconSource,
    customIconRef,
    customIconRadius: Number.isFinite(radiusValue)
      ? Math.min(MAX_ICON_RADIUS, Math.max(0, Math.round(radiusValue)))
      : 0
  }
}

export const VIEW_MODES = ['grid', 'list', 'compact']
export const DEFAULT_VIEW = 'grid'
// 紧凑面板自己的布局偏好（盒子 / 列表），与主界面的三态视图互不影响
export const COMPACT_VIEW_KEY = 'quick-launcher:compact-view'
export const COMPACT_VIEW_MODES = ['grid', 'list']

const APP_EXTENSIONS = new Set(['.exe', '.lnk', '.bat', '.cmd', '.com', '.app'])

export const GROUP_COLORS = [
  '#1276C5',
  '#2E9E6B',
  '#D9663D',
  '#8B5CF6',
  '#D6456B',
  '#C49A2C',
  '#0F8B8D',
  '#5C6B7A'
]

export const MAIN_COMMANDS = ['Quick Launcher', '快捷启动器', '快捷启动', '启动器']

function hexToRgb (hex) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : DEFAULT_COLOR.slice(1)
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ]
}

function mixColor (hex, target, amount) {
  const source = hexToRgb(hex)
  const mix = target === 'white' ? 255 : 0
  return `#${source
    .map((channel) => Math.round(channel + (mix - channel) * amount).toString(16).padStart(2, '0'))
    .join('')}`
}

export function getReadableColor (hex, mode) {
  if (mode === 'dark') return mixColor(hex, 'white', 0.48)
  const [red, green, blue] = hexToRgb(hex)
  const luminance = (red * 0.299 + green * 0.587 + blue * 0.114) / 255
  return luminance > 0.68 ? mixColor(hex, 'black', 0.36) : hex
}

export function createId () {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createGroup (overrides = {}) {
  return {
    id: createId(),
    name: '',
    aliases: [],
    icon: DEFAULT_ICON,
    color: DEFAULT_COLOR,
    keywordMatch: false,
    quickLaunch: false,
    utoolsSearch: false,
    customIconRef: null,
    customIconRadius: 0,
    backgroundRef: null,
    backgroundDim: DEFAULT_BACKGROUND_DIM,
    // 背景图上的字色：null 表示自动跟随底图明暗，否则为 #rrggbb
    textColor: null,
    textOpacity: DEFAULT_TEXT_OPACITY,
    compactView: 'grid',
    // 紧凑面板盒子视图：把分组入口展开成盒子，直接列出里面的条目
    nestedGroupView: false,
    // 盒子里的网格：0 表示自动（列按宽度铺、行不限制）
    nestedBoxCols: DEFAULT_NESTED_GRID,
    nestedBoxRows: DEFAULT_NESTED_GRID,
    items: [],
    ...overrides
  }
}

export function createInitialGroups () {
  return [
    createGroup({
      name: '常用',
      icon: 'star',
      color: DEFAULT_COLOR
    })
  ]
}

export function normalizeUrl (value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    if (!parsed.hostname) return ''
    return parsed.href
  } catch {
    return ''
  }
}

export function getUrlDisplayName (url) {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.hostname}${pathname}`.slice(0, 80)
  } catch {
    return url
  }
}

export function isApplicationPath (targetPath) {
  if (typeof targetPath !== 'string') return false
  const clean = targetPath.trim()
  if (!clean) return false
  const ext = clean.slice(clean.lastIndexOf('.')).toLocaleLowerCase()
  return APP_EXTENSIONS.has(ext)
}

export function isApplicationTarget (described) {
  const targetPath = typeof described?.path === 'string'
    ? described.path.trim().replace(/[\\/]+$/, '')
    : ''
  if (!isApplicationPath(targetPath)) return false
  return !described?.isDirectory || /\.app$/i.test(targetPath)
}

function getApplicationName (targetPath, fallback) {
  const raw = typeof fallback === 'string' && fallback.trim()
    ? fallback.trim()
    : (targetPath.split(/[\\/]/).filter(Boolean).pop() || targetPath)
  return raw.replace(/\.(exe|lnk|bat|cmd|com|app)$/i, '').replace(/\s*-\s*(快捷方式|shortcut)$/i, '').trim() || raw
}

export function createFileItem (described) {
  const isDirectory = Boolean(described.isDirectory)
  const isApp = isApplicationTarget(described)
  const type = isDirectory && !isApp ? ITEM_TYPES.FOLDER : (isApp ? ITEM_TYPES.APP : ITEM_TYPES.FILE)
  return {
    id: createId(),
    type,
    path: described.path,
    name: isApp ? getApplicationName(described.path, described.name) : described.name,
    openWith: '',
    command: '',
    ...normalizeItemAppearance(type)
  }
}

export function createAppItem (application) {
  return {
    id: createId(),
    type: ITEM_TYPES.APP,
    path: application.path,
    name: getApplicationName(application.path, application.name),
    openWith: '',
    command: '',
    ...normalizeItemAppearance(ITEM_TYPES.APP)
  }
}

export function createUrlItem (url, name, appearance = {}) {
  return {
    id: createId(),
    type: ITEM_TYPES.URL,
    path: url,
    name: typeof name === 'string' && name.trim() ? name.trim() : getUrlDisplayName(url),
    openWith: '',
    command: '',
    browserMode: normalizeBrowserMode(appearance.browserMode) || 'default',
    ...normalizeItemAppearance(ITEM_TYPES.URL, appearance)
  }
}

export function createPluginItem (pluginName, command, name) {
  const plugin = typeof pluginName === 'string' ? pluginName.trim() : ''
  const cmd = typeof command === 'string' && command.trim() ? command.trim() : plugin
  return {
    id: createId(),
    type: ITEM_TYPES.PLUGIN,
    path: plugin,
    name: typeof name === 'string' && name.trim() ? name.trim() : plugin,
    openWith: '',
    command: cmd,
    ...normalizeItemAppearance(ITEM_TYPES.PLUGIN)
  }
}

export function createGroupItem (target) {
  const customIconRef = target?.customIconRef || null
  const color = /^#[0-9a-f]{6}$/i.test(target?.color) ? target.color : DEFAULT_COLOR
  return {
    id: createId(),
    type: ITEM_TYPES.GROUP,
    groupId: target.id,
    path: '',
    name: target.name,
    openWith: '',
    command: '',
    icon: target.icon || ITEM_DEFAULT_ICONS[ITEM_TYPES.GROUP],
    // 盒子里的展开方式（平铺 / 列表），只在紧凑面板里切换，随分组数据一起导出
    boxView: 'grid',
    color,
    iconSource: customIconRef ? 'custom' : 'builtin',
    customIconRef,
    customIconRadius: Number.isFinite(Number(target.customIconRadius))
      ? Math.min(MAX_ICON_RADIUS, Math.max(0, Math.round(Number(target.customIconRadius))))
      : 0
  }
}

// 目标分组改名 / 换图标后，引用它的「分组入口」条目要跟着更新快照
export function syncGroupEntrySnapshots (groups, target) {
  if (!target?.id) return groups
  const customIconRef = target.customIconRef || null
  const color = /^#[0-9a-f]{6}$/i.test(target.color) ? target.color : DEFAULT_COLOR
  const radius = Number.isFinite(Number(target.customIconRadius))
    ? Math.min(MAX_ICON_RADIUS, Math.max(0, Math.round(Number(target.customIconRadius))))
    : 0

  return groups.map((group) => {
    let changed = false
    const items = group.items.map((item) => {
      if (item.type !== ITEM_TYPES.GROUP || item.groupId !== target.id) return item
      const next = {
        ...item,
        name: target.name,
        icon: target.icon || ITEM_DEFAULT_ICONS[ITEM_TYPES.GROUP],
        color,
        iconSource: customIconRef ? 'custom' : 'builtin',
        customIconRef,
        customIconRadius: radius
      }
      if (
        next.name === item.name &&
        next.icon === item.icon &&
        next.color === item.color &&
        next.iconSource === item.iconSource &&
        next.customIconRef === item.customIconRef &&
        next.customIconRadius === item.customIconRadius
      ) {
        return item
      }
      changed = true
      return next
    })
    return changed ? { ...group, items } : group
  })
}

// 删掉某个分组后，别处指向它的入口条目一起清掉，避免留下点不开的死链
export function dropGroupEntries (groups, removedGroupId) {
  return groups.map((group) => {
    const items = group.items.filter((item) => (
      item.type !== ITEM_TYPES.GROUP || item.groupId !== removedGroupId
    ))
    return items.length === group.items.length ? group : { ...group, items }
  })
}

function uniqueKeywords (values) {
  const seen = new Set()
  return values.reduce((result, value) => {
    const keyword = typeof value === 'string' ? value.trim() : ''
    const key = keyword.toLocaleLowerCase()
    if (keyword && !seen.has(key)) {
      seen.add(key)
      result.push(keyword)
    }
    return result
  }, [])
}

function normalizeItem (item, { keepCustomIcon = false } = {}) {
  if (!item) return null

  const fallbackType = item.isDirectory ? ITEM_TYPES.FOLDER : ITEM_TYPES.FILE
  const type = Object.values(ITEM_TYPES).includes(item.type) ? item.type : fallbackType
  const target = typeof item.path === 'string' ? item.path.trim() : ''
  // 分组入口没有路径，靠 groupId 定位目标分组
  const groupId = type === ITEM_TYPES.GROUP
    ? (typeof item.groupId === 'string' ? item.groupId.trim() : '')
    : ''
  if (type === ITEM_TYPES.GROUP ? !groupId : !target) return null

  let name = typeof item.name === 'string' ? item.name.trim() : ''
  if (!name) {
    if (type === ITEM_TYPES.URL) name = getUrlDisplayName(target)
    else if (type === ITEM_TYPES.PLUGIN) name = target
    else if (type === ITEM_TYPES.APP) name = getApplicationName(target)
    else if (type === ITEM_TYPES.GROUP) name = '分组'
    else name = target.split(/[\\/]/).filter(Boolean).pop() || target
  }

  const supportsOpenWith = type === ITEM_TYPES.FILE ||
    type === ITEM_TYPES.FOLDER ||
    type === ITEM_TYPES.APP ||
    type === ITEM_TYPES.URL

  const normalized = {
    id: typeof item.id === 'string' && item.id ? item.id : createId(),
    type,
    path: target,
    name,
    openWith: supportsOpenWith && typeof item.openWith === 'string' ? item.openWith : '',
    command: type === ITEM_TYPES.PLUGIN
      ? (typeof item.command === 'string' && item.command.trim() ? item.command.trim() : target)
      : '',
    ...(type === ITEM_TYPES.URL
      ? { browserMode: normalizeBrowserMode(item.browserMode) }
      : {}),
    ...(type === ITEM_TYPES.GROUP
      ? { groupId, boxView: item.boxView === 'list' ? 'list' : 'grid' }
      : {}),
    ...normalizeItemAppearance(type, item)
  }

  if (
    keepCustomIcon &&
    typeof item.customIcon === 'string' &&
    /^data:image\/[a-z0-9.+-]+;base64,/i.test(item.customIcon)
  ) {
    normalized.customIcon = item.customIcon
  }

  return normalized
}

// 嵌套分组盒子的网格行列：限制在 1–MAX_NESTED_GRID；
// 空值 / 0（旧数据的「自动」）统一落到默认的 3×3
export function clampNestedGrid (value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_NESTED_GRID
  return Math.min(MAX_NESTED_GRID, Math.max(1, Math.round(number)))
}

function normalizeGroup (group, options) {
  if (!group || typeof group !== 'object') return null
  const name = typeof group.name === 'string' ? group.name.trim() : ''
  if (!name) return null
  const keywordMatch = Boolean(group.keywordMatch)
  const quickLaunch = keywordMatch && Boolean(group.quickLaunch)
  const utoolsSearch = keywordMatch && !quickLaunch && Boolean(group.utoolsSearch)
  const radiusValue = Number(group.customIconRadius)
  const customIconRadius = Number.isFinite(radiusValue)
    ? Math.min(MAX_ICON_RADIUS, Math.max(0, Math.round(radiusValue)))
    : 0
  const dimValue = Number(group.backgroundDim)
  const backgroundDim = Number.isFinite(dimValue)
    ? Math.min(MAX_BACKGROUND_DIM, Math.max(0, Math.round(dimValue)))
    : DEFAULT_BACKGROUND_DIM
  const opacityValue = Number(group.textOpacity)
  const textOpacity = Number.isFinite(opacityValue)
    ? Math.min(100, Math.max(MIN_TEXT_OPACITY, Math.round(opacityValue)))
    : DEFAULT_TEXT_OPACITY

  return {
    id: typeof group.id === 'string' && group.id ? group.id : createId(),
    name,
    aliases: uniqueKeywords(Array.isArray(group.aliases) ? group.aliases : [])
      .filter((alias) => !validateKeyword(alias))
      .slice(0, MAX_ALIASES),
    icon: typeof group.icon === 'string' && group.icon ? group.icon : DEFAULT_ICON,
    color: /^#[0-9a-f]{6}$/i.test(group.color) ? group.color : DEFAULT_COLOR,
    keywordMatch,
    quickLaunch,
    utoolsSearch,
    customIconRef: typeof group.customIconRef === 'string' && group.customIconRef ? group.customIconRef : null,
    customIconRadius,
    backgroundRef: typeof group.backgroundRef === 'string' && group.backgroundRef ? group.backgroundRef : null,
    backgroundDim,
    textColor: /^#[0-9a-f]{6}$/i.test(group.textColor) ? group.textColor.toLowerCase() : null,
    textOpacity,
    compactView: COMPACT_VIEW_MODES.includes(group.compactView) ? group.compactView : 'grid',
    nestedGroupView: Boolean(group.nestedGroupView),
    nestedBoxCols: clampNestedGrid(group.nestedBoxCols),
    nestedBoxRows: clampNestedGrid(group.nestedBoxRows),
    items: Array.isArray(group.items)
      ? group.items.map((item) => normalizeItem(item, options)).filter(Boolean)
      : []
  }
}

export function parseBackup (value) {
  const list = Array.isArray(value) ? value : value?.groups
  if (!Array.isArray(list)) return { ok: false, error: '配置文件格式无效' }

  const groups = []
  for (const entry of list) {
    const normalized = normalizeGroup(entry, { keepCustomIcon: true })
    if (!normalized || validateKeyword(normalized.name)) continue
    const customIcon = typeof entry.customIcon === 'string' &&
      /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/i.test(entry.customIcon)
      ? entry.customIcon
      : ''
    const backgroundImage = typeof entry.backgroundImage === 'string' &&
      /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/i.test(entry.backgroundImage)
      ? entry.backgroundImage
      : ''
    groups.push({
      ...normalized,
      customIcon,
      customIconRef: customIcon ? null : normalized.customIconRef,
      backgroundImage,
      backgroundRef: backgroundImage ? null : normalized.backgroundRef
    })
  }

  if (!groups.length) return { ok: false, error: '配置文件中没有可用分组' }
  return { ok: true, groups }
}

export function mergeImportedGroups (currentGroups, importedGroups) {
  const nameKey = (name) => String(name || '').trim().toLocaleLowerCase()
  const existingNames = new Set(currentGroups.map((group) => nameKey(group.name)))
  const incoming = new Map()
  const replacements = new Map()
  const additions = []

  // 同一文件内的同名分组以后出现的为准
  importedGroups.forEach((group) => {
    const key = nameKey(group.name)
    if (key) incoming.set(key, group)
  })

  incoming.forEach((group, key) => {
    if (existingNames.has(key)) {
      // 同名导入覆盖已有分组，保留已有分组的位置和 ID
      replacements.set(key, group)
      return
    }
    additions.push(group)
  })

  const merged = currentGroups.map((group) => {
    const replacement = replacements.get(nameKey(group.name))
    return replacement
      ? { ...replacement, id: group.id, __imported: true }
      : { ...group, __imported: false }
  })

  const usedIds = new Set(currentGroups.map((group) => group.id))
  additions.forEach((group) => {
    const id = usedIds.has(group.id) ? createId() : group.id
    usedIds.add(id)
    merged.push({ ...group, id, __imported: true })
  })

  // 已有分组优先保留关键词；新导入分组发生冲突时关闭匹配
  const priority = [
    ...merged.filter((group) => !group.__imported),
    ...merged.filter((group) => group.__imported)
  ]
  const accepted = []
  const warnings = []

  priority.forEach((group) => {
    const { __imported, customIcon, backgroundImage, ...candidate } = group
    if (__imported && candidate.keywordMatch) {
      const keywordError = validateGroupKeywords(accepted, candidate)
      if (keywordError) {
        candidate.keywordMatch = false
        candidate.quickLaunch = false
        candidate.utoolsSearch = false
        warnings.push(candidate.name)
      }
    }
    accepted.push(candidate)
  })

  const byId = new Map(accepted.map((group) => [group.id, group]))
  return {
    groups: merged.map((group) => byId.get(group.id)),
    warnings
  }
}

export function loadGroups () {
  try {
    const stored = window.utools?.dbStorage?.getItem(GROUPS_KEY)
    if (!Array.isArray(stored)) return createInitialGroups()
    return stored.map(normalizeGroup).filter(Boolean)
  } catch {
    return createInitialGroups()
  }
}

export function saveGroups (groups) {
  window.utools.dbStorage.setItem(GROUPS_KEY, groups)
}

export function loadViewMode () {
  try {
    const stored = window.utools?.dbStorage?.getItem(VIEW_KEY)
    if (VIEW_MODES.includes(stored)) return stored
  } catch {}
  try {
    const stored = window.localStorage.getItem(VIEW_KEY)
    if (VIEW_MODES.includes(stored)) return stored
  } catch {}
  return DEFAULT_VIEW
}

export function saveViewMode (mode) {
  if (!VIEW_MODES.includes(mode)) return
  try {
    window.utools?.dbStorage?.setItem(VIEW_KEY, mode)
  } catch {}
  try {
    window.localStorage.setItem(VIEW_KEY, mode)
  } catch {}
}

export function loadCompactViewMode () {
  try {
    const stored = window.utools?.dbStorage?.getItem(COMPACT_VIEW_KEY)
    if (COMPACT_VIEW_MODES.includes(stored)) return stored
  } catch {}
  try {
    const stored = window.localStorage.getItem(COMPACT_VIEW_KEY)
    if (COMPACT_VIEW_MODES.includes(stored)) return stored
  } catch {}
  return 'grid'
}

export function saveCompactViewMode (mode) {
  if (!COMPACT_VIEW_MODES.includes(mode)) return
  try {
    window.utools?.dbStorage?.setItem(COMPACT_VIEW_KEY, mode)
  } catch {}
  try {
    window.localStorage.setItem(COMPACT_VIEW_KEY, mode)
  } catch {}
}

export function loadSidebarCollapsed () {
  try {
    const stored = window.utools?.dbStorage?.getItem(SIDEBAR_KEY)
    if (typeof stored === 'boolean') return stored
  } catch {}
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {}
  return false
}

export function saveSidebarCollapsed (collapsed) {
  const value = Boolean(collapsed)
  try {
    window.utools?.dbStorage?.setItem(SIDEBAR_KEY, value)
  } catch {}
  try {
    window.localStorage.setItem(SIDEBAR_KEY, value ? '1' : '0')
  } catch {}
}

export function loadThemeMode () {
  try {
    const stored = window.utools?.dbStorage?.getItem(THEME_KEY)
    if (THEME_MODES.includes(stored)) return stored
  } catch {}
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (THEME_MODES.includes(stored)) return stored
  } catch {}
  return DEFAULT_THEME
}

export function resolveThemeMode (themeMode) {
  if (themeMode === 'dark' || themeMode === 'light') return themeMode
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
}

export function saveThemeMode (mode) {
  if (!THEME_MODES.includes(mode)) return
  try {
    window.utools?.dbStorage?.setItem(THEME_KEY, mode)
  } catch {}
  try {
    window.localStorage.setItem(THEME_KEY, mode)
  } catch {}
}

export function loadFullHeight () {
  let stored
  try {
    stored = Number(window.utools?.dbStorage?.getItem(WINDOW_HEIGHT_KEY))
  } catch {}
  if (!Number.isFinite(stored) || stored < 400 || stored > 2000) {
    try {
      stored = Number(window.localStorage.getItem(WINDOW_HEIGHT_KEY))
    } catch {}
  }
  if (!Number.isFinite(stored) || stored < 400 || stored > 2000) {
    return DEFAULT_FULL_HEIGHT
  }
  return Math.round(stored)
}

export function saveFullHeight (height) {
  const value = Math.round(Number(height))
  if (!Number.isFinite(value) || value < 400 || value > 2000) return
  try {
    window.utools?.dbStorage?.setItem(WINDOW_HEIGHT_KEY, value)
  } catch {}
  try {
    window.localStorage.setItem(WINDOW_HEIGHT_KEY, String(value))
  } catch {}
}

// 每个分组上次实测的面板高度：条目没变时下次进入直接用这个高度，
// 窗口就不必先按主界面的高度出现、再缩成面板
export const COMPACT_HEIGHTS_KEY = 'quick-launcher:compact-heights'

export function loadCompactHeights () {
  let raw
  try {
    raw = window.utools?.dbStorage?.getItem(COMPACT_HEIGHTS_KEY)
  } catch {}
  if (!raw) {
    try {
      raw = window.localStorage.getItem(COMPACT_HEIGHTS_KEY)
    } catch {}
  }
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }
  if (!parsed || typeof parsed !== 'object') return {}
  const result = {}
  Object.keys(parsed).forEach((id) => {
    const entry = parsed[id]
    const height = Math.round(Number(entry?.h))
    const count = Math.round(Number(entry?.n))
    if (!id || !Number.isFinite(height) || height < 180 || height > 520) return
    result[id] = { h: height, n: Number.isFinite(count) ? count : -1 }
  })
  return result
}

export function saveCompactHeight (groupId, height, count) {
  if (!groupId) return
  const value = Math.round(Number(height))
  if (!Number.isFinite(value) || value < 180 || value > 520) return
  const total = Math.round(Number(count))
  let all = {}
  try {
    all = loadCompactHeights()
  } catch {}
  all[groupId] = { h: value, n: Number.isFinite(total) ? total : -1 }
  const ids = Object.keys(all)
  // 分组删掉后别把旧高度一直攒着
  if (ids.length > 40) ids.slice(0, ids.length - 40).forEach((id) => { delete all[id] })
  try {
    window.utools?.dbStorage?.setItem(COMPACT_HEIGHTS_KEY, all)
  } catch {}
  try {
    window.localStorage.setItem(COMPACT_HEIGHTS_KEY, JSON.stringify(all))
  } catch {}
}

export function getGroupKeywords (group) {
  return uniqueKeywords([group.name, ...(group.aliases || [])])
}

export function getGroupSearchKeywords (group, limit = Infinity) {
  const seen = new Set()
  const result = []
  getGroupKeywords(group).slice(0, limit).forEach((keyword) => {
    getKeywordSearchVariants(keyword).forEach((variant) => {
      const key = variant.toLocaleLowerCase()
      if (!key || seen.has(key)) return
      seen.add(key)
      result.push(variant)
    })
  })
  return result
}

export function extractGroupQuery (group, payload) {
  const value = typeof payload === 'string' ? payload.trim() : ''
  if (!value) return ''
  const lower = value.toLocaleLowerCase()
  const keyword = getGroupSearchKeywords(group)
    .map((entry) => entry.toLocaleLowerCase())
    .sort((left, right) => right.length - left.length)
    .find((entry) => lower.startsWith(entry))
  return keyword ? value.slice(keyword.length).trim() : value
}

export function getFeatureCommands (group) {
  return getGroupKeywords(group).slice(0, 5)
}

function hashFeatureVersion (value) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getGroupIdFromFeatureCode (code) {
  if (typeof code !== 'string' || !code.startsWith(FEATURE_PREFIX)) return ''
  const raw = code.slice(FEATURE_PREFIX.length)
  // 新功能编码带版本号，用于让 uTools 重新索引并刷新图标缓存
  const versioned = /^v[0-9a-f]{8}-(.+)$/i.exec(raw)
  return versioned ? versioned[1] : raw
}

export function removeGroupFeature (groupId) {
  if (
    !groupId ||
    typeof window.utools?.getFeatures !== 'function' ||
    typeof window.utools?.removeFeature !== 'function'
  ) {
    return
  }

  let features = []
  try {
    features = window.utools.getFeatures() || []
  } catch {
    return
  }

  features.forEach((feature) => {
    if (getGroupIdFromFeatureCode(feature.code) !== groupId) return
    try {
      window.utools.removeFeature(feature.code)
    } catch {}
  })
}

export function validateKeyword (value) {
  const keyword = typeof value === 'string' ? value.trim() : ''
  if (!keyword) return '请输入名称'
  if (keyword.length > MAX_KEYWORD_LENGTH) return `不能超过 ${MAX_KEYWORD_LENGTH} 个字符`
  if (/[\\/:*?"<>|\u0000-\u001F]/.test(keyword)) return '不能包含 \ / : * ? " < > |'
  if (!/[\p{L}\p{N}]/u.test(keyword)) return '至少包含一个文字或数字'
  return ''
}

export function validateGroupKeywords (groups, group) {
  if (!group.keywordMatch) return ''
  const keywords = getGroupKeywords(group)

  for (const keyword of keywords) {
    const key = keyword.toLocaleLowerCase()
    const reserved = MAIN_COMMANDS.find((command) => command.toLocaleLowerCase() === key)
    if (reserved) return `「${keyword}」与启动器入口指令重复`

    const owner = groups.find((other) => {
      if (other.id === group.id || !other.keywordMatch) return false
      return getGroupKeywords(other).some((item) => item.toLocaleLowerCase() === key)
    })
    if (owner) return `「${keyword}」已被分组「${owner.name}」使用`
  }

  return ''
}

let featureSyncChain = Promise.resolve()

function escapeRegExp (value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getKeywordSearchVariants (keyword) {
  const variants = new Set([keyword])
  if (!/[\u3400-\u9fff]/.test(keyword)) return [...variants]
  try {
    const full = pinyin(keyword, { toneType: 'none', type: 'array' }).join('')
    const initials = pinyin(keyword, { pattern: 'first', toneType: 'none', type: 'array' }).join('')
    if (full) variants.add(full)
    if (initials) variants.add(initials)
  } catch {}
  return [...variants]
}

async function runSyncGroupFeatures (groups, resolveIcon) {
  if (!window.utools?.setFeature) return null

  const desired = new Map()
  for (const group of groups) {
    if (!group.keywordMatch) continue
    const textCmds = getFeatureCommands(group)
    if (!textCmds.length) continue

    const cmds = [...textCmds]
    if (group.utoolsSearch) {
      // 功能指令是精确匹配，加空格不会触发；补充一个“关键词 + 空格 + 查询”的正则指令
      const variants = getGroupSearchKeywords(group, 5)
      const keywordPattern = variants.map(escapeRegExp).join('|')
      if (keywordPattern) {
        cmds.push({
          type: 'regex',
          label: `在「${group.name}」中搜索`,
          match: `/^(?:${keywordPattern})\\s[\\s\\S]*$/i`
        })
      }
    }

    let icon = ''
    try {
      icon = await resolveIcon?.(group)
    } catch {}
    const iconValue = icon || 'logo.png'
    const description = group.utoolsSearch
      ? group.name
      : (group.quickLaunch ? '一键启动' : '快捷启动')
    const cmdSignature = cmds.map((cmd) => (
      typeof cmd === 'string' ? cmd : `${cmd.type}:${cmd.label}:${cmd.match}`
    )).join('\u0000')
    const version = hashFeatureVersion([
      description,
      cmdSignature,
      group.quickLaunch ? '1' : '0',
      group.utoolsSearch ? '1' : '0',
      iconValue
    ].join('\u0001'))

    desired.set(`${FEATURE_PREFIX}v${version}-${group.id}`, {
      group,
      cmds,
      description,
      icon: iconValue
    })
  }

  const errors = []
  try {
    const dynamicFeatures = window.utools.getFeatures?.() || []
    dynamicFeatures
      .filter((feature) => feature.code?.startsWith(FEATURE_PREFIX))
      .forEach((feature) => {
        if (desired.has(feature.code)) return
        try {
          window.utools.removeFeature(feature.code)
        } catch (error) {
          errors.push(error?.message || '删除旧功能失败')
        }
      })
  } catch (error) {
    errors.push(error?.message || '读取动态功能失败')
  }

  for (const [code, { group, cmds, description, icon }] of desired) {
    try {
      // uTools 会按功能编码缓存图标，编码带版本号可确保修改图标后刷新
      window.utools.setFeature({
        code,
        description,
        icon,
        mainHide: Boolean(group.quickLaunch),
        mainPush: Boolean(group.utoolsSearch),
        cmds
      })
    } catch (error) {
      errors.push(error?.message || `更新「${group.name}」的关键词失败`)
    }
  }

  return errors.length ? errors[0] : null
}

export function syncGroupFeatures (groups, resolveIcon) {
  const snapshot = groups
  const run = () => runSyncGroupFeatures(snapshot, resolveIcon)
  const result = featureSyncChain.then(run, run)
  featureSyncChain = result.catch(() => {})
  return result
}
