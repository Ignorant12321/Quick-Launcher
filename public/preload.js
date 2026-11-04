const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const { spawn } = require('node:child_process')
const { randomUUID, createHash } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const { createFileIconLoader } = require('./fileIcons.cjs')
const { createPushIconIndex } = require('./pushIconIndex.cjs')

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
// 兜底 GC 的年龄门槛：只清「一周前就不再被引用」的本地图标，
// 避开刚导入、还没写进分组数据的图片，也避开多窗口/同步的中间态
const STALE_ICON_AGE_MS = 7 * 24 * 60 * 60 * 1000
// 背景图与图标共用同一套存储，但底图允许更大一些（大图前端会先压缩再落盘）
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
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
let lastRendererErrorAt = 0

function withIconTimeout (promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('图标附件操作超时')), 9000)
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

async function postIconAttachment (ref, buffer, mime) {
  if (!hasIconAttachmentApi()) return false
  try {
    const result = await withIconTimeout(utools.db.promises.postAttachment(iconAttachmentId(ref), buffer, mime))
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
    const existing = await withIconTimeout(utools.db.promises.getAttachment(iconAttachmentId(ref)))
    if (existing?.length) {
      iconSynced.add(ref)
      try {
        await fs.promises.access(targetPath)
      } catch {
        // 换设备后本地只有数据库附件，恢复到本地缓存供 uTools 搜索功能直接读取路径
        if (existing.length <= MAX_IMAGE_BYTES) {
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
      const data = await withIconTimeout(utools.db.promises.getAttachment(iconAttachmentId(ref)))
      if (!data?.length) return null
      const buffer = Buffer.from(data)
      if (buffer.length > MAX_IMAGE_BYTES) return null
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

function resolveMaxBytes (options) {
  const value = Number(options?.maxBytes)
  if (!Number.isFinite(value) || value <= 0) return MAX_ICON_BYTES
  return Math.min(value, MAX_IMAGE_BYTES)
}

function tooLargeMessage (maxBytes) {
  const mb = Math.max(1, Math.round(maxBytes / (1024 * 1024)))
  return `图片不能超过 ${mb} MB`
}

async function readImageFile (filePath, options) {
  const maxBytes = resolveMaxBytes(options)
  const mime = imageType(filePath)
  if (!mime) {
    throw new Error('请选择 PNG、JPG、WebP 或 SVG 图片')
  }
  const stats = await fs.promises.stat(filePath)
  if (!stats.isFile()) {
    throw new Error('请选择一个图片文件')
  }
  if (stats.size > maxBytes) {
    throw new Error(tooLargeMessage(maxBytes))
  }
  const buffer = await fs.promises.readFile(filePath)
  return { dataUrl: toDataUrl(buffer, mime), mime }
}

const PUSH_ICON_DIR_NAME = 'push-icons'
const pushIconIndex = createPushIconIndex(() => path.join(utools.getPluginLocalDataPath(), PUSH_ICON_DIR_NAME))
pushIconIndex.ready()

async function getPushIconDir () {
  const dir = path.join(utools.getPluginLocalDataPath(), PUSH_ICON_DIR_NAME)
  await fs.promises.mkdir(dir, { recursive: true })
  return dir
}

function safePushIconName (name) {
  const value = String(name || '').replace(/[^\w.-]/g, '_').slice(0, 120)
  return value || randomUUID()
}

// push-icons 里每个条目只该留一张 PNG（按 id + 图标签名命名）：
// 按修改时间保留最新的一张，其余同条目的旧图和已被删条目的孤儿一起回收，
// 用 mtime 而不是「名字等于当前签名」判断，可以躲开并发写入互相删对方的竞态
async function collectStalePushIcons (itemIds) {
  const dir = await getPushIconDir()
  const names = (await fs.promises.readdir(dir))
    .filter((name) => name.endsWith('.png') && name.startsWith('push-'))
  if (!names.length) return { dir, stale: [] }

  const prefixes = (Array.isArray(itemIds) ? itemIds : [])
    .map((id) => String(id || '').replace(/[^\w.-]/g, '_'))
    .filter(Boolean)
    .map((id) => `push-${id}-`)

  const entries = await Promise.all(names.map(async (name) => {
    try {
      const stats = await fs.promises.stat(path.join(dir, name))
      return { name, mtime: stats.mtimeMs }
    } catch {
      return null
    }
  }))

  const groups = new Map()
  const stale = []
  entries.filter(Boolean).forEach((entry) => {
    const prefix = prefixes.find((value) => entry.name.startsWith(value))
    if (!prefix) {
      stale.push(entry.name)
      return
    }
    const list = groups.get(prefix) || []
    list.push(entry)
    groups.set(prefix, list)
  })
  groups.forEach((list) => {
    list.sort((a, b) => b.mtime - a.mtime)
    list.slice(1).forEach((entry) => stale.push(entry.name))
  })
  return { dir, stale }
}

const REMOTE_ICON_TIMEOUT = 8000
const MAX_REMOTE_PAGE_BYTES = 1024 * 1024

// 解压同样受 limit 约束：压缩比可以任意高，只按压缩后字节计数挡不住解压炸弹
function decompressBody (buffer, encoding, limit) {
  const options = { maxOutputLength: limit + 1 }
  let output
  try {
    if (encoding === 'gzip' || encoding === 'x-gzip') {
      output = zlib.gunzipSync(buffer, options)
    } else if (encoding === 'deflate' || encoding === 'x-deflate') {
      try {
        output = zlib.inflateSync(buffer, options)
      } catch (error) {
        // 少数服务器发的是裸 deflate 流，退回 inflateRaw 再试一次
        if (error?.code === 'ERR_BUFFER_TOO_LARGE') throw error
        output = zlib.inflateRawSync(buffer, options)
      }
    } else if (encoding === 'br') {
      output = zlib.brotliDecompressSync(buffer, options)
    } else {
      return buffer
    }
  } catch (error) {
    if (error?.code === 'ERR_BUFFER_TOO_LARGE') return null
    // 编码声明与实际内容不符时按原始字节处理，行为与旧版一致
    return buffer
  }
  return output.length > limit ? null : output
}

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
          if (settled) return
          const encoding = String(response.headers['content-encoding'] || '').toLocaleLowerCase().trim()
          const buffer = decompressBody(Buffer.concat(chunks), encoding, limit)
          if (!buffer) {
            fail(new Error('文件过大'))
            return
          }
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

// 候选图标并发抓：串行的话，页面里挂几个打不开的 <link rel=icon> 就要按 8s 超时一个个排队，
// 最坏能等到几十秒。并发后最坏只等一次超时。
// 唯一要小心的是「谁先回来用谁」会让 16px 的 favicon.ico 抢在 180px 的 apple-touch-icon 前面，
// 所以拿到结果后再给优先级更高的候选一个很短的宽限窗口（按 index 从小到大）。
const ICON_PICK_GRACE = 250
const ICON_CANDIDATE_LIMIT = 4

function fetchFirstIcon (urls) {
  if (!urls.length) return new Promise((resolve) => resolve(null))
  return new Promise((resolve) => {
    let best = null
    let remaining = urls.length
    let done = false
    let timer = null
    const settled = new Set()

    const settle = () => {
      if (done) return
      done = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      resolve(best)
    }

    // 已经拿到结果时：如果比它优先级更高的候选都还没有下落，就没必要再等（等不到更好的了）
    const noBetterPending = () => (
      Boolean(best) && !urls.some((_, index) => index < best.index && !settled.has(index))
    )

    urls.forEach((url, index) => {
      const markSettled = () => {
        settled.add(index)
        remaining -= 1
        if (remaining === 0) {
          settle()
          return
        }
        if (noBetterPending()) {
          settle()
          return
        }
        // 兜底：更高优先级的候选可能一直挂着（8s 超时），别为了等它把用户晾在那儿
        if (best && !timer) timer = setTimeout(settle, ICON_PICK_GRACE)
      }

      requestBuffer(url, { accept: 'image/*,*/*;q=0.8' })
        .then((icon) => {
          if (done) return
          if (!icon.buffer.length || icon.buffer.length > MAX_ICON_BYTES) return
          const mime = detectImageMime(icon.buffer)
          if (!mime) return
          if (best && index >= best.index) return
          best = { index, url, buffer: icon.buffer, mime }
          // 有更好的落位就重新计时，宽限窗口从「当前最优」开始算
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
        })
        .catch(() => {})
        .finally(markSettled)
    })
  })
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

  let linked = []
  try {
    const page = await requestBuffer(parsed.href, {
      limit: MAX_REMOTE_PAGE_BYTES,
      accept: 'text/html,application/xhtml+xml'
    })
    linked = extractIconLinks(page.buffer.toString('utf8'), page.finalUrl)
  } catch {}

  // 只取分数最高的前几个（页面挂十几个图标的情况不值得全抓），兜底 favicon 始终保留
  const fallbacks = [
    new URL('/favicon.ico', parsed).href,
    new URL('/favicon.png', parsed).href
  ]
  const ordered = [...new Set([...linked.slice(0, ICON_CANDIDATE_LIMIT), ...fallbacks])]

  const icon = await fetchFirstIcon(ordered)
  if (!icon) {
    return { ok: false, error: '未能获取该网站的图标，请尝试导入本地图标' }
  }
  return {
    ok: true,
    dataUrl: toDataUrl(icon.buffer, icon.mime),
    mime: icon.mime,
    sourceUrl: icon.url
  }
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

// preload 跑在渲染进程里，这里一律用异步句柄读盘：同步 I/O 会直接把界面卡住，
// 插件多、asar 大的时候尤其明显
async function readFileRange (handle, length, position) {
  const buffer = Buffer.alloc(length)
  let read = 0
  while (read < length) {
    const { bytesRead } = await handle.read(buffer, read, length - read, position + read)
    if (!bytesRead) break
    read += bytesRead
  }
  return read === length ? buffer : buffer.subarray(0, read)
}

async function openAsar (filePath) {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const probe = await readFileRange(handle, 32, 0)

    // uTools 的 asar 头在 Pickle 外层多包了一层，JSON 从第 16 字节开始。
    // 同时兼容标准 asar（JSON 从第 8 字节开始）的读取方式。
    let jsonStart = 16
    let jsonLength = probe.length >= 16 ? probe.readUInt32LE(12) : 0
    if (!(jsonLength > 0 && probe[16] === 0x7B)) {
      jsonStart = 8
      jsonLength = probe.length >= 8 ? probe.readUInt32LE(4) : 0
    }
    if (!(jsonLength > 0 && probe[jsonStart] === 0x7B)) {
      throw new Error('无法读取 asar 头')
    }

    const headerBuffer = await readFileRange(handle, jsonLength, jsonStart)
    const header = JSON.parse(headerBuffer.toString('utf8'))
    return {
      handle,
      header,
      baseOffset: jsonStart + align4(jsonLength)
    }
  } catch (error) {
    try {
      await handle.close()
    } catch {}
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

async function readAsarEntry (archive, entry, maxBytes = 4 * 1024 * 1024) {
  if (!entry || entry.size == null || entry.offset == null) return null
  const size = Number(entry.size)
  if (!Number.isFinite(size) || size < 0 || size > maxBytes) return null
  if (size === 0) return Buffer.alloc(0)
  return readFileRange(archive.handle, size, archive.baseOffset + Number(entry.offset))
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

async function readPluginLogo (archive, dirParts, logoPath) {
  if (typeof logoPath !== 'string' || !logoPath.trim()) return ''
  try {
    const parts = resolveAsarParts(dirParts, logoPath)
    const entry = getAsarEntry(archive.header.files, parts)
    const buffer = await readAsarEntry(archive, entry)
    if (!buffer?.length) return ''
    return toDataUrl(buffer, asarMime(parts[parts.length - 1]))
  } catch {
    return ''
  }
}

function getPluginDirectoryCandidates () {
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

  return [...new Set(candidates)]
}

async function getPluginDirectories () {
  const dirs = []
  const seen = new Set()
  for (const dir of getPluginDirectoryCandidates()) {
    try {
      // Windows 上 uTools / utools / home 拼出来的候选经常指向同一个目录（还可能是 junction），
      // 只按字符串去重会把同一批 asar 扫两三遍。这里按真实路径去重
      const real = await fs.promises.realpath(dir)
      const key = process.platform === 'win32' ? real.toLowerCase() : real
      if (seen.has(key)) continue
      if (!(await fs.promises.stat(real)).isDirectory()) continue
      seen.add(key)
      dirs.push(real)
    } catch {}
  }
  return dirs
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

async function scanPluginArchiveViaFs (filePath) {
  try {
    const json = JSON.parse(await fs.promises.readFile(path.join(filePath, 'plugin.json'), 'utf8'))
    const pluginName = typeof json.pluginName === 'string' && json.pluginName.trim()
      ? json.pluginName.trim()
      : (typeof json.name === 'string' ? json.name.trim() : '')
    if (!pluginName) return null

    let logo = ''
    if (typeof json.logo === 'string' && json.logo.trim()) {
      try {
        const logoPath = path.join(filePath, json.logo.replace(/^[/\\]+/, ''))
        const buffer = await fs.promises.readFile(logoPath)
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

async function scanPluginArchive (filePath) {
  const viaFs = await scanPluginArchiveViaFs(filePath)
  if (viaFs) return viaFs

  const archive = await openAsar(filePath)
  try {
    const pluginJson = findPluginJson(archive.header.files)
    if (!pluginJson) return null
    const buffer = await readAsarEntry(archive, pluginJson.entry, 2 * 1024 * 1024)
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
      logo: await readPluginLogo(archive, pluginJson.dirParts, json.logo),
      commands: pluginCommands(json.features)
    }
  } finally {
    try {
      await archive.handle.close()
    } catch {}
  }
}

let pluginCache = null
let pluginCacheAt = 0
let pluginScanPromise = null

async function scanInstalledPlugins () {
  const dirs = await getPluginDirectories()
  if (!dirs.length) {
    return { ok: false, error: '未找到 uTools 插件目录', plugins: [] }
  }

  const plugins = new Map()
  let scanned = 0
  for (const dir of dirs) {
    let files = []
    try {
      files = (await fs.promises.readdir(dir)).filter((name) => name.toLowerCase().endsWith('.asar'))
    } catch {
      continue
    }

    for (const file of files) {
      try {
        const plugin = await scanPluginArchive(path.join(dir, file))
        if (!plugin) continue
        const key = plugin.pluginName.toLocaleLowerCase()
        const previous = plugins.get(key)
        if (!previous || plugin.commands.length > previous.commands.length) {
          plugins.set(key, plugin)
        }
      } catch {}
      // 每扫几个就把事件循环让出去一次：异步读盘本身不阻塞，
      // 但连续 JSON 解析 / base64 转换会堆成一段长任务，弹窗动画会掉帧
      if (++scanned % 8 === 0) {
        await new Promise((resolve) => setImmediate(resolve))
      }
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

// —— 目录的自定义图标 ——
// desktop.ini 定制目录需要保留本目录的图标；只有声明过 IconResource / IconFile 时才额外问一次 Shell
// （SHGetFileInfo 走真实路径，能解析到 imageres.dll,-184 这类定制图标）。
// 没定制图标的目录照旧走 uTools，不产生额外进程开销。
const WINDOWS_FOLDER_ICON_CACHE = new Map()
const WINDOWS_FOLDER_ICON_PENDING = new Map()
const FOLDER_ICON_CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const FOLDER_ICON_CACHE_LIMIT = 256
let folderIconCacheLoaded = null
let folderIconCacheWrites = Promise.resolve()

function folderIconCachePath () {
  return path.join(utools.getPluginLocalDataPath(), 'folder-icons-v1.json')
}

function loadFolderIconCache () {
  if (!folderIconCacheLoaded) {
    folderIconCacheLoaded = (async () => {
      try {
        const raw = await fs.promises.readFile(folderIconCachePath(), 'utf8')
        if (raw.length > 8 * 1024 * 1024) return
        const data = JSON.parse(raw)
        if (data.version !== 1 || !Array.isArray(data.entries)) return
        for (const entry of data.entries.slice(0, FOLDER_ICON_CACHE_LIMIT)) {
          const [dirPath, value] = Array.isArray(entry) ? entry : []
          if (typeof dirPath !== 'string' || typeof value?.signature !== 'string' ||
            typeof value.icon !== 'string' || value.icon.length > 128 * 1024 ||
            !/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(value.icon) ||
            !Number.isFinite(value.updatedAt) || Date.now() - value.updatedAt > FOLDER_ICON_CACHE_TTL) continue
          WINDOWS_FOLDER_ICON_CACHE.set(dirPath, value)
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn('[Quick Launcher] 目录图标缓存读取失败，将重新提取：', error.message)
        }
      }
    })()
  }
  return folderIconCacheLoaded
}

function saveFolderIconCache () {
  // Serialize writes and replace atomically, so interruption cannot truncate the last good cache.
  folderIconCacheWrites = folderIconCacheWrites.then(async () => {
    let temporary = ''
    try {
      const filename = folderIconCachePath()
      temporary = `${filename}.${randomUUID()}.tmp`
      const entries = [...WINDOWS_FOLDER_ICON_CACHE]
        .filter(([, value]) => Date.now() - value.updatedAt <= FOLDER_ICON_CACHE_TTL)
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        .slice(0, FOLDER_ICON_CACHE_LIMIT)
      const retained = new Set(entries.map(([dirPath]) => dirPath))
      for (const dirPath of WINDOWS_FOLDER_ICON_CACHE.keys()) {
        if (!retained.has(dirPath)) WINDOWS_FOLDER_ICON_CACHE.delete(dirPath)
      }
      await fs.promises.mkdir(path.dirname(filename), { recursive: true })
      await fs.promises.writeFile(temporary, JSON.stringify({ version: 1, entries }), 'utf8')
      await fs.promises.rename(temporary, filename)
    } catch (error) {
      console.warn('[Quick Launcher] 目录图标缓存保存失败：', error.message)
    } finally {
      if (temporary) await fs.promises.unlink(temporary).catch(() => {})
    }
  })
  return folderIconCacheWrites
}

const FOLDER_ICON_SCRIPT = Buffer.from(`$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class QLFolderIcon
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct SHFILEINFO
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string szTypeName;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool DestroyIcon(IntPtr hIcon);

    public static IntPtr LargeIcon(string targetPath)
    {
        SHFILEINFO info = new SHFILEINFO();
        IntPtr ok = SHGetFileInfo(targetPath, 0, ref info, (uint)Marshal.SizeOf(typeof(SHFILEINFO)), 0x100);
        if (ok == IntPtr.Zero) return IntPtr.Zero;
        return info.hIcon;
    }
}
'@

[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$raw = [Console]::In.ReadToEnd()
$paths = @()
# ConvertFrom-Json may emit an array as one pipeline object. Assign it directly so
# multiple folders do not become a nested array and a single invalid Shell path.
if ($raw.Trim()) { $paths = ConvertFrom-Json -InputObject $raw }

$icons = New-Object System.Collections.ArrayList
foreach ($item in $paths) {
  $dataUrl = ''
  try {
    $handle = [QLFolderIcon]::LargeIcon([string]$item)
    if ($handle -ne [IntPtr]::Zero) {
      try {
        $source = [System.Windows.Interop.Imaging]::CreateBitmapSourceFromHIcon($handle, [System.Windows.Int32Rect]::Empty, [System.Windows.Media.Imaging.BitmapSizeOptions]::FromEmptyOptions())
        $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
        $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($source))
        $stream = New-Object System.IO.MemoryStream
        $encoder.Save($stream)
        $dataUrl = 'data:image/png;base64,' + [Convert]::ToBase64String($stream.ToArray())
        $stream.Dispose()
      } finally {
        [void][QLFolderIcon]::DestroyIcon($handle)
      }
    }
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    $dataUrl = ''
  }
  [void]$icons.Add($dataUrl)
}

[pscustomobject]@{ icons = @($icons) } | ConvertTo-Json -Compress -Depth 3
`, 'utf16le').toString('base64')

// desktop.ini 一般是 ANSI，也可能被写成 UTF-16LE；有 BOM 就按 UTF-16 读
async function getFolderIconSignature (dirPath) {
  let buffer
  try {
    buffer = await fs.promises.readFile(path.join(dirPath, 'desktop.ini'))
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return ''
    throw error
  }
  if (!buffer.length || buffer.length > 64 * 1024) return ''
  const isUtf16 = buffer.length > 1 && buffer[0] === 0xFF && buffer[1] === 0xFE
  const text = isUtf16 ? buffer.subarray(2).toString('utf16le') : buffer.toString('utf8')
  return /^[ \t]*(?:IconResource|IconFile)[ \t]*=/im.test(text)
    ? createHash('sha256').update(buffer).digest('hex')
    : ''
}

// 一批目录只起一次 PowerShell：进程启动是这条旁路唯一的成本，逐条起代价太高
function extractFolderIconsByShell (dirPaths) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32' || !dirPaths.length) {
      resolve([])
      return
    }
    let child = null
    let settled = false
    let timer = null
    let stderr = ''
    const finish = (value, reason = '') => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (reason) {
        console.warn('[Quick Launcher] 目录自定义图标提取失败：', reason, stderr.trim())
      }
      resolve(Array.isArray(value) ? value : [])
    }

    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', FOLDER_ICON_SCRIPT], {
        // 数据通过 stdin 传递，避免依赖父进程环境变量和跨进程临时文件。
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        cwd: os.tmpdir()
      })
    } catch (error) {
      finish([], error.message)
      return
    }

    timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish([], 'PowerShell 执行超时（10 秒）')
    }, 10000)
    let stdout = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4096)
    })
    child.once('error', (error) => {
      finish([], error.message)
    })
    child.once('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        finish([], `PowerShell 退出码 ${code}，${stdout.trim() ? '输出异常' : '无图标输出'}`)
        return
      }
      try {
        const data = JSON.parse(stdout.replace(/^\uFEFF/, '').trim())
        // 只有一个元素时 ConvertTo-Json 可能退化成字符串，两种都接
        const raw = data?.icons
        const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : [])
        const icons = list.map((item) => (typeof item === 'string' ? item : ''))
        const missing = dirPaths.filter((_, index) => !icons[index]).length
        finish(icons, missing ? `${missing} 个目录未返回图标` : '')
      } catch (error) {
        finish([], `无法解析图标输出：${error.message}`)
      }
    })
    child.stdin.on('error', (error) => {
      try { child.kill() } catch {}
      finish([], `无法传递目录列表：${error.message}`)
    })
    child.stdin.end(JSON.stringify(dirPaths), 'utf8')
  })
}

async function resolveWindowsFolderIcons (dirPaths, run, onReady) {
  const resolved = new Map()
  const retryablePaths = new Set()
  if (process.platform !== 'win32' || !dirPaths.length) return { icons: resolved, retryablePaths }
  await loadFolderIconCache()

  const owned = []
  const waiting = []
  for (const dirPath of dirPaths) {
    let pending = WINDOWS_FOLDER_ICON_PENDING.get(dirPath)
    if (!pending) {
      let complete
      pending = new Promise((resolve) => { complete = resolve })
      WINDOWS_FOLDER_ICON_PENDING.set(dirPath, pending)
      owned.push({ dirPath, complete })
    }
    waiting.push(pending.then(({ icon = '', retryable = false }) => {
      if (icon) resolved.set(dirPath, icon)
      if (retryable) retryablePaths.add(dirPath)
      if (!retryable || icon) onReady?.(dirPath, icon)
    }))
  }

  const complete = (entry, result) => {
    WINDOWS_FOLDER_ICON_PENDING.delete(entry.dirPath)
    entry.complete(result)
  }
  const flagged = []
  let dirty = false
  await Promise.all(owned.map(async (entry) => {
    const { dirPath } = entry
    const cached = WINDOWS_FOLDER_ICON_CACHE.get(dirPath)
    try {
      const signature = await run(() => getFolderIconSignature(dirPath))
      if (!signature) {
        if (WINDOWS_FOLDER_ICON_CACHE.delete(dirPath)) dirty = true
        complete(entry, {})
      } else if (cached?.signature === signature && Date.now() - cached.updatedAt <= FOLDER_ICON_CACHE_TTL) {
        complete(entry, { icon: cached.icon })
      } else {
        flagged.push({ ...entry, signature })
        // Placeholders remain display-only; they must not be written to push-icons.
        onReady?.(dirPath, '', { provisional: true })
      }
    } catch (error) {
      console.warn('[Quick Launcher] 无法读取目录自定义图标配置：', dirPath, error.message)
      onReady?.(dirPath, cached?.icon || '', { provisional: true })
      complete(entry, { retryable: true })
    }
  }))

  if (flagged.length) {
    let icons = []
    try { icons = await run(() => extractFolderIconsByShell(flagged.map(({ dirPath }) => dirPath))) } catch {}
    flagged.forEach((entry, index) => {
      const icon = icons[index] || ''
      if (icon) {
        WINDOWS_FOLDER_ICON_CACHE.set(entry.dirPath, { signature: entry.signature, icon, updatedAt: Date.now() })
        dirty = true
      }
      complete(entry, { icon, retryable: !icon })
    })
  }
  await Promise.all(waiting)
  if (dirty) await saveFolderIconCache()
  return { icons: resolved, retryablePaths }
}

const getFileIcons = createFileIconLoader({
  stat: (itemPath) => fs.promises.stat(itemPath),
  getFileIcon: (itemPath) => utools.getFileIconAsync(itemPath),
  getFolderIcons: resolveWindowsFolderIcons
})

async function refreshFileIcons (paths) {
  const unique = [...new Set((Array.isArray(paths) ? paths : []).filter(isValidPath))]
  const previous = new Map()
  if (process.platform === 'win32' && unique.length) {
    await loadFolderIconCache()
    await Promise.all(unique.map((itemPath) => WINDOWS_FOLDER_ICON_PENDING.get(itemPath)))
    unique.forEach((itemPath) => {
      if (WINDOWS_FOLDER_ICON_CACHE.has(itemPath)) previous.set(itemPath, WINDOWS_FOLDER_ICON_CACHE.get(itemPath))
      WINDOWS_FOLDER_ICON_CACHE.delete(itemPath)
    })
  }
  // Explicit refresh bypasses our persisted folder cache, including unchanged desktop.ini.
  let completed = false
  try {
    const icons = await getFileIcons(unique)
    previous.forEach((value, itemPath) => {
      if (!icons[itemPath]) WINDOWS_FOLDER_ICON_CACHE.set(itemPath, value)
    })
    completed = true
    return icons
  } finally {
    if (!completed) previous.forEach((value, itemPath) => WINDOWS_FOLDER_ICON_CACHE.set(itemPath, value))
    if (previous.size) await saveFolderIconCache()
  }
}

window.services = {
  reportRendererError: async (details = {}) => {
    // Keep one small local report; repeated errors must not flood the disk.
    const now = Date.now()
    if (now - lastRendererErrorAt < 1000) return
    lastRendererErrorAt = now
    try {
      const report = {
        time: new Date(now).toISOString(),
        message: String(details.message || '未知界面错误').slice(0, 1000),
        stack: String(details.stack || '').slice(0, 6000),
        componentStack: String(details.componentStack || '').slice(0, 3000)
      }
      const directory = utools.getPluginLocalDataPath()
      await fs.promises.mkdir(directory, { recursive: true })
      await fs.promises.writeFile(path.join(directory, 'last-renderer-error.json'), JSON.stringify(report, null, 2), 'utf8')
    } catch {}
  },

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
    // 扫描改成异步后会真的并发：打开弹窗和点刷新可能同时进来，共用同一趟扫描
    if (!pluginScanPromise) {
      pluginScanPromise = (async () => {
        try {
          const result = await scanInstalledPlugins()
          pluginCache = result
          pluginCacheAt = Date.now()
          return result
        } catch (error) {
          return { ok: false, error: error?.message || '无法读取 uTools 插件列表', plugins: [] }
        } finally {
          pluginScanPromise = null
        }
      })()
    }
    return pluginScanPromise
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

  getFileIcons,
  refreshFileIcons,

  selectCustomIcon: async (title, options) => {
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
      const { dataUrl } = await readImageFile(selected[0], options)
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
      const filename = `${safePushIconName(name)}.png`
      const filePath = path.join(await getPushIconDir(), filename)
      await fs.promises.writeFile(filePath, buffer)
      const url = pathToFileURL(filePath).href
      pushIconIndex.remember(filename, url)
      return { ok: true, url }
    } catch {
      return { ok: false }
    }
  },

  // 条目删除 / 图标更换后由渲染进程调用：回收旧图和孤儿文件，失败不影响功能
  prunePushIcons: async (itemIds) => {
    if (!Array.isArray(itemIds)) return { ok: false, removed: 0 }
    try {
      const { dir, stale } = await collectStalePushIcons(itemIds)
      let removed = 0
      await Promise.all(stale.map(async (name) => {
        try {
          await fs.promises.unlink(path.join(dir, name))
          pushIconIndex.forget(name)
          removed += 1
        } catch {}
      }))
      return { ok: true, removed }
    } catch {
      return { ok: false, removed: 0 }
    }
  },

  // 兜底回收：分组数据里已经没人引用的本地图标（换设备同步删除、异常退出遗留等）。
  // 只删一周前的，避免和「刚导入、还没保存分组」的图标抢跑
  pruneCustomIcons: async (refs) => {
    if (!Array.isArray(refs)) return { ok: false, removed: 0 }
    try {
      const dir = getIconDir()
      const used = new Set(
        (Array.isArray(refs) ? refs : []).filter((ref) => typeof ref === 'string' && ref)
      )
      const names = await fs.promises.readdir(dir)
      let removed = 0
      await Promise.all(names.map(async (name) => {
        if (used.has(name)) return
        const targetPath = safeIconPath(name)
        if (!targetPath || !imageType(targetPath)) return
        let stats
        try {
          stats = await fs.promises.stat(targetPath)
        } catch {
          return
        }
        if (!stats.isFile() || Date.now() - stats.mtimeMs < STALE_ICON_AGE_MS) return
        try {
          await fs.promises.unlink(targetPath)
          removed += 1
        } catch {
          return
        }
        try {
          if (typeof utools?.db?.promises?.remove === 'function') {
            await utools.db.promises.remove(iconAttachmentId(name))
          }
        } catch {}
        iconSynced.delete(name)
      }))
      return { ok: true, removed }
    } catch {
      return { ok: false, removed: 0 }
    }
  },

  getPushIconUrl: (name) => {
    return pushIconIndex.get(`${safePushIconName(name)}.png`)
  },

  importCustomIconData: async (dataUrl, options) => {
    try {
      const maxBytes = resolveMaxBytes(options)
      const match = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([a-z0-9+/=\s]+)$/i
        .exec(typeof dataUrl === 'string' ? dataUrl : '')
      if (!match) throw new Error('图片数据无效')
      const buffer = Buffer.from(match[2], 'base64')
      if (!buffer.length) throw new Error('图片数据无效')
      if (buffer.length > maxBytes) throw new Error(tooLargeMessage(maxBytes))
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
