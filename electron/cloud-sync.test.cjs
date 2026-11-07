const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const zlib = require('node:zlib')
const { createCloudSync, mergeRecords } = require('./cloud-sync.cjs')

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

test('continues syncing other keys after one key fails', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zyro-cloud-sync-'))
  const statePath = path.join(directory, 'cloud-sync.json')
  fs.writeFileSync(statePath, JSON.stringify({ enabled: true }), 'utf8')
  const originalFetch = global.fetch
  const attemptedKeys = []
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body)
    if (body.action === 'manifest') {
      return { ok: true, status: 200, json: async () => ({ keys: {} }) }
    }
    attemptedKeys.push(body.key)
    if (body.key === 'first') {
      return { ok: false, status: 400, json: async () => ({ error: 'Datensatz ungültig.' }) }
    }
    return { ok: true, status: 200, json: async () => ({ revision: 1 }) }
  }

  try {
    const businessData = { first: [{ id: 'a' }], second: [{ id: 'b' }] }
    const sync = createCloudSync({
      statePath,
      keys: ['first', 'second'],
      getRecordId: (_key, record) => record.id,
      readBusinessData: () => businessData,
      writeBusinessData: (data) => Object.assign(businessData, data),
      acquireWriteLock: () => () => {},
      getToken: async () => 'test-token',
      backupLocalData: async () => {},
    })

    const status = await sync.syncNow()

    assert.deepEqual(attemptedKeys, ['first', 'second'])
    assert.match(status.lastError, /first: Datensatz ungültig\./)
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).bases.second, JSON.stringify([{ id: 'b' }]))
  } finally {
    global.fetch = originalFetch
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('merges and retries when the cloud revision changes during a push', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zyro-cloud-sync-'))
  const statePath = path.join(directory, 'cloud-sync.json')
  fs.writeFileSync(statePath, JSON.stringify({
    enabled: true,
    revisions: { schedule: 1 },
    bases: { schedule: '[]' },
  }), 'utf8')
  const originalFetch = global.fetch
  let pushCount = 0
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body)
    if (body.action === 'manifest') {
      return { ok: true, status: 200, json: async () => ({ keys: { schedule: { revision: 1 } } }) }
    }
    if (body.action === 'get') {
      const data = zlib.gzipSync(Buffer.from(JSON.stringify([{ id: 'remote' }]))).toString('base64')
      return { ok: true, status: 200, json: async () => ({ revision: 2, data }) }
    }
    pushCount += 1
    if (pushCount === 1) {
      return { ok: false, status: 409, json: async () => ({ revision: 2 }) }
    }
    return { ok: true, status: 200, json: async () => ({ revision: 3 }) }
  }

  try {
    const businessData = { schedule: [{ id: 'local' }] }
    const sync = createCloudSync({
      statePath,
      keys: ['schedule'],
      getRecordId: (_key, record) => record.id,
      readBusinessData: () => businessData,
      writeBusinessData: (data) => Object.assign(businessData, data),
      acquireWriteLock: () => () => {},
      getToken: async () => 'test-token',
      backupLocalData: async () => {},
    })

    const status = await sync.syncNow()

    assert.equal(pushCount, 2)
    assert.deepEqual(businessData.schedule.map((record) => record.id).sort(), ['local', 'remote'])
    assert.equal(status.lastError, '')
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).revisions.schedule, 3)
  } finally {
    global.fetch = originalFetch
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
