// 背景图在面板里只是一层底图，原图动辄几 MB 只会拖慢读写与同步，
// 因此在落盘前按最长边与体积做一次等比压缩（小图原样返回）。
const MAX_EDGE = 2560
const TARGET_BYTES = 1.5 * 1024 * 1024
// 与 preload 的 MAX_IMAGE_BYTES 对齐：背景图最大 5 MB（压缩后通常远小于这个值）
export const BACKGROUND_MAX_BYTES = 5 * 1024 * 1024

function loadImage (src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解析失败'))
    img.src = src
  })
}

function approxBytes (dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.floor(base64.length * 0.75)
}

export async function shrinkImageDataUrl (
  dataUrl,
  { maxEdge = MAX_EDGE, targetBytes = TARGET_BYTES, quality = 0.9 } = {}
) {
  // 只处理位图；SVG 体积小且需要保留矢量
  if (typeof dataUrl !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(dataUrl)) {
    return dataUrl
  }
  if (approxBytes(dataUrl) <= targetBytes) return dataUrl

  let img
  try {
    img = await loadImage(dataUrl)
  } catch {
    return dataUrl
  }

  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (!width || !height) return dataUrl

  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))

  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const webp = canvas.toDataURL('image/webp', quality)
  const encoded = webp.startsWith('data:image/webp')
    ? webp
    : canvas.toDataURL('image/jpeg', quality)

  return encoded.length < dataUrl.length ? encoded : dataUrl
}
