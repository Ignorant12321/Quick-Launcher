import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GROUPS_KEY, createGroup, getGroupIdFromFeatureCode, syncGroupFeatures,
  loadGroups, saveGroups, hasPersistedGroups
} from '../src/data.js'

test('feature versions skip bitmap work, invalidate appearance, and retry missing images', async () => {
  const features = new Map([['unrelated', { code: 'unrelated' }]])
  let renders = 0
  let writes = 0
  let available = true
  globalThis.window = {
    setTimeout, clearTimeout,
    utools: {
      getFeatures: () => [...features.values()],
      setFeature: (feature) => { writes++; features.set(feature.code, feature) },
      removeFeature: (code) => features.delete(code)
    }
  }
  const resolve = async () => { renders++; return available ? 'data:image/png;base64,test' : '' }
  const sync = (groups) => syncGroupFeatures(groups, resolve, { immediate: true })
  const group = createGroup({ id: 'alpha', name: 'Alpha' })
  assert.equal(await sync([group]), null)
  assert.equal(renders, 1)
  const firstCode = [...features.keys()].find((code) => code !== 'unrelated')
  assert.equal(getGroupIdFromFeatureCode(firstCode), group.id)
  await sync([{ ...group, items: [{ id: 'item', name: 'Reordered item' }] }])
  assert.equal(renders, 1)
  assert.equal(writes, 1)
  const cold = await import('../src/data.js?cold-feature-check')
  await cold.syncGroupFeatures([group], resolve, { immediate: true })
  assert.equal(renders, 1)
  assert.equal(writes, 1)
  await sync([{ ...group, iconRadius: 17 }])
  assert.equal(renders, 2)
  assert.equal(features.has(firstCode), false)

  const custom = { ...group, customIconRef: 'new-image.png', customIconRadius: 23 }
  available = false
  await sync([custom])
  const pending = [...features.values()].find((feature) => feature.code !== 'unrelated')
  assert.equal(pending.icon, 'logo.png')
  const oldWrites = writes
  await sync([custom])
  assert.equal(writes, oldWrites)
  available = true
  await sync([custom])
  assert.equal(features.has(pending.code), false)
  const ready = [...features.keys()].find((code) => code !== 'unrelated')
  const before = renders
  await sync([{ ...custom }])
  assert.equal(renders, before)
  await sync([{ ...custom, customIconRadius: 24 }])
  assert.equal(features.has(ready), false)
  await sync([{ ...custom, enabled: false }])
  assert.deepEqual([...features.keys()], ['unrelated'])
})

test('icon cleanup trusts only successfully loaded or saved snapshots', () => {
  let stored
  let fail = false
  globalThis.window = { utools: { dbStorage: {
    getItem: (key) => {
      assert.equal(key, GROUPS_KEY)
      if (fail) throw new Error('unavailable')
      return stored
    },
    setItem: (key, value) => {
      if (fail) throw new Error('disk full')
      stored = value
    }
  } } }
  assert.equal(hasPersistedGroups(loadGroups()), false)
  stored = []
  assert.equal(hasPersistedGroups(loadGroups()), true)
  fail = true
  assert.equal(hasPersistedGroups(loadGroups()), false)
  const snapshot = []
  assert.throws(() => saveGroups(snapshot))
  assert.equal(hasPersistedGroups(snapshot), false)
  fail = false
  saveGroups(snapshot)
  assert.equal(hasPersistedGroups(snapshot), true)
  assert.equal(hasPersistedGroups([...snapshot]), false)
})
