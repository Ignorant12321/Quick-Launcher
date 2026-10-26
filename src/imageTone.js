// 背景图明暗采样 + 前景色生成
// 采样：把图缩到 16×16，记录每个格子的亮度，用来判断叠在上面的字该用浅色还是深色。
// 不只看平均值 —— 壁纸经常一半亮一半暗，平均下来正好卡在阈值上，会随遮罩浓度来回翻转。

const SAMPLE_SIZE = 16
const CACHE_LIMIT = 8
const cache = new Map()

// 深色字要求底图足够亮：亮度 ≥0.60 才算「能压住黑字」
const DARK_TEXT_BG_MIN = 0.60

function remember (key, task) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, task)
  return task
}

function clamp01 (value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

// 返回 0（纯黑）~ 1（纯白）的亮度数组；无法读取时返回 null
export function sampleLuminances (src) {
  if (!src) return Promise.resolve(null)
  const cached = cache.get(src)
  if (cached) return cached

  const task = new Promise((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE_SIZE
        canvas.height = SAMPLE_SIZE
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) {
          resolve(null)
          return
        }
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        const samples = []
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 12) continue
          samples.push(
            (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
          )
        }
        resolve(samples.length ? samples : null)
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = src
  })

  return remember(src, task)
}

// 逐格算「白字 / 黑字各有多少格子够对比度」。遮罩会把整张图推向浅色 / 深色，一并算进去。
// 返回 tone：'dark' 表示底图偏暗（配浅色字），'light' 表示偏亮（配深色字）
export function resolveImageTone ({ samples, dim, mode }) {
  if (!samples || !samples.length) return mode === 'dark' ? 'dark' : 'light'
  const veil = mode === 'dark' ? 17 / 255 : 244 / 255
  const alpha = clamp01((Number(dim) || 0) / 100)

  let darkOk = 0
  let sum = 0

  for (let i = 0; i < samples.length; i += 1) {
    const effective = samples[i] * (1 - alpha) + veil * alpha
    sum += effective
    if (effective >= DARK_TEXT_BG_MIN) darkOk += 1
  }

  const total = samples.length
  const average = sum / total

  // 照片类底图默认浅色字（配文字阴影）更稳。只有「整体明显偏亮 + 绝大多数格子都够亮」
  // 才切深色字，这样拖遮罩不会在两个方案之间来回跳，也不会出现大片亮图里夹一块深色就糊字。
  if (average >= 0.66 && darkOk >= total * 0.7) return 'light'
  return 'dark'
}

function normalizeHex (value) {
  if (typeof value !== 'string') return null
  const hex = value.trim()
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null
  return hex.toLowerCase()
}

function hexToRgb (hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  }
}

function lumaOf ({ r, g, b }) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

// 统一的四档前景色：main 正文 / muted 次要 / faint 序号等 / shadow 文字投影
function buildForeground (rgbText, alpha, isLight) {
  const round = (value) => Math.round(value * 100) / 100
  return {
    isLight,
    main: `rgba(${rgbText}, ${round(alpha)})`,
    muted: `rgba(${rgbText}, ${round(alpha * 0.74)})`,
    faint: `rgba(${rgbText}, ${round(alpha * 0.48)})`,
    shadow: isLight ? '0 1px 3px rgba(0, 0, 0, 0.5)' : '0 1px 2px rgba(255, 255, 255, 0.68)'
  }
}

// tone 描述的是「背景」的明暗：背景暗 → 用浅色字，背景亮 → 用深色字
export function foregroundFor (tone) {
  if (!tone) return null
  return tone === 'dark'
    ? buildForeground('248, 250, 252', 0.96, true)
    : buildForeground('17, 24, 39', 0.92, false)
}

// 用户手动指定字色（#rrggbb）与不透明度（百分比）
export function foregroundFromColor (color, opacity = 100) {
  const hex = normalizeHex(color)
  if (!hex) return null
  const rgb = hexToRgb(hex)
  const isLight = lumaOf(rgb) > 0.55
  const alpha = Math.min(1, Math.max(0.2, (Number(opacity) || 100) / 100))
  return buildForeground(`${rgb.r}, ${rgb.g}, ${rgb.b}`, alpha, isLight)
}

export { normalizeHex }
