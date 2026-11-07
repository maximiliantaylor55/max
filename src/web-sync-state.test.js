import assert from 'node:assert/strict'
import test from 'node:test'
import { readWebSyncState, writeWebSyncState } from './web-sync-state.js'

const syncKey = 'zyro-web-cloud-sync'

const createStorage = (entries = {}) => {
  const values = new Map(Object.entries(entries))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

const createDatabase = (entries = {}, failWrite = false) => {
  const values = new Map(Object.entries(entries))
  return {
    transaction: () => {
      const transaction = {
        objectStore: () => ({
          get: (key) => {
            const request = {}
            queueMicrotask(() => {
              const value = values.get(key)
              request.result = value === undefined ? undefined : { key, value: structuredClone(value) }
              request.onsuccess()
            })
            return request
          },
          put: ({ key, value }) => {
            queueMicrotask(() => {
              if (failWrite) {
                transaction.error = new Error('Datenbank voll')
                transaction.onerror()
              } else {
                values.set(key, structuredClone(value))
                transaction.oncomplete()
              }
            })
          },
        }),
      }
      return transaction
    },
  }
}

test('migrates the full sync state without writing it to localStorage', async () => {
  const state = {
    revisions: { products: 3, archive: 8 },
    bases: { products: 'x'.repeat(6 * 1024 * 1024), 'zyro-archive-documents': 'archive-data' },
  }
  const storage = createStorage({ [syncKey]: JSON.stringify(state) })
  const database = createDatabase()
  assert.deepEqual(await readWebSyncState(database, storage), state)
  assert.equal(storage.getItem(syncKey), null)
  const updated = { ...state, revisions: { products: 4, archive: 8 } }
  await writeWebSyncState(database, updated)
  assert.deepEqual(await readWebSyncState(database, storage), updated)
  assert.equal(storage.getItem(syncKey), null)
})

test('retains the old sync state if migration fails', async () => {
  const legacy = JSON.stringify({ revisions: { products: 1 }, bases: { products: '[]' } })
  const storage = createStorage({ [syncKey]: legacy })
  await assert.rejects(readWebSyncState(createDatabase({}, true), storage), /Datenbank voll/)
  assert.equal(storage.getItem(syncKey), legacy)
})

test('does not replace corrupt legacy state with an empty state', async () => {
  const storage = createStorage({ [syncKey]: '{broken' })
  await assert.rejects(readWebSyncState(createDatabase(), storage), /nicht übernommen/)
  assert.equal(storage.getItem(syncKey), '{broken')
})

test('recovers the previous separate archive base when it is missing from legacy state', async () => {
  const legacy = { revisions: { 'zyro-archive-documents': 7 }, bases: {} }
  const storage = createStorage({ [syncKey]: JSON.stringify(legacy) })
  const database = createDatabase({ 'zyro-web-cloud-sync-archive-base': '["existing"]' })
  const state = await readWebSyncState(database, storage)
  assert.equal(state.bases['zyro-archive-documents'], '["existing"]')
  assert.equal(state.revisions['zyro-archive-documents'], 7)
  assert.equal(storage.getItem(syncKey), null)
})
