import { readWebSyncState, writeWebSyncState } from './web-sync-state.js'

const dataKeys = [
  'zyro-products',
  'zyro-recipes',
  'zyro-lab-tests',
  'zyro-orders',
  'zyro-sales-documents',
  'zyro-suppliers',
  'zyro-purchase-orders',
  'zyro-finance-entries',
  'zyro-payment-requests',
  'zyro-payment-settings',
  'zyro-cost-calculations',
  'zyro-elster-setup',
  'zyro-company-details',
  'zyro-bottler-details',
  'zyro-website-orders',
  'zyro-customers',
  'zyro-customer-letters',
  'zyro-qm-documents',
  'zyro-sales-target',
  'zyro-inventory',
  'zyro-stock-movements',
  'zyro-reports',
  'zyro-machinebau',
  'zyro-schedule',
  'zyro-schedule-requests',
  'zyro-hr-sensitive',
  'zyro-archive-documents',
  'zyro-delete-requests',
  'zyro-audit-log',
  'zyro-shop-settings',
  'zyro-shop-discounts',
]

const sessionStateKey = 'zyro-web-current-user'
const sessionTokenKey = 'zyro-web-session-token'
const archiveDocumentsKey = 'zyro-archive-documents'
// Firebase-Kosten: Datenabgleich nur bei sichtbarem Fenster, Telefon-Abfrage mit Pause.
const cloudPollIntervalMs = 20 * 1000
const callPollIntervalMs = 1500
const callPollIdleVisibleMs = 3000
const callPollIdleHiddenMs = 8000
const callPollActiveMs = 400
const isPageHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
let localRevision = Date.now()
let lastSyncAt = 0
let syncInProgress = false
let syncFinishedPromise = Promise.resolve()
let pushTimer
let callConnection
const callMessageListeners = new Set()
const callErrorListeners = new Set()
const callDisconnectListeners = new Set()
let archiveDocumentsCache = []
let archiveDatabase
let archiveDocumentsLoaded = false
const emit = (name, detail = {}) => window.dispatchEvent(new CustomEvent(name, { detail }))

const archiveDocumentsReady = typeof window !== 'undefined' && !window.zyroAuth
  ? new Promise((resolve) => {
    if (!window.indexedDB) {
      emit('zyro-data-sync-error', { message: 'Der lokale Archivspeicher (IndexedDB) ist in diesem Browser nicht verfügbar.' })
      resolve(false)
      return
    }

    let openRequest
    try {
      openRequest = window.indexedDB.open('zyro-management-storage', 1)
    } catch (error) {
      emit('zyro-data-sync-error', { message: `Der lokale Archivspeicher konnte nicht geöffnet werden: ${error.message}` })
      resolve(false)
      return
    }
    openRequest.onupgradeneeded = () => {
      if (!openRequest.result.objectStoreNames.contains('collections')) {
        openRequest.result.createObjectStore('collections', { keyPath: 'key' })
      }
    }
    openRequest.onerror = () => {
      emit('zyro-data-sync-error', { message: `Der lokale Archivspeicher konnte nicht geöffnet werden: ${openRequest.error?.message || 'Unbekannter Fehler'}` })
      resolve(false)
    }
    openRequest.onsuccess = () => {
      try {
        const database = openRequest.result
        archiveDatabase = database
        const transaction = database.transaction('collections', 'readwrite')
        const store = transaction.objectStore('collections')
        const getRequest = store.get(archiveDocumentsKey)
        let removeLegacyValue = false
        getRequest.onsuccess = () => {
          if (getRequest.result) {
            archiveDocumentsCache = Array.isArray(getRequest.result.value) ? getRequest.result.value : []
            return
          }
          let legacyValue
          try {
            legacyValue = window.localStorage.getItem(archiveDocumentsKey)
          } catch (error) {
            emit('zyro-data-sync-error', { message: `Vorhandene Archivdokumente konnten nicht gelesen werden: ${error.message}` })
            transaction.abort()
            return
          }
          if (legacyValue === null) return
          try {
            const documents = JSON.parse(legacyValue)
            if (!Array.isArray(documents)) throw new Error('Das Archivformat ist ungültig.')
            archiveDocumentsCache = documents
            store.put({ key: archiveDocumentsKey, value: documents })
            removeLegacyValue = true
          } catch (error) {
            emit('zyro-data-sync-error', { message: `Archivdokumente konnten nicht migriert werden: ${error.message}` })
            transaction.abort()
          }
        }
        transaction.oncomplete = () => {
          if (removeLegacyValue) {
            try {
              window.localStorage.removeItem(archiveDocumentsKey)
            } catch (error) {
              emit('zyro-data-sync-error', { message: `Das migrierte Archiv ist gespeichert, aber der alte Browser-Eintrag konnte nicht entfernt werden: ${error.message}` })
            }
          }
          archiveDocumentsLoaded = true
          resolve(true)
        }
        transaction.onerror = () => {
          emit('zyro-data-sync-error', { message: `Archivdokumente konnten nicht migriert werden: ${transaction.error?.message || 'Unbekannter Fehler'}` })
          resolve(false)
        }
        transaction.onabort = () => resolve(false)
      } catch (error) {
        emit('zyro-data-sync-error', { message: `Der lokale Archivspeicher ist nicht verfügbar: ${error.message}` })
        resolve(false)
      }
    }
  })
  : Promise.resolve(true)

const readJson = (key, fallback = null) => {
  const stored = window.localStorage.getItem(key)
  if (stored === null) return fallback
  try {
    return JSON.parse(stored)
  } catch (error) {
    emit('zyro-data-sync-error', { message: `Lokaler Datensatz „${key}“ ist beschädigt: ${error.message}` })
    return fallback
  }
}

const writeJson = (key, value) => {
  window.localStorage.setItem(key, JSON.stringify(value))
  localRevision += 1
}

const getAuthToken = async () => {
  const token = window.localStorage.getItem(sessionTokenKey)
  if (!token) throw new Error('Bitte zuerst anmelden.')
  return token
}

const readCachedUser = () => readJson(sessionStateKey)
const getAccessibleDataKeys = () => {
  const user = readCachedUser()
  const isAdmin = user?.role === 'admin'
  const canAccessFinance = isAdmin || user?.permissions?.includes('finanzen')
  const canAccessSalesTarget = isAdmin || user?.permissions?.includes('analyse')
  return dataKeys.filter((key) => {
    if (!isAdmin && ['zyro-shop-settings', 'zyro-shop-discounts', 'zyro-elster-setup', 'zyro-company-details'].includes(key)) return false
    if (key === 'zyro-cost-calculations' && !isAdmin) return false
    if (key === 'zyro-finance-entries' && !canAccessFinance) return false
    if (['zyro-suppliers', 'zyro-purchase-orders'].includes(key) && !isAdmin && !user?.permissions?.includes('einkauf')) return false
    if (key === 'zyro-payment-settings' && !isAdmin) return false
    if (key === 'zyro-lab-tests' && !isAdmin && !user?.permissions?.includes('rezepturen')) return false
    if (key === 'zyro-machinebau' && !isAdmin && !user?.permissions?.includes('maschinenbau')) return false
    if (key === 'zyro-hr-sensitive' && !isAdmin) return false
    if (key === 'zyro-sales-target' && !canAccessSalesTarget) return false
    return true
  })
}

const requestJson = async (url, options = {}, requiresAuth = true) => {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (requiresAuth) headers.Authorization = `Bearer ${await getAuthToken()}`
  const response = await fetch(url, { ...options, headers })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error || `Firebase-Anfrage fehlgeschlagen (${response.status}).`)
    error.status = response.status
    error.code = result.code
    throw error
  }
  return result
}

const localValue = (key) => key === archiveDocumentsKey ? archiveDocumentsCache : readJson(key)
const saveLocalValue = async (key, value) => {
  if (key === archiveDocumentsKey) {
    if (!await archiveDocumentsReady) throw new Error('Der lokale Archivspeicher ist nicht verfügbar; Dokumente wurden nicht gespeichert.')
    if (!archiveDatabase) throw new Error('Der lokale Archivspeicher ist nicht verfügbar; Dokumente wurden nicht gespeichert.')
    const transaction = archiveDatabase.transaction('collections', 'readwrite')
    if (value === null || value === undefined) transaction.objectStore('collections').delete(key)
    else transaction.objectStore('collections').put({ key, value })
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(new Error(transaction.error?.message || 'Archivdokumente konnten nicht gespeichert werden.'))
      transaction.onabort = () => reject(new Error(transaction.error?.message || 'Speichern der Archivdokumente wurde abgebrochen.'))
    })
    archiveDocumentsCache = Array.isArray(value) ? value : []
    archiveDocumentsLoaded = true
    localRevision += 1
    return
  }
  if (value === null || value === undefined) window.localStorage.removeItem(key)
  else writeJson(key, value)
}

const recordId = (key, record) => String(key === 'zyro-inventory' ? record?.item ?? JSON.stringify(record) : record?.id ?? JSON.stringify(record))

const mergeRecords = (key, base, local, remote) => {
  if (!Array.isArray(local) || !Array.isArray(remote)) return local
  const toMap = (records) => new Map(records.map((record) => [recordId(key, record), record]))
  const baseMap = toMap(Array.isArray(base) ? base : [])
  const localMap = toMap(local)
  const result = toMap(remote)
  const deletedIds = new Set([...baseMap.keys()].filter((id) => !localMap.has(id) || !result.has(id)))
  for (const [id, record] of localMap) {
    if (deletedIds.has(id)) continue
    if (!baseMap.has(id) || JSON.stringify(record) !== JSON.stringify(baseMap.get(id))) result.set(id, record)
  }
  for (const id of deletedIds) result.delete(id)
  return [...result.values()]
}

const scannerMode = new URLSearchParams(window.location.search).get('mode') === 'scanner'
// Am Scanner schreibt nur die Cloud-Funktion (MDE-Buchungen); lokale Stände werden immer durch die Cloud ersetzt.
const cloudOwnedKeys = new Set(['zyro-products', 'zyro-sales-documents', 'zyro-stock-movements', 'zyro-purchase-orders'])
const employeeReadOnlyKeys = new Set(['zyro-schedule', 'zyro-schedule-requests'])

const syncCloudData = async (force = false, requestedKeys = null) => {
  if (!window.localStorage.getItem(sessionTokenKey)) return
  if (syncInProgress) {
    if (!force) return
    await syncFinishedPromise
    return syncCloudData(true, requestedKeys)
  }
  if (!force && Date.now() - lastSyncAt < 8000) return
  syncInProgress = true
  let finishSync
  syncFinishedPromise = new Promise((resolve) => { finishSync = resolve })
  lastSyncAt = Date.now()
  const syncErrors = []
  try {
    if (!await archiveDocumentsReady) throw new Error('Der lokale Archivspeicher ist nicht verfügbar; Cloud-Synchronisierung wurde angehalten, damit keine Dokumente verloren gehen.')
    const state = await readWebSyncState(archiveDatabase, window.localStorage)
    const userId = String(readCachedUser()?.id || '')
    const previousUserId = window.localStorage.getItem('zyro-web-sync-user-id')
    if (userId && previousUserId !== userId) {
      await saveLocalValue('zyro-payment-requests', null)
      await saveLocalValue('zyro-payment-settings', null)
      await saveLocalValue('zyro-schedule', null)
      await saveLocalValue('zyro-schedule-requests', null)
      delete state.revisions['zyro-payment-requests']
      delete state.bases['zyro-payment-requests']
      delete state.revisions['zyro-payment-settings']
      delete state.bases['zyro-payment-settings']
      delete state.revisions['zyro-schedule']
      delete state.bases['zyro-schedule']
      delete state.revisions['zyro-schedule-requests']
      delete state.bases['zyro-schedule-requests']
      window.localStorage.setItem('zyro-web-sync-user-id', userId)
    }
    const manifest = await requestJson('/api/management/data', {
      method: 'POST',
      body: JSON.stringify({ action: 'manifest' }),
    })
    for (const key of requestedKeys || getAccessibleDataKeys()) {
      const remoteRevision = Number(manifest.keys?.[key]?.revision) || 0
      const readOnlyForEmployee = employeeReadOnlyKeys.has(key) && readCachedUser()?.role !== 'admin'
      if (readOnlyForEmployee) {
        const knownRevision = Number(state.revisions[key]) || 0
        if (state.bases[key] === undefined || remoteRevision !== knownRevision) {
          const fetched = await requestJson('/api/management/data', {
            method: 'POST',
            body: JSON.stringify({ action: 'get', key }),
          })
          const value = Array.isArray(fetched.value) ? fetched.value : []
          await saveLocalValue(key, value)
          state.revisions[key] = fetched.revision
          state.bases[key] = JSON.stringify(value)
        }
        continue
      }
      if (scannerMode && cloudOwnedKeys.has(key)) {
        if (remoteRevision > 0 && (state.bases[key] === undefined || remoteRevision !== Number(state.revisions[key]) || JSON.stringify(localValue(key)) !== state.bases[key])) {
          const fetched = await requestJson('/api/management/data', {
            method: 'POST',
            body: JSON.stringify({ action: 'get', key }),
          })
          await saveLocalValue(key, fetched.value)
          state.revisions[key] = fetched.revision
          state.bases[key] = JSON.stringify(fetched.value)
        }
        continue
      }
      let local = localValue(key)
      let localJson = JSON.stringify(local)
      let knownRevision = Number(state.revisions[key]) || 0
      let baseJson = state.bases[key]

      if (baseJson === undefined) {
        if (remoteRevision > 0) {
          const fetched = await requestJson('/api/management/data', {
            method: 'POST',
            body: JSON.stringify({ action: 'get', key }),
          })
          local = fetched.value
          localJson = JSON.stringify(local)
          await saveLocalValue(key, local)
          state.revisions[key] = fetched.revision
          state.bases[key] = localJson
          continue
        }
        baseJson = localJson
        state.bases[key] = baseJson
        state.revisions[key] = 0
        knownRevision = 0
      }

      let pushValue = local
      let pushRevision = knownRevision
      if (remoteRevision !== knownRevision) {
        const fetched = await requestJson('/api/management/data', {
          method: 'POST',
          body: JSON.stringify({ action: 'get', key }),
        })
        const remote = fetched.value
        const base = JSON.parse(baseJson)
        const merged = localJson === baseJson ? remote : mergeRecords(key, base, local, remote)
        if (JSON.stringify(merged) !== localJson) {
          await saveLocalValue(key, merged)
          local = merged
          localJson = JSON.stringify(local)
        }
        state.revisions[key] = fetched.revision
        state.bases[key] = JSON.stringify(remote)
        if (JSON.stringify(merged) === state.bases[key]) continue
        pushValue = merged
        pushRevision = fetched.revision
      }

      if (JSON.stringify(pushValue) === state.bases[key]) continue
      try {
        if (!Array.isArray(pushValue)) {
          const error = new Error(`Gemeinsamer Datensatz „${key}“ muss als Liste gespeichert werden.`)
          error.code = 'INVALID_SHARED_DATA'
          throw error
        }
        const result = await requestJson('/api/management/data', {
          method: 'POST',
          body: JSON.stringify({ action: 'put', key, baseRevision: pushRevision, value: pushValue }),
        })
        state.revisions[key] = result.revision
        state.bases[key] = JSON.stringify(pushValue)
      } catch (error) {
        if (error.code === 'INVALID_SHARED_DATA' || error.status === 400) {
          if (key === archiveDocumentsKey) {
            syncErrors.push(`Archivdaten wurden von der Cloud abgelehnt und bleiben lokal erhalten. (${error.message})`)
            continue
          }
          const backupKey = `zyro-web-invalid-data-backup-${key}`
          try {
            if (window.localStorage.getItem(backupKey) === null) {
              window.localStorage.setItem(backupKey, JSON.stringify({
                savedAt: new Date().toISOString(),
                value: pushValue,
              }))
            }
          } catch (backupError) {
            syncErrors.push(`Datensatz „${key}“ wurde von der Cloud abgelehnt und konnte nicht lokal gesichert werden: ${backupError.message}`)
            continue
          }
          const remote = await requestJson('/api/management/data', {
            method: 'POST',
            body: JSON.stringify({ action: 'get', key }),
          })
          if (remote.value === null || Array.isArray(remote.value)) {
            const restoredValue = Array.isArray(remote.value) ? remote.value : []
            await saveLocalValue(key, restoredValue)
            state.revisions[key] = remote.revision
            state.bases[key] = JSON.stringify(restoredValue)
            emit('zyro-data-sync-restored', { key, value: restoredValue })
            syncErrors.push(`Ungültiger lokaler Datensatz „${key}“ wurde gesichert und durch den Cloud-Stand ersetzt.`)
            continue
          }
          syncErrors.push(`Datensatz „${key}“ wurde abgelehnt, aber der Cloud-Stand ist ebenfalls ungültig. Der lokale Stand bleibt erhalten und ist gesichert. (${error.message})`)
          continue
        }
        if (error.status === 409) {
          if (requestedKeys?.includes(key)) throw new Error('Der Cloud-Stand wurde gleichzeitig geändert. Bitte erneut versuchen.')
          continue
        }
        throw error
      }
    }
    await writeWebSyncState(archiveDatabase, state)
    if (syncErrors.length > 0) {
      emit('zyro-data-sync-error', { message: syncErrors.join(' ') })
    } else {
      emit('zyro-data-sync-success')
    }
    return { success: syncErrors.length === 0, message: syncErrors.join(' ') }
  } finally {
    syncInProgress = false
    finishSync()
  }
}

const scheduleSync = () => {
  window.clearTimeout(pushTimer)
  pushTimer = window.setTimeout(() => {
    syncCloudData(true).catch((error) => emit('zyro-data-sync-error', { message: error.message }))
  }, 3000)
}

const syncWhenAvailable = () => {
  if (!window.localStorage.getItem(sessionTokenKey)) return
  syncCloudData(true).catch((error) => emit('zyro-data-sync-error', { message: error.message }))
}

const syncAfterAuthentication = async () => {
  try {
    await syncCloudData(true)
  } catch (error) {
    emit('zyro-data-sync-error', { message: error.message })
  }
}

if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (isPageHidden()) return
    syncCloudData().catch((error) => emit('zyro-data-sync-error', { message: error.message }))
  }, cloudPollIntervalMs)
  window.addEventListener('online', syncWhenAvailable)
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncWhenAvailable()
  })

  if (!window.zyroCalls) {
    const emitCallMessage = (message) => callMessageListeners.forEach((listener) => listener(message))
    const emitCallError = (message) => callErrorListeners.forEach((listener) => listener(message))
    const callRequest = (action, extra = {}) => requestJson('/api/management/calls', {
      method: 'POST',
      body: JSON.stringify({ action, clientId: callConnection?.clientId, ...extra }),
    })
    const pollCalls = async (connection) => {
      while (callConnection === connection && connection.active) {
        try {
          const result = await callRequest('poll')
          if (callConnection !== connection || !connection.active) return
          emitCallMessage({ type: 'call:users', users: result.users || [] })
          const messages = result.messages || []
          for (const message of messages) {
            const type = String(message?.type || '')
            if (['call:incoming', 'call:ringing', 'call:accepted', 'call:signal'].includes(type)) connection.inCall = true
            if (['call:ended', 'call:rejected', 'call:unavailable'].includes(type)) connection.inCall = false
            emitCallMessage(message)
          }
          // Vorher lief diese Schleife ohne Pause (mehrere Abfragen pro Sekunde).
          // Während eines Verbindungsaufbaus kurz nachfragen, sonst ruhen.
          await wait(messages.length > 0 || connection.inCall
            ? callPollActiveMs
            : isPageHidden() ? callPollIdleHiddenMs : callPollIdleVisibleMs)
        } catch (error) {
          if (callConnection !== connection || !connection.active) return
          emitCallError(error.message)
          if (error.status === 401 || error.status === 409) {
            connection.active = false
            callConnection = null
            callDisconnectListeners.forEach((listener) => listener())
            return
          }
          await new Promise((resolve) => window.setTimeout(resolve, callPollIntervalMs))
        }
      }
    }

    window.zyroCalls = {
      connect: async () => {
        if (callConnection?.active) return { connected: true }
        const connection = { clientId: crypto.randomUUID(), active: true }
        callConnection = connection
        try {
          const result = await callRequest('connect', { clientId: connection.clientId })
          if (callConnection !== connection) throw new Error('Telefonverbindung wurde beendet.')
          emitCallMessage({ type: 'call:ready', users: result.users || [] })
          pollCalls(connection)
          return { connected: true }
        } catch (error) {
          connection.active = false
          if (callConnection === connection) callConnection = null
          throw error
        }
      },
      send: (message) => {
        if (callConnection) callConnection.inCall = !['call:end', 'call:reject'].includes(String(message?.type || ''))
        callRequest('send', { message }).then((result) => {
          if (result.message) emitCallMessage(result.message)
        }).catch((error) => emitCallError(error.message))
      },
      disconnect: async () => {
        const connection = callConnection
        if (!connection) return { disconnected: true }
        connection.active = false
        callConnection = null
        try {
          await callRequest('disconnect', { clientId: connection.clientId })
        } finally {
          callDisconnectListeners.forEach((listener) => listener())
        }
        return { disconnected: true }
      },
      onMessage: (listener) => {
        callMessageListeners.add(listener)
        return () => callMessageListeners.delete(listener)
      },
      onError: (listener) => {
        callErrorListeners.add(listener)
        return () => callErrorListeners.delete(listener)
      },
      onDisconnected: (listener) => {
        callDisconnectListeners.add(listener)
        return () => callDisconnectListeners.delete(listener)
      },
    }
  }
}

const unavailable = (feature) => Promise.reject(new Error(`${feature} ist in der Web-App noch nicht verfügbar.`))

if (typeof window !== 'undefined' && !window.zyroMde) {
  const mdeRequest = (action, payload = {}) => requestJson('/api/management/mde', {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
  })
  window.zyroMde = {
    receiveStock: (receipt) => mdeRequest('receive', receipt),
    receivePurchaseOrder: (receipt) => mdeRequest('receive-purchase-order', receipt),
    acceptOrder: (orderId) => mdeRequest('accept', { orderId }),
    scanProduct: (orderId, barcode) => mdeRequest('scan', { orderId, barcode }),
    packOrder: (packing) => mdeRequest('pack', packing),
    updateShipment: (shipment) => mdeRequest('shipment', shipment),
    getDpdSettings: () => mdeRequest('dpd-settings-status'),
    saveDpdSettings: (settings) => mdeRequest('dpd-settings-save', settings),
    removeDpdSettings: () => mdeRequest('dpd-settings-delete'),
    confirmDelivery: (orderId) => mdeRequest('delivery-confirm', { orderId }),
    requestReview: (orderId) => mdeRequest('review-request', { orderId }),
    listProductReviews: () => mdeRequest('reviews-list'),
    moderateProductReview: (reviewId, decision) => mdeRequest('review-moderate', { reviewId, decision }),
    notifyShipment: (orderId) => mdeRequest('notify-shipment', { orderId }),
    notifyPacked: (orderId) => mdeRequest('notify', { orderId }),
  }
}

if (typeof window !== 'undefined' && !window.zyroAuth) {
  window.zyroAuth = {
    getStatus: async () => {
      const sessionToken = window.localStorage.getItem(sessionTokenKey)
      if (!sessionToken) return { needsSetup: false, bootstrapKey: '', users: [] }
      try {
        const status = await requestJson('/api/management/auth')
        window.localStorage.setItem(sessionStateKey, JSON.stringify(status.user))
        window.localStorage.setItem('zyro-users', JSON.stringify(status.users))
        await syncAfterAuthentication()
        return {
          needsSetup: false,
          bootstrapKey: '',
          users: status.users,
          sessionUser: status.user,
          sessionToken,
        }
      } catch (error) {
        if (error.status === 401) {
          window.localStorage.removeItem(sessionTokenKey)
          window.localStorage.removeItem(sessionStateKey)
          return { needsSetup: false, bootstrapKey: '', users: [] }
        }
        const cachedUser = readCachedUser()
        if (!cachedUser || (error.status && error.status < 500)) throw error
        return {
          needsSetup: false,
          bootstrapKey: '',
          users: readJson('zyro-users', [cachedUser]),
          sessionUser: cachedUser,
          sessionToken: sessionToken || 'offline',
        }
      }
    },
    login: async (credentials) => {
      const result = await requestJson('/api/management/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }, false)
      const sessionToken = result.sessionToken
      window.localStorage.setItem(sessionTokenKey, sessionToken)
      const status = await requestJson('/api/management/auth')
      window.localStorage.setItem(sessionStateKey, JSON.stringify(status.user))
      window.localStorage.setItem('zyro-users', JSON.stringify(status.users))
      await syncAfterAuthentication()
      return { user: status.user, users: status.users, sessionToken }
    },
    logout: async () => {
      try {
        if (window.localStorage.getItem(sessionTokenKey)) {
          await requestJson('/api/management/auth', {
            method: 'POST',
            body: JSON.stringify({ action: 'logout' }),
          })
        }
      } finally {
        window.localStorage.removeItem(sessionTokenKey)
        window.localStorage.removeItem(sessionStateKey)
      }
      return { success: true }
    },
    updateProfile: async (profile) => {
      const result = await requestJson('/api/management/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'profile', profile }),
      })
      window.localStorage.setItem(sessionStateKey, JSON.stringify(result.user))
      window.localStorage.setItem('zyro-users', JSON.stringify(result.users))
      return result
    },
    updateAccount: (account) => requestJson('/api/management/auth', {
      method: 'POST',
      body: JSON.stringify({ action: 'account', ...account }),
    }),
    register: () => unavailable('Benutzerregistrierung'),
    issueKey: () => unavailable('Aktivierungsschlüssel'),
    updateUserPermissions: () => unavailable('Benutzerrechte'),
    removeUser: () => unavailable('Benutzerverwaltung'),
  }

  window.zyroData = {
    syncNow: async () => {
      if (!window.localStorage.getItem(sessionTokenKey)) throw new Error('Bitte zuerst anmelden.')
      return syncCloudData(true)
    },
    get: (key) => {
      if (key === 'zyro-schedule' && !readCachedUser()) return { found: true, value: [] }
      if (key === archiveDocumentsKey && archiveDocumentsLoaded) return { found: true, value: archiveDocumentsCache }
      if (key === 'zyro-lab-tests'
        && readCachedUser()?.role !== 'admin'
        && !readCachedUser()?.permissions?.includes('rezepturen')) return { found: false, value: null }
      if (key === 'zyro-machinebau'
        && readCachedUser()?.role !== 'admin'
        && !readCachedUser()?.permissions?.includes('maschinenbau')) return { found: false, value: null }
      if (key === 'zyro-hr-sensitive' && readCachedUser()?.role !== 'admin') return { found: false, value: null }
      if (key === 'zyro-cost-calculations' && readCachedUser()?.role !== 'admin') return { found: false, value: null }
      if (key === 'zyro-elster-setup' && readCachedUser()?.role !== 'admin') return { found: false, value: null }
      if (key === 'zyro-company-details' && readCachedUser()?.role !== 'admin') return { found: false, value: null }
      if (key === 'zyro-payment-settings' && readCachedUser()?.role !== 'admin') return { found: false, value: null }
      if (key === 'zyro-finance-entries'
        && readCachedUser()?.role !== 'admin'
        && !readCachedUser()?.permissions?.includes('finanzen')) return { found: false, value: null }
      if (['zyro-suppliers', 'zyro-purchase-orders'].includes(key)
        && readCachedUser()?.role !== 'admin'
        && !readCachedUser()?.permissions?.includes('einkauf')) return { found: false, value: null }
      const stored = window.localStorage.getItem(key)
      if (stored === null) return { found: false, value: null }
      const value = readJson(key)
      if (key === 'zyro-schedule' && readCachedUser()?.role !== 'admin') {
        return {
          found: true,
          value: Array.isArray(value)
            ? value.filter((shift) => String(shift.employeeId) === String(readCachedUser()?.id || ''))
            : [],
        }
      }
      if (key === 'zyro-payment-requests' && readCachedUser()?.role !== 'admin') {
        return {
          found: true,
          value: Array.isArray(value) ? value.filter((entry) => String(entry.requesterId) === String(readCachedUser()?.id || '')) : [],
        }
      }
      if (key === 'zyro-schedule-requests' && readCachedUser()?.role !== 'admin') {
        const employeeId = String(readCachedUser()?.id || '')
        return {
          found: true,
          value: Array.isArray(value) ? value.filter((entry) => (
            String(entry.requesterId) === employeeId || String(entry.targetEmployeeId || '') === employeeId
          )) : [],
        }
      }
      return { found: true, value }
    },
    set: async (key, value) => {
      if (key === 'zyro-schedule' && readCachedUser()?.role !== 'admin') {
        return { success: false, message: 'Nur Admins dürfen den Dienstplan ändern.' }
      }
      if (key === 'zyro-lab-tests'
        && readCachedUser()?.role !== 'admin'
        && !readCachedUser()?.permissions?.includes('rezepturen')) {
        return { success: false, message: 'Du hast keine Rezeptur-Berechtigung.' }
      }
      if (key === 'zyro-machinebau'
        && readCachedUser()?.role !== 'admin'
        && !readCachedUser()?.permissions?.includes('maschinenbau')) {
        return { success: false, message: 'Du hast keine Maschinenbau-Berechtigung.' }
      }
      if (key === 'zyro-hr-sensitive' && readCachedUser()?.role !== 'admin') {
        return { success: false, message: 'Geschützte Mitarbeiterdaten dürfen nur von Admins verwaltet werden.' }
      }
      const isPaymentData = ['zyro-payment-requests', 'zyro-payment-settings'].includes(key)
      if (isPaymentData && !window.localStorage.getItem(sessionTokenKey)) {
        return { success: false, message: 'Bitte zuerst anmelden.' }
      }
      if (isPaymentData) {
        try {
          await syncCloudData(true, [key])
        } catch (error) {
          return { success: false, message: `Cloud-Daten konnten nicht geladen werden: ${error.message}` }
        }
      }
      if (key === 'zyro-cost-calculations' && readCachedUser()?.role !== 'admin') {
        return { success: false, message: 'Kalkulationen dürfen nur von einem Admin verwaltet werden.' }
      }
      if (key === 'zyro-elster-setup' && readCachedUser()?.role !== 'admin') {
        return { success: false, message: 'ELSTER-Einstellungen dürfen nur von einem Admin verwaltet werden.' }
      }
      if (key === 'zyro-company-details' && readCachedUser()?.role !== 'admin') {
        return { success: false, message: 'Firmendaten dürfen nur von einem Admin verwaltet werden.' }
      }
      if (key === 'zyro-bottler-details' && readCachedUser()?.role !== 'admin') {
        return { success: false, message: 'Lohnabfüller-Daten dürfen nur von einem Admin verwaltet werden.' }
      }
      if (key === 'zyro-payment-settings' && readCachedUser()?.role !== 'admin') {
        return { success: false, message: 'Das Zahlungskonto darf nur von einem Admin verwaltet werden.' }
      }
      if (key === 'zyro-finance-entries'
        && readCachedUser()?.role !== 'admin'
        && !readCachedUser()?.permissions?.includes('finanzen')) {
        return { success: false, message: 'Du hast keine Finanzen-Berechtigung.' }
      }
      if (['zyro-suppliers', 'zyro-purchase-orders'].includes(key)
        && readCachedUser()?.role !== 'admin'
        && !readCachedUser()?.permissions?.includes('einkauf')) {
        return { success: false, message: 'Für Einkaufsdaten brauchst du die Einkaufsberechtigung.' }
      }
      const previousValue = readJson(key)
      try {
        await saveLocalValue(key, value)
        if (isPaymentData) {
          await syncCloudData(true)
        }
      } catch (error) {
        if (isPaymentData) {
          await saveLocalValue(key, previousValue)
        }
        return { success: false, message: `Speichern fehlgeschlagen: ${error.message}` }
      }
      if (getAccessibleDataKeys().includes(key)) scheduleSync()
      return { success: true }
    },
    createScheduleRequest: async (payload) => {
      const result = await requestJson('/api/management/data', {
        method: 'POST',
        body: JSON.stringify({ action: 'schedule-request-create', key: 'zyro-schedule-requests', ...payload }),
      })
      await syncCloudData(true, ['zyro-schedule-requests'])
      return result
    },
    respondScheduleRequest: async (payload) => {
      const result = await requestJson('/api/management/data', {
        method: 'POST',
        body: JSON.stringify({ action: 'schedule-request-respond', key: 'zyro-schedule-requests', ...payload }),
      })
      await syncCloudData(true, ['zyro-schedule-requests'])
      return result
    },
    getSnapshot: async () => {
      if (!await archiveDocumentsReady) throw new Error('Der lokale Archivspeicher ist nicht verfügbar; lokale Dokumente bleiben erhalten.')
      try {
        await syncCloudData()
      } catch (error) {
        emit('zyro-data-sync-error', { message: error.message })
      }
      return {
        revision: `web-${localRevision}`,
        data: Object.fromEntries(getAccessibleDataKeys().map((key) => [
          key,
          key === 'zyro-schedule' && !readCachedUser() ? []
            : key === 'zyro-schedule-requests' && readCachedUser()?.role !== 'admin'
              ? (Array.isArray(localValue(key)) ? localValue(key).filter((entry) => (
                String(entry.requesterId) === String(readCachedUser()?.id || '')
                || String(entry.targetEmployeeId || '') === String(readCachedUser()?.id || '')
              )) : [])
              : localValue(key),
        ])),
      }
    },
    getNetworkStatus: async () => ({
      mode: 'local',
      hostAddress: '',
      addresses: [],
      port: 0,
      running: false,
      accessCode: '',
      cloudEnabled: true,
    }),
    startHost: () => unavailable('PC-Netzwerkserver'),
    stopHost: () => unavailable('PC-Netzwerkserver'),
    connectHost: () => unavailable('PC-Netzwerkverbindung'),
    disconnectHost: () => unavailable('PC-Netzwerkverbindung'),
  }

  const financeReceiptRequest = async (action, payload = {}) => requestJson('/api/management/finance-receipt', {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
  })
  window.zyroFinanceReceipts = {
    upload: async (entryId, fileName, contentType, bytes) => {
      const response = await fetch('/api/management/finance-receipt', {
        method: 'POST',
        headers: {
          Authorization: `****** getAuthToken()}`,
          'x-zyro-action': 'upload',
          'x-zyro-receipt-entry': entryId,
          'x-zyro-receipt-name': encodeURIComponent(fileName),
          'Content-Type': contentType,
        },
        body: bytes,
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || `Beleg-Upload fehlgeschlagen (${response.status}).`)
      return result
    },
    get: async (entryId, receiptId) => {
      const result = await financeReceiptRequest('get', { entryId, receiptId })
      return { receipt: result.receipt, data: Uint8Array.from(atob(result.data), (character) => character.charCodeAt(0)) }
    },
    delete: (entryId, receiptId) => financeReceiptRequest('delete', { entryId, receiptId }),
  }
  const paywiseRequest = (action, payload = {}) => requestJson('/api/management/paywise', {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
  })
  window.zyroNewsletter = {
    request: (action, payload) => requestJson('/api/management/newsletter', {
      method: 'POST',
      body: JSON.stringify({ action, payload: payload || {} }),
    }),
  }
  window.zyroEvents = {
    list: (since) => requestJson(`/api/management/events?since=${encodeURIComponent(Number(since) || 0)}`),
  }
  window.zyroPaywise = {
    status: () => paywiseRequest('status'),
    submit: (submission) => paywiseRequest('submit', submission),
    mahnserviceGet: (invoiceId) => paywiseRequest('mahnservice-get', { invoiceId }),
    mahnserviceSubmit: (submission) => paywiseRequest('mahnservice-submit', submission),
    mahnservicePayment: (invoiceId) => paywiseRequest('mahnservice-payment', { invoiceId }),
  }
}
