export const GROUPS_KEY = 'quick-launcher:groups'
export const VIEW_KEY = 'quick-launcher:view'
export const THEME_KEY = 'quick-launcher:theme'
export const FEATURE_PREFIX = 'launcher-group-'
export const DEFAULT_ICON = 'folder'
export const DEFAULT_COLOR = '#1276C5'
export const MAX_KEYWORD_LENGTH = 24
export const MAX_ALIASES = 4

export const ITEM_TYPES = {
  FILE: 'file',
  FOLDER: 'folder',
  URL: 'url',
  PLUGIN: 'plugin',
  APP: 'app'
}

export const VIEW_MODES = ['grid', 'list', 'compact']
export const DEFAULT_VIEW = 'grid'

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
    customIconRef: null,
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

function getApplicationName (targetPath, fallback) {
  const raw = typeof fallback === 'string' && fallback.trim()
    ? fallback.trim()
    : (targetPath.split(/[\\/]/).filter(Boolean).pop() || targetPath)
  return raw.replace(/\.(exe|lnk|bat|cmd|com|app)$/i, '').replace(/\s*-\s*(快捷方式|shortcut)$/i, '').trim() || raw
}

export function createFileItem (described) {
  const isDirectory = Boolean(described.isDirectory)
  const isApp = !isDirectory && isApplicationPath(described.path)
  return {
    id: createId(),
    type: isDirectory ? ITEM_TYPES.FOLDER : (isApp ? ITEM_TYPES.APP : ITEM_TYPES.FILE),
    path: described.path,
    name: isApp ? getApplicationName(described.path, described.name) : described.name,
    openWith: '',
    command: ''
  }
}

export function createAppItem (application) {
  return {
    id: createId(),
    type: ITEM_TYPES.APP,
    path: application.path,
    name: getApplicationName(application.path, application.name),
    openWith: '',
    command: ''
  }
}

export function createUrlItem (url, name) {
  return {
    id: createId(),
    type: ITEM_TYPES.URL,
    path: url,
    name: typeof name === 'string' && name.trim() ? name.trim() : getUrlDisplayName(url),
    openWith: '',
    command: ''
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
    command: cmd
  }
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

function normalizeItem (item) {
  if (!item) return null

  const fallbackType = item.isDirectory ? ITEM_TYPES.FOLDER : ITEM_TYPES.FILE
  const type = Object.values(ITEM_TYPES).includes(item.type) ? item.type : fallbackType
  const target = typeof item.path === 'string' ? item.path.trim() : ''
  if (!target) return null

  let name = typeof item.name === 'string' ? item.name.trim() : ''
  if (!name) {
    if (type === ITEM_TYPES.URL) name = getUrlDisplayName(target)
    else if (type === ITEM_TYPES.PLUGIN) name = target
    else if (type === ITEM_TYPES.APP) name = getApplicationName(target)
    else name = target.split(/[\\/]/).filter(Boolean).pop() || target
  }

  const supportsOpenWith = type === ITEM_TYPES.FILE || type === ITEM_TYPES.FOLDER

  return {
    id: typeof item.id === 'string' && item.id ? item.id : createId(),
    type,
    path: target,
    name,
    openWith: supportsOpenWith && typeof item.openWith === 'string' ? item.openWith : '',
    command: type === ITEM_TYPES.PLUGIN
      ? (typeof item.command === 'string' && item.command.trim() ? item.command.trim() : target)
      : ''
  }
}

function normalizeGroup (group) {
  if (!group || typeof group !== 'object') return null
  const name = typeof group.name === 'string' ? group.name.trim() : ''
  if (!name) return null

  return {
    id: typeof group.id === 'string' && group.id ? group.id : createId(),
    name,
    aliases: uniqueKeywords(Array.isArray(group.aliases) ? group.aliases : []).slice(0, MAX_ALIASES),
    icon: typeof group.icon === 'string' && group.icon ? group.icon : DEFAULT_ICON,
    color: /^#[0-9a-f]{6}$/i.test(group.color) ? group.color : DEFAULT_COLOR,
    keywordMatch: Boolean(group.keywordMatch),
    quickLaunch: Boolean(group.quickLaunch),
    customIconRef: typeof group.customIconRef === 'string' && group.customIconRef ? group.customIconRef : null,
    items: Array.isArray(group.items) ? group.items.map(normalizeItem).filter(Boolean) : []
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

export function loadThemeMode () {
  try {
    const stored = window.utools?.dbStorage?.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {}
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
}

export function saveThemeMode (mode) {
  if (mode !== 'dark' && mode !== 'light') return
  try {
    window.utools?.dbStorage?.setItem(THEME_KEY, mode)
  } catch {}
  try {
    window.localStorage.setItem(THEME_KEY, mode)
  } catch {}
}

export function getGroupKeywords (group) {
  return uniqueKeywords([group.name, ...(group.aliases || [])])
}

export function getFeatureCommands (group) {
  return getGroupKeywords(group).slice(0, 5)
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

export function syncGroupFeatures (groups, resolveIcon) {
  if (!window.utools?.setFeature) return null

  try {
    const dynamicFeatures = window.utools.getFeatures?.() || []
    dynamicFeatures
      .filter((feature) => feature.code?.startsWith(FEATURE_PREFIX))
      .forEach((feature) => window.utools.removeFeature(feature.code))

    groups.forEach((group) => {
      if (!group.keywordMatch) return
      const cmds = getFeatureCommands(group)
      if (!cmds.length) return

      window.utools.setFeature({
        code: `${FEATURE_PREFIX}${group.id}`,
        description: group.quickLaunch ? '一键启动' : '快捷启动',
        icon: resolveIcon?.(group) || 'logo.png',
        mainHide: Boolean(group.quickLaunch),
        cmds
      })
    })
    return null
  } catch (error) {
    return error?.message || '关键词功能同步失败'
  }
}
