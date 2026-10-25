export const GROUPS_KEY = 'quick-launcher:groups'
export const VIEW_KEY = 'quick-launcher:view'
export const THEME_KEY = 'quick-launcher:theme-mode'
export const WINDOW_HEIGHT_KEY = 'quick-launcher:full-height'
export const FEATURE_PREFIX = 'launcher-group-'
export const DEFAULT_ICON = 'folder'
export const DEFAULT_COLOR = '#1276C5'
export const DEFAULT_THEME = 'auto'
export const DEFAULT_FULL_HEIGHT = 700
export const THEME_MODES = ['auto', 'light', 'dark']
export const MAX_KEYWORD_LENGTH = 24
export const MAX_ALIASES = 4
export const MAX_ICON_RADIUS = 50
export const MAIN_PUSH_LIMIT = 5
export const BACKUP_VERSION = 1

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
    utoolsSearch: false,
    customIconRef: null,
    customIconRadius: 0,
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
  return {
    id: createId(),
    type: isDirectory && !isApp ? ITEM_TYPES.FOLDER : (isApp ? ITEM_TYPES.APP : ITEM_TYPES.FILE),
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

  const supportsOpenWith = type === ITEM_TYPES.FILE ||
    type === ITEM_TYPES.FOLDER ||
    type === ITEM_TYPES.URL

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
  const keywordMatch = Boolean(group.keywordMatch)
  const quickLaunch = keywordMatch && Boolean(group.quickLaunch)
  const utoolsSearch = keywordMatch && !quickLaunch && Boolean(group.utoolsSearch)
  const radiusValue = Number(group.customIconRadius)
  const customIconRadius = Number.isFinite(radiusValue)
    ? Math.min(MAX_ICON_RADIUS, Math.max(0, Math.round(radiusValue)))
    : 0

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
    items: Array.isArray(group.items) ? group.items.map(normalizeItem).filter(Boolean) : []
  }
}

export function parseBackup (value) {
  const list = Array.isArray(value) ? value : value?.groups
  if (!Array.isArray(list)) return { ok: false, error: '配置文件格式无效' }

  const groups = []
  for (const entry of list) {
    const normalized = normalizeGroup(entry)
    if (!normalized || validateKeyword(normalized.name)) continue
    const customIcon = typeof entry.customIcon === 'string' &&
      /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/i.test(entry.customIcon)
      ? entry.customIcon
      : ''
    groups.push({
      ...normalized,
      customIcon,
      customIconRef: customIcon ? null : normalized.customIconRef
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
    const { __imported, customIcon, ...candidate } = group
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

export function getGroupKeywords (group) {
  return uniqueKeywords([group.name, ...(group.aliases || [])])
}

export function extractGroupQuery (group, payload) {
  const value = typeof payload === 'string' ? payload.trim() : ''
  if (!value) return ''
  const lower = value.toLocaleLowerCase()
  const keyword = getGroupKeywords(group)
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

async function runSyncGroupFeatures (groups, resolveIcon) {
  if (!window.utools?.setFeature) return null

  const desired = new Map()
  for (const group of groups) {
    if (!group.keywordMatch) continue
    const cmds = getFeatureCommands(group)
    if (!cmds.length) continue

    let icon = ''
    try {
      icon = await resolveIcon?.(group)
    } catch {}
    const iconValue = icon || 'logo.png'
    const description = group.utoolsSearch
      ? group.name
      : (group.quickLaunch ? '一键启动' : '快捷启动')
    const version = hashFeatureVersion([
      description,
      cmds.join('\u0000'),
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
