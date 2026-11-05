const assert = require('node:assert/strict')
const test = require('node:test')
const { mergeRecords } = require('./cloud-sync.cjs')

const getId = (key, record) => key === 'zyro-inventory' ? record.item : record.id

test('keeps remote additions and applies local additions, edits and deletions', () => {
  const base = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }]
  const local = [{ id: 1, name: 'a-local' }, { id: 3, name: 'c' }, { id: 4, name: 'new-local' }]
  const remote = [{ id: 1, name: 'a' }, { id: 2, name: 'b-remote' }, { id: 3, name: 'c' }, { id: 5, name: 'new-remote' }]
  const merged = mergeRecords('zyro-orders', base, local, remote, getId)
  assert.deepEqual(merged.map((record) => record.id).sort(), [1, 3, 4, 5])
  assert.equal(merged.find((record) => record.id === 1).name, 'a-local')
})

test('does not drop remote edits to records the local PC did not touch', () => {
  const base = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]
  const local = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'x' }]
  const remote = [{ id: 1, name: 'a-remote' }, { id: 2, name: 'b' }]
  const merged = mergeRecords('zyro-orders', base, local, remote, getId)
  assert.equal(merged.find((record) => record.id === 1).name, 'a-remote')
  assert.ok(merged.some((record) => record.id === 3))
})

test('keeps cloud deletions when a stale local copy edits the deleted record', () => {
  const base = [{ id: 1, name: 'Rezeptur' }, { id: 2, name: 'Andere Rezeptur' }]
  const staleLocal = [{ id: 1, name: 'Veraltete Änderung' }, { id: 2, name: 'Andere Rezeptur' }]
  const remote = [{ id: 2, name: 'Andere Rezeptur' }]
  const merged = mergeRecords('zyro-recipes', base, staleLocal, remote, getId)
  assert.deepEqual(merged, [{ id: 2, name: 'Andere Rezeptur' }])
})

test('a local deletion also wins over a stale remote edit', () => {
  const base = [{ id: 1, name: 'Rezeptur' }]
  const local = []
  const staleRemote = [{ id: 1, name: 'Veraltete Cloud-Änderung' }]
  const merged = mergeRecords('zyro-recipes', base, local, staleRemote, getId)
  assert.deepEqual(merged, [])
})

test('uses the item name as id for inventory and the content for id-less records', () => {
  const merged = mergeRecords('zyro-inventory', [{ item: 'Zucker', stock: 1 }], [{ item: 'Zucker', stock: 5 }], [{ item: 'Zucker', stock: 1 }, { item: 'Wasser', stock: 2 }], getId)
  assert.deepEqual(merged.map((record) => `${record.item}:${record.stock}`).sort(), ['Wasser:2', 'Zucker:5'])
  const audit = mergeRecords('zyro-audit-log', [], [{ text: 'local' }], [{ text: 'remote' }], getId)
  assert.equal(audit.length, 2)
})
