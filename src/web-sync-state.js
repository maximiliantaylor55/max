const syncStateKey = 'zyro-web-cloud-sync'
const archiveSyncBaseKey = 'zyro-web-cloud-sync-archive-base'
const archiveDocumentsKey = 'zyro-archive-documents'

const readStoredValue = (database, key) => new Promise((resolve, reject) => {
  try {
    const request = database.transaction('collections', 'readonly').objectStore('collections').get(key)
    request.onsuccess = () => resolve(request.result?.value)
    request.onerror = () => reject(new Error(request.error?.message || 'Der Cloud-Sync-Stand konnte nicht gelesen werden.'))
  } catch (error) {
    reject(new Error(`Der Cloud-Sync-Stand konnte nicht gelesen werden: ${error.message}`))
  }
})

const writeStoredValue = (database, key, value) => new Promise((resolve, reject) => {
  try {
    const transaction = database.transaction('collections', 'readwrite')
    transaction.objectStore('collections').put({ key, value })
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(new Error(transaction.error?.message || 'Der Cloud-Sync-Stand konnte nicht gespeichert werden.'))
    transaction.onabort = () => reject(new Error(transaction.error?.message || 'Speichern des Cloud-Sync-Stands wurde abgebrochen.'))
  } catch (error) {
    reject(new Error(`Der Cloud-Sync-Stand konnte nicht gespeichert werden: ${error.message}`))
  }
})

const validateSyncState = (state) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)
    || !state.revisions || typeof state.revisions !== 'object' || Array.isArray(state.revisions)
    || !state.bases || typeof state.bases !== 'object' || Array.isArray(state.bases)) {
    throw new Error('Der lokale Cloud-Sync-Stand ist beschädigt und wurde nicht überschrieben.')
  }
  return state
}

export const readWebSyncState = async (database, storage) => {
  const saved = await readStoredValue(database, syncStateKey)
  if (saved !== undefined) {
    const state = validateSyncState(saved)
    if (storage.getItem(syncStateKey) !== null) storage.removeItem(syncStateKey)
    return state
  }

  const legacy = storage.getItem(syncStateKey)
  let state = { revisions: {}, bases: {} }
  if (legacy !== null) {
    try {
      state = validateSyncState(JSON.parse(legacy))
    } catch (error) {
      throw new Error(`Der lokale Cloud-Sync-Stand konnte nicht übernommen werden: ${error.message}`)
    }
  }
  const archiveBase = await readStoredValue(database, archiveSyncBaseKey)
  if (state.bases[archiveDocumentsKey] === undefined && archiveBase !== undefined) {
    state.bases[archiveDocumentsKey] = archiveBase
  }
  if (legacy !== null || archiveBase !== undefined) {
    await writeStoredValue(database, syncStateKey, state)
    if (legacy !== null) storage.removeItem(syncStateKey)
  }
  return state
}

export const writeWebSyncState = (database, state) => (
  writeStoredValue(database, syncStateKey, validateSyncState(state))
)
