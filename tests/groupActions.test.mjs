import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGroup, ITEM_TYPES, parseBackup, mergeImportedGroups, loadGroups, saveGroups } from '../src/data.js'
import { getGroupPushActions, getLaunchTargets, isPanelEligible } from '../src/groupActions.js'

const file = { id: 'file', name: 'File', type: ITEM_TYPES.FILE, path: 'C:\\file.txt' }
const child = createGroup({ id: 'child', name: 'kjcmd', keywordMatch: false, quickLaunch: true, items: [file] })
const entry = { id: 'entry', name: child.name, type: ITEM_TYPES.GROUP, groupId: child.id }
const parent = createGroup({ id: 'parent', name: 'Common', aliases: ['cy'], items: [entry] })

test('quick launch survives storage and backup without its own search keyword', () => {
  let stored
  globalThis.window = { utools: { dbStorage: {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value }
  } } }
  saveGroups([child])
  const [loaded] = loadGroups()
  assert.equal(loaded.keywordMatch, false)
  assert.equal(loaded.quickLaunch, true)
  const backup = parseBackup({ groups: [child] })
  assert.equal(backup.ok, true)
  assert.equal(backup.groups[0].keywordMatch, false)
  assert.equal(backup.groups[0].quickLaunch, true)
})

test('keyword conflicts during import do not disable quick launch', () => {
  const existing = createGroup({ id: 'existing', name: 'Existing', aliases: ['shared'] })
  const incoming = { ...child, keywordMatch: true, aliases: ['shared'] }
  const merged = mergeImportedGroups([existing], [incoming])
  assert.deepEqual(merged.warnings, [child.name])
  const imported = merged.groups.find((group) => group.id === child.id)
  assert.equal(imported.keywordMatch, false)
  assert.equal(imported.quickLaunch, true)
})

test('a unique quick launch subgroup offers launch then search panel for that subgroup', () => {
  const actions = getGroupPushActions(parent, { query: 'kjcmd', soloTarget: child })
  assert.deepEqual(actions.map((action) => action.text), ['启动分组：kjcmd', '进入分组：kjcmd'])
  assert.deepEqual(actions.map((action) => action.selection), [
    { launchGroup: true, ownerId: child.id },
    { enterGroup: true, ownerId: child.id, query: '' }
  ])
  const emptyPreview = getGroupPushActions(parent, {
    query: 'kjcmd', soloTarget: { ...child, items: [] }, hasEntries: false
  })
  assert.deepEqual(emptyPreview.map((action) => action.selection), [
    { enterGroup: true, ownerId: child.id, query: '' }
  ])
})

test('a bare keyword keeps its own actions even when its only entry is a quick launch subgroup', () => {
  const actions = getGroupPushActions(parent, { soloTarget: child })
  assert.deepEqual(actions.map((action) => action.selection), [
    { enterGroup: true, ownerId: parent.id, query: '' }
  ])
  const direct = getGroupPushActions(child)
  assert.deepEqual(direct.map((action) => action.selection), [
    { launchGroup: true, ownerId: child.id },
    { enterGroup: true, ownerId: child.id, query: '' }
  ])
})

test('ordinary searches and subgroups keep their existing results', () => {
  assert.deepEqual(getGroupPushActions(parent, { query: 'file' }), [])
  assert.deepEqual(getGroupPushActions(parent, {
    query: 'kjcmd', soloTarget: { ...child, quickLaunch: false }
  }), [])
  assert.deepEqual(getGroupPushActions(parent, {
    query: 'kjcmd', soloTarget: { ...child, enabled: false }
  }), [])
  const actions = getGroupPushActions(parent, {
    query: 'kjcmd missing', scope: { target: child, rest: 'missing' }, hasEntries: false
  })
  assert.deepEqual(actions.map((action) => action.selection), [
    { enterGroup: true, ownerId: child.id, query: 'missing' }
  ])
})

test('quick launch groups support search panels and launch only their own non-group items', () => {
  assert.equal(isPanelEligible(child, [parent, child]), true)
  assert.equal(isPanelEligible({ ...child, enabled: false }, [parent, child]), false)
  assert.equal(isPanelEligible({ ...child, items: [] }, [parent, child]), false)
  assert.equal(isPanelEligible(parent, [parent, { ...child, enabled: false }]), false)
  assert.deepEqual(getLaunchTargets({ ...child, items: [file, entry] }), [file])
})
