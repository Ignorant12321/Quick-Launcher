const path = require('node:path')

function createFileIconLoader ({ stat, getFileIcon, getFolderIcons, concurrency = 8 }) {
  const queue = []
  let active = 0
  const pump = () => {
    while (active < concurrency && queue.length) {
      const { work, resolve, reject } = queue.shift()
      active += 1
      Promise.resolve().then(work).then(resolve, reject).finally(() => {
        active -= 1
        pump()
      })
    }
  }
  const run = (work, priority = false) => new Promise((resolve, reject) => {
    const task = { work, resolve, reject }
    if (priority) queue.unshift(task)
    else queue.push(task)
    pump()
  })

  return async (paths, onProgress) => {
    if (!Array.isArray(paths)) return {}
    const unique = [...new Set(paths.filter((value) => typeof value === 'string' && value.trim()))]
    const directories = []
    const files = []
    const emit = (itemPath, icon) => {
      if (icon && typeof onProgress === 'function') {
        try { onProgress({ [itemPath]: icon }) } catch {}
      }
      return [itemPath, icon || '']
    }
    const readNative = (itemPath, isDirectory) => run(async () => {
      let icon = ''
      try { icon = await getFileIcon(itemPath) } catch {}
      if (!icon) {
        const fallback = isDirectory ? 'folder' : path.extname(itemPath)
        if (fallback) {
          try { icon = await getFileIcon(fallback) } catch {}
        }
      }
      return emit(itemPath, icon)
    }, true)

    await Promise.all(unique.map(async (itemPath) => {
      let isDirectory = false
      try { isDirectory = (await run(() => stat(itemPath))).isDirectory() } catch {}
      if (isDirectory) directories.push(itemPath)
      else files.push(readNative(itemPath, false))
    }))

    // Keep customized folders in one Shell batch; ordinary files can finish first.
    let folderIcons = new Map()
    try { folderIcons = await getFolderIcons(directories, run) } catch {}
    const folders = directories.map((itemPath) => (
      folderIcons.get(itemPath)
        ? Promise.resolve(emit(itemPath, folderIcons.get(itemPath)))
        : readNative(itemPath, true)
    ))
    const entries = await Promise.all([...files, ...folders])
    return Object.fromEntries(entries.filter(([, icon]) => Boolean(icon)))
  }
}

module.exports = { createFileIconLoader }
