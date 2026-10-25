const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { pathToFileURL } = require('node:url')

let webUtils = null
let electronShell = null
try {
  const electron = require('electron')
  webUtils = electron.webUtils || null
  electronShell = electron.shell || null
} catch {}

// 冷启动时 uTools 可能在页面脚本执行前就触发进入事件，先在这里接住
const enterQueue = []
const enterListeners = new Set()
try {
  utools.onPluginEnter((action) => {
    if (!enterListeners.size) {
      enterQueue.push(action)
      if (enterQueue.length > 4) enterQueue.shift()
      return
    }
    enterListeners.forEach((listener) => {
      try {
        listener(action)
      } catch {}
    })
  })
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
      try {
        await fs.promises.access(targetPath)
      } catch {
        // 换设备后本地只有数据库附件，恢复到本地缓存供 uTools 搜索候选直接读取路径
        if (existing.length <= MAX_ICON_BYTES) {
          await fs.promises.writeFile(targetPath, Buffer.from(existing))
        }
      }
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

const PUSH_ICON_DIR_NAME = 'push-icons'

function getPushIconDir () {
  const dir = path.join(utools.getPluginLocalDataPath(), PUSH_ICON_DIR_NAME)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safePushIconName (name) {
  const value = String(name || '').replace(/[^\w.-]/g, '_').slice(0, 120)
  return value || randomUUID()
}

const REMOTE_ICON_TIMEOUT = 8000
const MAX_REMOTE_PAGE_BYTES = 1024 * 1024

function requestBuffer (targetUrl, { limit = MAX_ICON_BYTES, accept = '*/*' } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    const succeed = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }

    const follow = (url, redirects) => {
      let parsed
      try {
        parsed = new URL(url)
      } catch {
        fail(new Error('网址无效'))
        return
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        fail(new Error('仅支持 http/https 网址'))
        return
      }

      const client = parsed.protocol === 'https:' ? https : http
      const request = client.get(parsed, {
        headers: {
          accept,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) QuickLauncher/1.0'
        }
      }, (response) => {
        const status = Number(response.statusCode) || 0
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume()
          if (redirects <= 0) fail(new Error('重定向次数过多'))
          else follow(new URL(response.headers.location, parsed).href, redirects - 1)
          return
        }
        if (status < 200 || status >= 300) {
          response.resume()
          fail(new Error(`请求失败（${status}）`))
          return
        }

        const chunks = []
        let size = 0
        response.on('data', (chunk) => {
          size += chunk.length
          if (size > limit) {
            request.destroy()
            fail(new Error('文件过大'))
            return
          }
          chunks.push(chunk)
        })
        response.on('error', fail)
        response.on('end', () => {
          let buffer = Buffer.concat(chunks)
          try {
            const encoding = String(response.headers['content-encoding'] || '').toLocaleLowerCase()
            if (encoding === 'gzip') buffer = zlib.gunzipSync(buffer)
            else if (encoding === 'deflate') buffer = zlib.inflateSync(buffer)
            else if (encoding === 'br') buffer = zlib.brotliDecompressSync(buffer)
          } catch {}
          succeed({
            buffer,
            contentType: String(response.headers['content-type'] || '').toLocaleLowerCase(),
            finalUrl: url
          })
        })
      })
      request.setTimeout(REMOTE_ICON_TIMEOUT, () => {
        request.destroy(new Error('请求超时'))
      })
      request.on('error', fail)
    }

    follow(targetUrl, 5)
  })
}

function detectImageMime (buffer) {
  if (!buffer?.length) return ''
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif'
  if (
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp'
  if (buffer[0] === 0x00 && buffer[1] === 0x00 && (buffer[2] === 0x01 || buffer[2] === 0x02) && buffer[3] === 0x00) {
    return 'image/x-icon'
  }
  const head = buffer.subarray(0, 512).toString('utf8').replace(/^\uFEFF/, '').trimStart().toLocaleLowerCase()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml'
  return ''
}

function extractIconLinks (html, baseUrl) {
  const links = []
  const seen = new Set()
  const tagPattern = /<link\b[^>]*>/gi
  let tag
  while ((tag = tagPattern.exec(html))) {
    const value = tag[0]
    const relMatch = /rel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(value)
    const rel = (relMatch?.[1] || relMatch?.[2] || relMatch?.[3] || '').toLocaleLowerCase()
    if (!rel.includes('icon')) continue

    const hrefMatch = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(value)
    const href = hrefMatch?.[1] || hrefMatch?.[2] || hrefMatch?.[3] || ''
    if (!href || /^data:/i.test(href)) continue

    let absolute = ''
    try {
      absolute = new URL(href, baseUrl).href
    } catch {
      continue
    }
    if (seen.has(absolute)) continue
    seen.add(absolute)

    const sizes = /sizes\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(value)
    const sizeValue = sizes?.[1] || sizes?.[2] || sizes?.[3] || ''
    const size = Math.max(0, ...sizeValue.split(/\s+/).map((entry) => Number(entry.split('x')[0]) || 0))
    let score = size >= 120 ? 3 : (size >= 64 ? 2 : 1)
    if (rel.includes('apple-touch-icon')) score += 2
    if (/\.svg(?:[?#]|$)/i.test(absolute)) score += 1
    links.push({ url: absolute, score })
  }
  return links.sort((left, right) => right.score - left.score).map((entry) => entry.url)
}

async function fetchSiteIcon (pageUrl) {
  let parsed
  try {
    parsed = new URL(pageUrl)
  } catch {
    return { ok: false, error: '请输入有效的网址' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: '仅支持 http/https 网址' }
  }
  parsed.hash = ''

  const candidates = []
  try {
    const page = await requestBuffer(parsed.href, {
      limit: MAX_REMOTE_PAGE_BYTES,
      accept: 'text/html,application/xhtml+xml'
    })
    candidates.push(...extractIconLinks(page.buffer.toString('utf8'), page.finalUrl))
  } catch {}

  candidates.push(new URL('/favicon.ico', parsed).href)
  candidates.push(new URL('/favicon.png', parsed).href)

  for (const url of [...new Set(candidates)]) {
    try {
      const icon = await requestBuffer(url, { accept: 'image/*,*/*;q=0.8' })
      if (!icon.buffer.length || icon.buffer.length > MAX_ICON_BYTES) continue
      const mime = detectImageMime(icon.buffer)
      if (!mime) continue
      return { ok: true, dataUrl: toDataUrl(icon.buffer, mime), mime, sourceUrl: url }
    } catch {}
  }

  return { ok: false, error: '未能获取该网站的图标，请尝试导入本地图标' }
}

const BROWSER_MODE_IDS = [
  'default',
  'ie',
  'safari',
  'edge',
  'edge-private',
  'chrome',
  'chrome-app',
  'chrome-incognito',
  'firefox',
  'firefox-private',
  'ubrowser'
]

function programFilesPaths (...parts) {
  return [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, ...parts),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], ...parts),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, ...parts)
  ].filter(Boolean)
}

const BROWSER_EXECUTABLES = {
  chrome: [
    ...programFilesPaths('Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ],
  edge: [
    ...programFilesPaths('Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ],
  firefox: [
    ...programFilesPaths('Mozilla Firefox', 'firefox.exe'),
    '/Applications/Firefox.app/Contents/MacOS/firefox'
  ],
  ie: programFilesPaths('Internet Explorer', 'iexplore.exe')
}

function browserKeyForMode (mode) {
  if (mode === 'ie' || mode === 'safari') return mode
  if (mode.startsWith('chrome')) return 'chrome'
  if (mode.startsWith('edge')) return 'edge'
  if (mode.startsWith('firefox')) return 'firefox'
  return ''
}

function findBrowserExecutable (mode) {
  const key = browserKeyForMode(mode)
  if (!key) return ''
  if (key === 'safari') return process.platform === 'darwin' ? 'safari' : ''
  const candidates = BROWSER_EXECUTABLES[key] || []
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate
    } catch {}
  }
  return ''
}

function browserArgsForMode (mode, url) {
  if (mode === 'edge-private') return ['--inprivate', url]
  if (mode === 'chrome-app') return [`--app=${url}`]
  if (mode === 'chrome-incognito') return ['--incognito', url]
  if (mode === 'firefox-private') return ['-private-window', url]
  return [url]
}

function spawnDetached (filePath, args) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(filePath, args, { detached: true, stdio: 'ignore' })
    } catch (error) {
      resolve(error?.message || '无法启动浏览器')
      return
    }
    child.once('error', (error) => {
      resolve(error?.message || '无法启动浏览器')
    })
    child.once('spawn', () => {
      child.unref()
      resolve('')
    })
  })
}

async function openUrlWithBrowser (pageUrl, mode) {
  if (!isValidPath(pageUrl) || !/^https?:\/\//i.test(pageUrl)) {
    return '网址无效'
  }
  const normalizedMode = BROWSER_MODE_IDS.includes(mode) ? mode : 'default'

  if (normalizedMode === 'ubrowser') {
    try {
      const ubrowser = utools?.ubrowser
      if (typeof ubrowser?.goto !== 'function') return '当前环境不支持 ubrowser'
      const task = ubrowser.goto(pageUrl).run()
      task?.catch?.(() => {})
      return ''
    } catch {
      return 'ubrowser 打开失败'
    }
  }

  if (normalizedMode === 'safari') {
    if (process.platform !== 'darwin') return '当前系统不支持 Safari'
    return spawnDetached('open', ['-a', 'Safari', pageUrl])
  }

  const executable = findBrowserExecutable(normalizedMode)
  if (!executable) {
    const names = { ie: 'IE', edge: 'Edge', chrome: 'Chrome', firefox: 'Firefox' }
    return `未找到 ${names[browserKeyForMode(normalizedMode)] || '浏览器'}`
  }
  return spawnDetached(executable, browserArgsForMode(normalizedMode, pageUrl))
}

function resolveWindowsShortcut (shortcutPath) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32' || !/\.lnk$/i.test(shortcutPath)) {
      resolve(null)
      return
    }

    try {
      if (typeof electronShell?.readShortcutLink === 'function') {
        const info = electronShell.readShortcutLink(shortcutPath)
        if (info?.target) {
          resolve({
            targetPath: info.target,
            arguments: info.args || '',
            workingDirectory: info.workingDirectory || ''
          })
          return
        }
      }
    } catch {}

    const script = [
      "$ProgressPreference = 'SilentlyContinue'",
      "$ErrorActionPreference = 'Stop'",
      '$shell = New-Object -ComObject WScript.Shell',
      '$shortcut = $shell.CreateShortcut($env:QL_SHORTCUT_PATH)',
      '$target = $shortcut.TargetPath',
      'if ($target) { $target = [Environment]::ExpandEnvironmentVariables($target) }',
      '[pscustomobject]@{ path = $target; arguments = $shortcut.Arguments; workingDirectory = $shortcut.WorkingDirectory } | ConvertTo-Json -Compress',
      'exit 0'
    ].join('\r\n')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    let child
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        env: { ...process.env, QL_SHORTCUT_PATH: shortcutPath }
      })
    } catch {
      resolve(null)
      return
    }

    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish(null)
    }, 5000)
    let stdout = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.once('error', () => {
      clearTimeout(timer)
      finish(null)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code !== 0 || !stdout.trim()) {
        finish(null)
        return
      }
      try {
        const data = JSON.parse(stdout.replace(/^\uFEFF/, '').trim())
        finish({
          targetPath: typeof data.path === 'string' ? data.path : '',
          arguments: typeof data.arguments === 'string' ? data.arguments : '',
          workingDirectory: typeof data.workingDirectory === 'string' ? data.workingDirectory : ''
        })
      } catch {
        finish(null)
      }
    })
  })
}

async function describePath (targetPath) {
  let effectivePath = targetPath
  let name = path.basename(targetPath)
  if (process.platform === 'win32' && /\.lnk$/i.test(targetPath)) {
    const shortcut = await resolveWindowsShortcut(targetPath)
    if (shortcut?.targetPath && !shortcut.arguments.trim()) {
      effectivePath = shortcut.targetPath
      name = path.basename(targetPath, path.extname(targetPath))
    }
  }
  try {
    const stats = await fs.promises.stat(effectivePath)
    return {
      path: effectivePath,
      name,
      isDirectory: stats.isDirectory()
    }
  } catch {
    return {
      path: effectivePath,
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
  onPluginEnter: (listener) => {
    if (typeof listener !== 'function') return () => {}
    enterListeners.add(listener)
    enterQueue.splice(0).forEach((action) => {
      try {
        listener(action)
      } catch {}
    })
    return () => enterListeners.delete(listener)
  },

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

  checkPaths: async (paths) => {
    if (!Array.isArray(paths)) return { invalid: [] }
    const unique = [...new Set(paths.filter((item) => isValidPath(item)))]
    const invalid = []
    await Promise.all(unique.map(async (itemPath) => {
      let targetPath = itemPath
      if (process.platform === 'win32' && /\.lnk$/i.test(itemPath)) {
        const shortcut = await resolveWindowsShortcut(itemPath)
        if (shortcut?.targetPath) targetPath = shortcut.targetPath
      }
      try {
        await fs.promises.access(targetPath)
      } catch {
        invalid.push(itemPath)
      }
    }))
    return { invalid }
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
      title: '添加目录',
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

  listBrowsers: async () => (
    BROWSER_MODE_IDS.filter((id) => {
      if (id === 'default') return true
      if (id === 'ubrowser') return typeof utools?.ubrowser?.goto === 'function'
      if (id === 'safari') return process.platform === 'darwin'
      return Boolean(findBrowserExecutable(id))
    })
  ),

  openUrlWithBrowser: async (pageUrl, mode) => {
    try {
      return await openUrlWithBrowser(pageUrl, mode)
    } catch (error) {
      return error?.message || '无法打开网址'
    }
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
      let icon = ''
      try {
        icon = await utools.getFileIconAsync(item)
      } catch {}
      if (!icon) {
        try {
          const stats = await fs.promises.stat(item)
          if (stats.isDirectory()) {
            icon = await utools.getFileIconAsync('folder')
          } else {
            const ext = path.extname(item)
            if (ext) icon = await utools.getFileIconAsync(ext)
          }
        } catch {}
      }
      return [item, icon || '']
    }))
    return Object.fromEntries(entries.filter(([, icon]) => Boolean(icon)))
  },

  selectCustomIcon: async (title) => {
    try {
      const selected = utools.showOpenDialog({
        title: typeof title === 'string' && title.trim() ? title.trim() : '选择分组图标',
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

  fetchSiteIcon: async (pageUrl) => {
    try {
      return await fetchSiteIcon(pageUrl)
    } catch (error) {
      return { ok: false, error: error?.message || '获取图标失败' }
    }
  },

  savePushIcon: async (name, dataUrl) => {
    try {
      const match = /^data:image\/png;base64,([a-z0-9+/=\s]+)$/i.exec(
        typeof dataUrl === 'string' ? dataUrl : ''
      )
      if (!match) return { ok: false }
      const buffer = Buffer.from(match[1], 'base64')
      if (!buffer.length || buffer.length > MAX_ICON_BYTES) return { ok: false }
      const filePath = path.join(getPushIconDir(), `${safePushIconName(name)}.png`)
      await fs.promises.writeFile(filePath, buffer)
      return { ok: true, url: pathToFileURL(filePath).href }
    } catch {
      return { ok: false }
    }
  },

  getPushIconUrl: (name) => {
    try {
      const filePath = path.join(getPushIconDir(), `${safePushIconName(name)}.png`)
      if (!fs.statSync(filePath).isFile()) return ''
      return pathToFileURL(filePath).href
    } catch {
      return ''
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
