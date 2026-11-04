const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createFileIconLoader } = require('../public/fileIcons.cjs')

test('a nonresponsive system icon releases the queue and other paths still load', async () => {
  const load = createFileIconLoader({
    concurrency: 1, timeout: 10,
    stat: async () => ({ isDirectory: () => false }),
    getFileIcon: (itemPath) => itemPath === '/stalled.exe' ? new Promise(() => {}) : Promise.resolve(`icon:${itemPath}`),
    getFolderIcons: async () => new Map()
  })
  const result = await load(['/stalled.exe', '/ready.exe'])
  assert.equal(result['/ready.exe'], 'icon:/ready.exe')
  assert.equal(result['/stalled.exe'], undefined)
})

test('an icon arriving after its timeout cannot publish a stale cache update', async () => {
  const slow = deferred()
  const progress = []
  const load = createFileIconLoader({
    concurrency: 1, timeout: 10,
    stat: async () => ({ isDirectory: () => false }),
    getFileIcon: () => slow.promise,
    getFolderIcons: async () => new Map()
  })
  assert.deepEqual(await load(['/old.exe'], (icons) => progress.push(icons)), {})
  slow.resolve('late-old-icon')
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(progress, [])
})

const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

test('concurrency limit is shared across simultaneous consumers', async () => {
  let active = 0
  let peak = 0
  const work = async (result) => {
    peak = Math.max(peak, ++active)
    await new Promise((resolve) => setImmediate(resolve))
    active -= 1
    return result
  }
  const load = createFileIconLoader({
    concurrency: 3,
    stat: () => work({ isDirectory: () => false }),
    getFileIcon: (value) => work(`icon:${value}`),
    getFolderIcons: async () => new Map()
  })
  const paths = Array.from({ length: 100 }, (_, i) => `/file-${i}.exe`)
  const [first, second] = await Promise.all([load(paths), load(['/other.exe'])])
  assert.equal(Object.keys(first).length, 100)
  assert.equal(second['/other.exe'], 'icon:/other.exe')
  assert.equal(peak, 3)
})

test('fast files are published before slow paths and customized folders finish', async () => {
  const slow = deferred()
  const shell = deferred()
  const progress = []
  const received = deferred()
  let batches = 0
  const load = createFileIconLoader({
    stat: async (value) => {
      if (value === '/slow.exe') await slow.promise
      return { isDirectory: () => value.startsWith('/folder') }
    },
    getFileIcon: async (value) => `native:${value}`,
    getFolderIcons: async (paths) => {
      batches++
      assert.deepEqual(new Set(paths), new Set(['/folder-a', '/folder-b']))
      await shell.promise
      return new Map([['/folder-a', 'custom-folder']])
    }
  })
  const task = load(['/fast.exe', '/slow.exe', '/folder-a', '/folder-b'], (icons) => {
    progress.push(icons)
    if (icons['/fast.exe']) received.resolve()
  })
  await received.promise
  assert.equal(batches, 0)
  assert.equal(progress.length, 1)
  slow.resolve()
  shell.resolve()
  const result = await task
  assert.equal(batches, 1)
  assert.equal(result['/folder-a'], 'custom-folder')
  assert.equal(result['/folder-b'], 'native:/folder-b')
})

test('invalid inputs, path failures, fallback icons, and progress consumer errors', async () => {
  const calls = []
  const load = createFileIconLoader({
    stat: async (value) => {
      if (value === '/broken.txt') throw new Error('missing')
      return { isDirectory: () => value === '/folder' }
    },
    getFileIcon: async (value) => {
      calls.push(value)
      return value === '.txt' || value === 'folder' ? `fallback:${value}` : ''
    },
    getFolderIcons: async () => { throw new Error('Shell unavailable') }
  })
  assert.deepEqual(await load(null), {})
  const result = await load(['/broken.txt', '/broken.txt', null, '', '  ', '/folder'], () => {
    throw new Error('consumer unmounted')
  })
  assert.deepEqual(result, { '/broken.txt': 'fallback:.txt' })
  assert.equal(calls.filter((value) => value === '/broken.txt').length, 1)
})

test('ordinary and cached folders publish before a slow Shell extraction finishes', async () => {
  const shell = deferred()
  const ready = deferred()
  const progress = []
  const load = createFileIconLoader({
    stat: async () => ({ isDirectory: () => true }),
    getFileIcon: async (value) => `native:${value}`,
    getFolderIcons: async (paths, run, onReady) => {
      onReady('/ordinary', '')
      onReady('/cached', 'cached-icon')
      onReady('/custom', '', { provisional: true })
      await shell.promise
      return new Map([['/cached', 'cached-icon'], ['/custom', 'custom-icon']])
    }
  })
  const task = load(['/ordinary', '/cached', '/custom'], (icons, options) => {
    progress.push({ icons, options })
    if (progress.some(({ icons }) => icons['/ordinary']) &&
      progress.some(({ icons }) => icons['/cached']) &&
      progress.some(({ icons }) => icons['/custom'])) ready.resolve()
  })
  await ready.promise
  const placeholder = progress.find(({ icons }) => icons['/custom'])
  assert.equal(placeholder.options.provisional, true)
  shell.resolve()
  const result = await task
  assert.equal(result['/ordinary'], 'native:/ordinary')
  assert.equal(result['/cached'], 'cached-icon')
  assert.equal(result['/custom'], 'custom-icon')
})

test('a late placeholder cannot replace an already published custom folder icon', async () => {
  const native = deferred()
  const progress = []
  const load = createFileIconLoader({
    stat: async () => ({ isDirectory: () => true }),
    getFileIcon: async () => {
      await native.promise
      return 'native-folder'
    },
    getFolderIcons: async (paths, run, onReady) => {
      onReady('/custom', '', { provisional: true })
      onReady('/custom', 'custom-icon')
      native.resolve()
      return new Map([['/custom', 'custom-icon']])
    }
  })
  assert.deepEqual(await load(['/custom'], (icons) => progress.push(icons)), { '/custom': 'custom-icon' })
  assert.deepEqual(progress, [{ '/custom': 'custom-icon' }])
})
