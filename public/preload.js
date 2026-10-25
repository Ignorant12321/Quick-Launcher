const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')

let webUtils = null
try {
  webUtils = require('electron').webUtils || null
} catch {}

const ICON_DIR_NAME = 'icons'
const ICON_DB_PREFIX = 'quick-launcher-icon/'
const MAX_ICON_BYTES = 2 * 1024 * 1024
const MAX_BACKUP_BYTES = 32 * 1024 * 1024
const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

function getIconDir () {
  const dir = path.join(utools.getPluginLocalDataPath(), ICON_DIR_NAME)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeIconPath (ref) {
  if (typeof ref !== 'string' || path.basename(ref) !== ref || !/^[\w.-]+$/.test(ref)) {
    return null
  }
  return path.join(getIconDir(), ref)
}

function imageType (filePath) {
  return IMAGE_TYPES[path.extname(filePath).toLowerCase()] || ''
}

function toDataUrl (buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`
}

function isValidPath (value) {
  return typeof value === 'string' && value.trim().length > 0
}

// 自定义图标本体存 uTools 数据库附件以参与同步，本地文件只作为缓存。
function iconAttachmentId (ref) {
  return `${ICON_DB_PREFIX}${ref}`
}

function hasIconAttachmentApi () {
  return typeof utools !== 'undefined' &&
    Boolean(utools?.db?.promises?.getAttachment && utools?.db?.promises?.postAttachment)
}

const iconSynced = new Set()
const iconSyncing = new Set()
const iconDownloadTasks = new Map()

async function postIconAttachment (ref, buffer, mime) {
  if (!hasIconAttachmentApi()) return false
  try {
    const result = await utools.db.promises.postAttachment(iconAttachmentId(ref), buffer, mime)
    return Boolean(result?.ok)
  } catch {
    return false
  }
}

async function ensureIconAttachment (ref) {
  if (!hasIconAttachmentApi() || iconSynced.has(ref) || iconSyncing.has(ref)) return
  const targetPath = safeIconPath(ref)
  const mime = targetPath ? imageType(targetPath) : ''
  if (!targetPath || !mime) return

  iconSyncing.add(ref)
  try {
    const existing = await utools.db.promises.getAttachment(iconAttachmentId(ref))
    if (existing?.length) {
      iconSynced.add(ref)
      return
    }
    const buffer = await fs.promises.readFile(targetPath)
    if (buffer.length && await postIconAttachment(ref, buffer, mime)) {
      iconSynced.add(ref)
    }
  } catch {
  } finally {
    iconSyncing.delete(ref)
  }
}

async function ensureCustomIconsSynced (refs) {
  if (!Array.isArray(refs) || !hasIconAttachmentApi()) return
  const unique = [...new Set(refs.filter((ref) => typeof ref === 'string' && ref))]
  await Promise.all(unique.map(ensureIconAttachment))
}

async function readIconAttachment (ref) {
  if (!hasIconAttachmentApi()) return null
  if (iconDownloadTasks.has(ref)) return iconDownloadTasks.get(ref)

  const task = (async () => {
    try {
      const targetPath = safeIconPath(ref)
      const mime = targetPath ? imageType(targetPath) : ''
      if (!targetPath || !mime) return null
      const data = await utools.db.promises.getAttachment(iconAttachmentId(ref))
      if (!data?.length) return null
      const buffer = Buffer.from(data)
      if (buffer.length > MAX_ICON_BYTES) return null
      await fs.promises.writeFile(targetPath, buffer)
      return toDataUrl(buffer, mime)
    } catch {
      return null
    } finally {
      iconDownloadTasks.delete(ref)
    }
  })()

  iconDownloadTasks.set(ref, task)
  return task
}

async function readCustomIcon (ref) {
  const targetPath = safeIconPath(ref)
  if (!targetPath) return null
  const mime = imageType(targetPath)
  if (!mime) return null
  try {
    const buffer = await fs.promises.readFile(targetPath)
    return toDataUrl(buffer, mime)
  } catch {}
  return readIconAttachment(ref)
}

async function readImageFile (filePath) {
  const mime = imageType(filePath)
  if (!mime) {
    throw new Error('请选择 PNG、JPG、WebP 或 SVG 图片')
  }
  const stats = await fs.promises.stat(filePath)
  if (!stats.isFile()) {
    throw new Error('请选择一个图片文件')
  }
  if (stats.size > MAX_ICON_BYTES) {
    throw new Error('图片不能超过 2 MB')
  }
  const buffer = await fs.promises.readFile(filePath)
  return { dataUrl: toDataUrl(buffer, mime), mime }
}

async function describePath (targetPath) {
  const name = path.basename(targetPath) || targetPath
  try {
    const stats = await fs.promises.stat(targetPath)
    return {
      path: targetPath,
      name,
      isDirectory: stats.isDirectory()
    }
  } catch {
    return {
      path: targetPath,
      name,
      isDirectory: false,
      error: true
    }
  }
}

function openWithShortcut (targetPath, shortcutPath) {
  return new Promise((resolve) => {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($env:QL_OPEN_WITH_APP)",
      '$exe = $shortcut.TargetPath',
      'if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { exit 3 }',
      '$argumentLine = @()',
      'if ($shortcut.Arguments) { $argumentLine += $shortcut.Arguments }',
      "$argumentLine += ('\"' + $env:QL_OPEN_WITH_TARGET + '\"')",
      'if ($shortcut.WorkingDirectory -and (Test-Path -LiteralPath $shortcut.WorkingDirectory)) {',
      "  Start-Process -FilePath $exe -WorkingDirectory $shortcut.WorkingDirectory -ArgumentList ($argumentLine -join ' ')",
      '} else {',
      "  Start-Process -FilePath $exe -ArgumentList ($argumentLine -join ' ')",
      '}',
      'exit 0'
    ].join('\r\n')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    let child
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        stdio: 'ignore',
        windowsHide: true,
        env: {
          ...process.env,
          QL_OPEN_WITH_APP: shortcutPath,
          QL_OPEN_WITH_TARGET: targetPath
        }
      })
    } catch (error) {
      resolve(error.message || '无法通过快捷方式启动')
      return
    }

    child.once('error', (error) => {
      resolve(error.message || '无法通过快捷方式启动')
    })
    child.once('close', (code) => {
      if (code === 0) {
        resolve('')
        return
      }
      resolve(code === 3 ? '快捷方式指向的程序不存在' : '无法通过所选快捷方式启动')
    })
  })
}

function openWithApplication (targetPath, appPath) {
  if (process.platform === 'win32' && /\.lnk$/i.test(appPath)) {
    return openWithShortcut(targetPath, appPath)
  }

  return new Promise((resolve) => {
    let child
    try {
      if (process.platform === 'darwin' && appPath.toLowerCase().endsWith('.app')) {
        child = spawn('open', ['-a', appPath, targetPath], { detached: true, stdio: 'ignore' })
      } else {
        child = spawn(appPath, [targetPath], { detached: true, stdio: 'ignore' })
      }
    } catch (error) {
      resolve(error.message || '无法启动所选应用')
      return
    }

    child.once('error', (error) => {
      resolve(error.message || '无法启动所选应用')
    })
    child.once('spawn', () => {
      child.unref()
      resolve('')
    })
  })
}

function align4 (value) {
  return (value + 3) & ~3
}

function asarMime (filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.ico') return 'image/x-icon'
  return 'application/octet-stream'
}

function openAsar (filePath) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const probe = Buffer.alloc(32)
    fs.readSync(fd, probe, 0, 32, 0)

    // uTools 的 asar 头在 Pickle 外层多包了一层，JSON 从第 16 字节开始。
    // 同时兼容标准 asar（JSON 从第 8 字节开始）的读取方式。
    let jsonStart = 16
    let jsonLength = probe.readUInt32LE(12)
    if (!(jsonLength > 0 && probe[16] === 0x7B)) {
      jsonStart = 8
      jsonLength = probe.readUInt32LE(4)
    }
    if (!(jsonLength > 0 && probe[jsonStart] === 0x7B)) {
      throw new Error('无法读取 asar 头')
    }

    const headerBuffer = Buffer.alloc(jsonLength)
    fs.readSync(fd, headerBuffer, 0, jsonLength, jsonStart)
    const header = JSON.parse(headerBuffer.toString('utf8'))
    return {
      fd,
      header,
      baseOffset: jsonStart + align4(jsonLength)
    }
  } catch (error) {
    fs.closeSync(fd)
    throw error
  }
}

function getAsarEntry (files, parts) {
  let node = { files }
  for (const part of parts) {
    if (!node?.files?.[part]) return null
    node = node.files[part]
  }
  return node
}

function readAsarEntry (archive, entry, maxBytes = 4 * 1024 * 1024) {
  if (!entry || entry.size == null || entry.offset == null) return null
  const size = Number(entry.size)
  if (!Number.isFinite(size) || size < 0 || size > maxBytes) return null
  const buffer = Buffer.alloc(size)
  if (size > 0) {
    fs.readSync(archive.fd, buffer, 0, size, archive.baseOffset + Number(entry.offset))
  }
  return buffer
}

function findPluginJson (files, prefix = [], depth = 0) {
  if (!files || depth > 2) return null
  if (files['plugin.json']) {
    return { entry: files['plugin.json'], dirParts: prefix }
  }
  for (const [name, node] of Object.entries(files)) {
    if (name === 'node_modules' || !node?.files) continue
    const found = findPluginJson(node.files, [...prefix, name], depth + 1)
    if (found) return found
  }
  return null
}

function resolveAsarParts (dirParts, relativePath) {
  const parts = [...dirParts]
  String(relativePath || '').replace(/\\/g, '/').split('/').forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') {
      parts.pop()
      return
    }
    parts.push(part)
  })
  return parts
}

function readPluginLogo (archive, dirParts, logoPath) {
  if (typeof logoPath !== 'string' || !logoPath.trim()) return ''
  try {
    const parts = resolveAsarParts(dirParts, logoPath)
    const entry = getAsarEntry(archive.header.files, parts)
    const buffer = readAsarEntry(archive, entry)
    if (!buffer?.length) return ''
    return toDataUrl(buffer, asarMime(parts[parts.length - 1]))
  } catch {
    return ''
  }
}

function getPluginDirectories () {
  const home = os.homedir()
  const candidates = []

  try {
    if (typeof utools !== 'undefined' && typeof utools.getPath === 'function') {
      const logsPath = utools.getPath('logs')
      if (logsPath) {
        candidates.push(path.join(path.dirname(logsPath), 'plugins'))
      }
    }
  } catch {}

  if (process.platform === 'win32') {
    if (process.env.APPDATA) {
      candidates.push(path.join(process.env.APPDATA, 'uTools', 'plugins'))
      candidates.push(path.join(process.env.APPDATA, 'utools', 'plugins'))
    }
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'uTools', 'plugins'))
      candidates.push(path.join(process.env.LOCALAPPDATA, 'utools', 'plugins'))
    }
    candidates.push(path.join(home, 'AppData', 'Roaming', 'uTools', 'plugins'))
  } else if (process.platform === 'darwin') {
    candidates.push(path.join(home, 'Library', 'Application Support', 'uTools', 'plugins'))
    candidates.push(path.join(home, 'Library', 'Application Support', 'utools', 'plugins'))
  } else {
    candidates.push(path.join(home, '.config', 'uTools', 'plugins'))
    candidates.push(path.join(home, '.config', 'utools', 'plugins'))
  }

  return [...new Set(candidates)].filter((dir) => {
    try {
      return fs.statSync(dir).isDirectory()
    } catch {
      return false
    }
  })
}

function pluginCommands (features) {
  const commands = []
  const seen = new Set()
  for (const feature of Array.isArray(features) ? features : []) {
    const cmds = Array.isArray(feature?.cmds) ? feature.cmds : []
    for (const command of cmds) {
      const value = typeof command === 'string' ? command : command?.label
      if (typeof value !== 'string' || !value.trim()) continue
      const key = value.trim().toLocaleLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      commands.push(value.trim())
    }
  }
  return commands
}

function scanPluginArchiveViaFs (filePath) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(filePath, 'plugin.json'), 'utf8'))
    const pluginName = typeof json.pluginName === 'string' && json.pluginName.trim()
      ? json.pluginName.trim()
      : (typeof json.name === 'string' ? json.name.trim() : '')
    if (!pluginName) return null

    let logo = ''
    if (typeof json.logo === 'string' && json.logo.trim()) {
      try {
        const logoPath = path.join(filePath, json.logo.replace(/^[/\\]+/, ''))
        const buffer = fs.readFileSync(logoPath)
        if (buffer.length) logo = toDataUrl(buffer, asarMime(logoPath))
      } catch {}
    }

    return {
      id: typeof json.name === 'string' ? json.name : pluginName,
      pluginName,
      version: typeof json.version === 'string' ? json.version : '',
      description: typeof json.description === 'string' ? json.description : '',
      logo,
      commands: pluginCommands(json.features)
    }
  } catch {
    return null
  }
}

function scanPluginArchive (filePath) {
  const viaFs = scanPluginArchiveViaFs(filePath)
  if (viaFs) return viaFs

  const archive = openAsar(filePath)
  try {
    const pluginJson = findPluginJson(archive.header.files)
    if (!pluginJson) return null
    const buffer = readAsarEntry(archive, pluginJson.entry, 2 * 1024 * 1024)
    if (!buffer) return null
    const json = JSON.parse(buffer.toString('utf8'))
    const pluginName = typeof json.pluginName === 'string' && json.pluginName.trim()
      ? json.pluginName.trim()
      : (typeof json.name === 'string' ? json.name.trim() : '')
    if (!pluginName) return null

    return {
      id: typeof json.name === 'string' ? json.name : pluginName,
      pluginName,
      version: typeof json.version === 'string' ? json.version : '',
      description: typeof json.description === 'string' ? json.description : '',
      logo: readPluginLogo(archive, pluginJson.dirParts, json.logo),
      commands: pluginCommands(json.features)
    }
  } finally {
    fs.closeSync(archive.fd)
  }
}

let pluginCache = null
let pluginCacheAt = 0

function scanInstalledPlugins () {
  const dirs = getPluginDirectories()
  if (!dirs.length) {
    return { ok: false, error: '未找到 uTools 插件目录', plugins: [] }
  }

  const plugins = new Map()
  for (const dir of dirs) {
    let files = []
    try {
      files = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.asar'))
    } catch {
      continue
    }

    for (const file of files) {
      try {
        const plugin = scanPluginArchive(path.join(dir, file))
        if (!plugin) continue
        const key = plugin.pluginName.toLocaleLowerCase()
        const previous = plugins.get(key)
        if (!previous || plugin.commands.length > previous.commands.length) {
          plugins.set(key, plugin)
        }
      } catch {}
    }
  }

  const list = [...plugins.values()].sort((left, right) => (
    left.pluginName.localeCompare(right.pluginName, 'zh-CN')
  ))
  return { ok: true, plugins: list, scannedDirs: dirs }
}

function cleanAppName (value) {
  return String(value || '')
    .replace(/\.lnk$/i, '')
    .replace(/\s*[-—]\s*(快捷方式|shortcut)$/i, '')
    .trim()
}

const APP_NOISE_PATTERNS = [
  /^(卸载|uninstall|remove|更新|升级|update|upgrade)/i,
  /^(documentation|readme|license|help|support|website|homepage)\b/i,
  /^(帮助|许可|官网|支持|反馈)$/i,
  /(官网|官方网站|主页|首页|website|homepage)$/i,
  /(帮助|help|支持|support)$/i,
  /(更新|update|升级|upgrade|卸载|uninstall|remove)$/i,
  /(许可证|license|许可协议)$/i,
  /(文档|documentation|readme|使用说明|用户手册|操作手册|说明书)$/i,
  /(反馈|feedback)$/i
]

function shouldSkipAppName (name) {
  if (!name) return true
  return APP_NOISE_PATTERNS.some((pattern) => pattern.test(name))
}

async function walkWindowsStartMenu (dir, depth, result, seen) {
  if (depth > 4) return
  let entries
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (/^(startup|启动)$/i.test(entry.name)) continue
      await walkWindowsStartMenu(fullPath, depth + 1, result, seen)
      continue
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.lnk')) continue

    const name = cleanAppName(entry.name)
    if (shouldSkipAppName(name)) continue
    const key = name.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ name, path: fullPath, kind: 'shortcut' })
  }
}

async function listMacApplications () {
  const roots = [
    '/Applications',
    path.join(os.homedir(), 'Applications')
  ]
  const result = []
  const seen = new Set()

  for (const root of roots) {
    let entries
    try {
      entries = await fs.promises.readdir(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.toLowerCase().endsWith('.app')) continue
      const name = entry.name.replace(/\.app$/i, '')
      const key = name.toLocaleLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ name, path: path.join(root, entry.name), kind: 'app' })
    }
  }
  return result
}

async function scanInstalledApps () {
  if (process.platform === 'darwin') {
    const apps = await listMacApplications()
    apps.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    return { ok: true, apps }
  }

  if (process.platform !== 'win32') {
    return { ok: false, error: '当前系统暂不支持自动扫描软件', apps: [] }
  }

  const roots = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.PROGRAMDATA && path.join(process.env.PROGRAMDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ].filter(Boolean)

  const apps = []
  const seen = new Set()
  for (const root of roots) {
    await walkWindowsStartMenu(root, 0, apps, seen)
  }
  apps.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  return { ok: true, apps }
}

let appCache = null
let appCacheAt = 0

window.services = {
  getPathForFile: (file) => {
    try {
      const filePath = webUtils?.getPathForFile?.(file)
      if (filePath) return filePath
    } catch {}
    return typeof file?.path === 'string' ? file.path : ''
  },

  describePaths: async (paths) => {
    if (!Array.isArray(paths)) return []
    const unique = [...new Set(paths.filter((item) => isValidPath(item)))]
    return Promise.all(unique.map(describePath))
  },

  pickFiles: () => {
    return utools.showOpenDialog({
      title: '添加快捷方式',
      buttonLabel: '添加',
      properties: ['openFile', 'multiSelections']
    }) || []
  },

  pickFolders: () => {
    return utools.showOpenDialog({
      title: '添加文件夹',
      buttonLabel: '添加',
      properties: ['openDirectory', 'multiSelections']
    }) || []
  },

  pickSoftware: () => {
    const isWindows = process.platform === 'win32'
    const isMac = process.platform === 'darwin'
    const options = {
      title: '选择软件',
      buttonLabel: '添加',
      properties: ['openFile', 'multiSelections']
    }
    if (isWindows) {
      options.filters = [
        { name: '程序与快捷方式', extensions: ['exe', 'lnk', 'bat', 'cmd', 'com'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    }
    if (isMac) {
      options.defaultPath = '/Applications'
    }
    return utools.showOpenDialog(options) || []
  },

  listInstalledApps: async (force = false) => {
    const now = Date.now()
    if (!force && appCache && now - appCacheAt < 60 * 1000) {
      return appCache
    }
    try {
      const result = await scanInstalledApps()
      appCache = result
      appCacheAt = now
      return result
    } catch (error) {
      return { ok: false, error: error?.message || '无法扫描已安装软件', apps: [] }
    }
  },

  listUtoolsPlugins: async (force = false) => {
    const now = Date.now()
    if (!force && pluginCache && now - pluginCacheAt < 20 * 1000) {
      return pluginCache
    }
    try {
      const result = scanInstalledPlugins()
      pluginCache = result
      pluginCacheAt = now
      return result
    } catch (error) {
      return { ok: false, error: error?.message || '无法读取 uTools 插件列表', plugins: [] }
    }
  },

  pickApplication: () => {
    const isWindows = process.platform === 'win32'
    const isMac = process.platform === 'darwin'
    const options = {
      title: '选择打开应用',
      buttonLabel: '选择',
      properties: ['openFile']
    }
    if (isWindows) {
      options.filters = [{ name: '可执行文件', extensions: ['exe'] }]
    }
    if (isMac) {
      options.defaultPath = '/Applications'
    }

    const selected = utools.showOpenDialog(options)
    if (!selected || !selected[0]) return null

    const appPath = selected[0]
    const baseName = path.basename(appPath)
    return {
      path: appPath,
      name: isMac ? baseName.replace(/\.app$/i, '') : baseName.replace(/\.[^.]+$/, '')
    }
  },

  saveBackup: async (content, defaultName) => {
    try {
      if (typeof content !== 'string') return { ok: false, error: '导出内容无效' }
      const selected = utools.showSaveDialog({
        title: '导出配置',
        buttonLabel: '导出',
        defaultPath: defaultName || 'quick-launcher-backup.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (!selected) return { ok: true, canceled: true }

      const targetPath = /\.json$/i.test(selected) ? selected : `${selected}.json`
      await fs.promises.writeFile(targetPath, content, 'utf8')
      return { ok: true, filePath: targetPath }
    } catch (error) {
      return { ok: false, error: error?.message || '导出失败' }
    }
  },

  loadBackup: async () => {
    try {
      const selected = utools.showOpenDialog({
        title: '导入配置',
        buttonLabel: '导入',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      })
      if (!selected || !selected[0]) return { ok: true, canceled: true }

      const stats = await fs.promises.stat(selected[0])
      if (!stats.isFile()) return { ok: false, error: '请选择 JSON 配置文件' }
      if (stats.size > MAX_BACKUP_BYTES) return { ok: false, error: '配置文件过大' }

      const content = await fs.promises.readFile(selected[0], 'utf8')
      return { ok: true, content, filePath: selected[0] }
    } catch (error) {
      return { ok: false, error: error?.message || '导入失败' }
    }
  },

  openPath: async (targetPath) => {
    if (!isValidPath(targetPath)) {
      return 'invalid-path'
    }
    return utools.shellOpenPath(targetPath)
  },

  openPathWith: async (targetPath, appPath) => {
    if (!isValidPath(targetPath) || !isValidPath(appPath)) {
      return 'invalid-path'
    }
    const isRemoteUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(targetPath)
    if (!isRemoteUrl) {
      try {
        await fs.promises.access(targetPath)
      } catch {
        return '目标文件不存在或无法访问'
      }
    }
    return openWithApplication(targetPath, appPath)
  },

  revealPath: (targetPath) => {
    if (isValidPath(targetPath)) {
      utools.shellShowItemInFolder(targetPath)
    }
  },

  runAsAdmin: async (targetPath) => {
    if (!isValidPath(targetPath)) return 'invalid-path'
    if (process.platform !== 'win32') return '仅支持 Windows'
    return new Promise((resolve) => {
      const escaped = targetPath.replace(/'/g, "''")
      const script = `Start-Process -FilePath '${escaped}' -Verb RunAs`
      try {
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        })
        child.once('error', (error) => {
          resolve(error.message || '无法以管理员身份运行')
        })
        child.once('spawn', () => {
          child.unref()
          resolve('')
        })
      } catch (error) {
        resolve(error.message || '无法以管理员身份运行')
      }
    })
  },

  getFileIcons: async (paths) => {
    if (!Array.isArray(paths)) return {}
    const unique = [...new Set(paths.filter((item) => isValidPath(item)))]
    const entries = await Promise.all(unique.map(async (item) => {
      try {
        const icon = await utools.getFileIconAsync(item)
        return [item, icon || '']
      } catch {
        return [item, '']
      }
    }))
    return Object.fromEntries(entries.filter(([, icon]) => Boolean(icon)))
  },

  selectCustomIcon: async () => {
    try {
      const selected = utools.showOpenDialog({
        title: '选择分组图标',
        buttonLabel: '使用图片',
        filters: [
          { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }
        ],
        properties: ['openFile']
      })
      if (!selected || !selected[0]) return null
      const { dataUrl } = await readImageFile(selected[0])
      return { ok: true, dataUrl }
    } catch (error) {
      return { ok: false, error: error.message || '无法读取图片' }
    }
  },

  importCustomIconData: async (dataUrl) => {
    try {
      const match = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([a-z0-9+/=\s]+)$/i
        .exec(typeof dataUrl === 'string' ? dataUrl : '')
      if (!match) throw new Error('图片数据无效')
      const buffer = Buffer.from(match[2], 'base64')
      if (!buffer.length) throw new Error('图片数据无效')
      if (buffer.length > MAX_ICON_BYTES) throw new Error('图片不能超过 2 MB')
      const ext = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
        'image/svg+xml': '.svg'
      }[match[1].toLowerCase()]
      const ref = `${randomUUID()}${ext}`
      await fs.promises.writeFile(path.join(getIconDir(), ref), buffer)
      await ensureIconAttachment(ref)
      return { ok: true, ref }
    } catch (error) {
      return { ok: false, error: error.message || '保存图片失败' }
    }
  },

  readCustomIcon,
  ensureCustomIconsSynced,

  deleteCustomIcon: async (ref) => {
    const targetPath = safeIconPath(ref)
    if (!targetPath) return false
    iconSynced.delete(ref)
    let deleted = false
    try {
      await fs.promises.unlink(targetPath)
      deleted = true
    } catch {}
    try {
      if (typeof utools?.db?.promises?.remove === 'function') {
        await utools.db.promises.remove(iconAttachmentId(ref))
      }
    } catch {}
    return deleted
  }
}
