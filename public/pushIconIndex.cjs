const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

function createPushIconIndex (getDirectory, io = fs.promises) {
  const urls = new Map()
  const touched = new Set()
  let loading = null
  let scanning = true
  return {
    ready () {
      if (!loading) {
        loading = Promise.resolve().then(async () => {
          const directory = getDirectory()
          const entries = await io.readdir(directory, { withFileTypes: true })
          entries.forEach((entry) => {
            if (!entry.isFile() || !entry.name.endsWith('.png') || touched.has(entry.name)) return
            urls.set(entry.name, pathToFileURL(path.join(directory, entry.name)).href)
          })
        }).catch(() => {}).finally(() => {
          scanning = false
          touched.clear()
        })
      }
      return loading
    },
    get (filename) { return urls.get(filename) || '' },
    remember (filename, url) {
      if (scanning) touched.add(filename)
      urls.set(filename, url)
    },
    forget (filename) {
      if (scanning) touched.add(filename)
      urls.delete(filename)
    }
  }
}

module.exports = { createPushIconIndex }
