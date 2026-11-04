const path = require('node:path')

function createFileIconLoader ({ stat, getFileIcon, getFolderIcons, concurrency = 8, timeout = 15000 }) {
  const queue = []
  let active = 0
  const pump = () => {
    while (active < concurrency && queue.length) {
      const { work, resolve, reject } = queue.shift()
      active += 1
      let timer
      let expired = false
      const bounded = new Promise((done, fail) => {
        timer = setTimeout(() => {
          expired = true
          fail(new Error('系统图标读取超时'))
        }, timeout)
        Promise.resolve().then(() => work(() => !expired)).then(done, fail)
      })
      bounded.then(resolve, reject).finally(() => {
        clearTimeout(timer)
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
    const tasks = []
    const entries = new Map()
    const nativeFolders = new Set()
    const emit = (itemPath, icon, options = {}) => {
      // A slow placeholder must never replace a custom icon that has already arrived.
      if (options.provisional && entries.has(itemPath)) return
      if (icon && !options.provisional) entries.set(itemPath, icon)
      if (icon && typeof onProgress === 'function') {
        try { onProgress({ [itemPath]: icon }, options) } catch {}
      }
    }
    const readNative = (itemPath, isDirectory, options) => run(async (isCurrent) => {
      let icon = ''
      try { icon = await getFileIcon(itemPath) } catch {}
      if (!isCurrent()) return
      if (!icon) {
        const fallback = isDirectory ? 'folder' : path.extname(itemPath)
        if (fallback) {
          try { icon = await getFileIcon(fallback) } catch {}
        }
      }
      if (isCurrent()) emit(itemPath, icon, options)
    }, true).catch(() => {})

    await Promise.all(unique.map(async (itemPath) => {
      let isDirectory = false
      try { isDirectory = (await run(() => stat(itemPath))).isDirectory() } catch {}
      if (isDirectory) directories.push(itemPath)
      else tasks.push(readNative(itemPath, false))
    }))

    // Publish cached/custom and ordinary folders independently of the slow Shell batch.
    const folderReady = (itemPath, icon, options = {}) => {
      if (icon) emit(itemPath, icon, options)
      else {
        if (!options.provisional) nativeFolders.add(itemPath)
        tasks.push(readNative(itemPath, true, options))
      }
    }
    let folderIcons = new Map()
    let retryablePaths = new Set()
    try {
      const result = await getFolderIcons(directories, run, folderReady)
      folderIcons = result.icons || result
      retryablePaths = result.retryablePaths || retryablePaths
    } catch {
      // A failed folder resolver must not turn a placeholder into a saved search icon.
      retryablePaths = new Set(directories)
      directories.forEach((itemPath) => folderReady(itemPath, '', { provisional: true }))
    }
    directories.forEach((itemPath) => {
      if (entries.has(itemPath) || nativeFolders.has(itemPath)) return
      if (folderIcons.get(itemPath)) emit(itemPath, folderIcons.get(itemPath))
      else if (!retryablePaths.has(itemPath)) folderReady(itemPath, '')
    })
    await Promise.all(tasks)
    return Object.fromEntries(entries)
  }
}

module.exports = { createFileIconLoader }
