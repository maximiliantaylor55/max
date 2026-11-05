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
  'zyro-sales-target',
  'zyro-inventory',
  'zyro-stock-movements',
  'zyro-reports',
  'zyro-machinebau',
  'zyro-hr-sensitive',
  'zyro-archive-documents',
  'zyro-delete-requests',
  'zyro-audit-log',
  'zyro-shop-settings',
  'zyro-shop-discounts',
]

const syncStateKey = 'zyro-web-cloud-sync'
const sessionStateKey = 'zyro-web-current-user'
const sessionTokenKey = 'zyro-web-session-token'
const cloudPollIntervalMs = 10 * 1000
const callPollIntervalMs = 1500
let localRevision = Date.now()
let lastSyncAt = 0
let syncInProgress = false
let syncFinishedPromise = Promise.resolve()
let pushTimer
let callConnection
const callMessageListeners = new Set()
const callErrorListeners = new Set()
const callDisconnectListeners = new Set()

const emit = (name, detail = {}) => window.dispatchEvent(new CustomEvent(name, { detail }))

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

const localValue = (key) => readJson(key)
const saveLocalValue = (key, value) => {
  if (value === null || value === undefined) window.localStorage.removeItem(key)
  else writeJson(key, value)
}

const readSyncState = () => readJson(syncStateKey, { revisions: {}, bases: {} }) || { revisions: {}, bases: {} }

const writeSyncState = (state) => window.localStorage.setItem(syncStateKey, JSON.stringify(state))

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
    const state = readSyncState()
    const userId = String(readCachedUser()?.id || '')
    const previousUserId = window.localStorage.getItem('zyro-web-sync-user-id')
    if (userId && previousUserId !== userId) {
      saveLocalValue('zyro-payment-requests', null)
      saveLocalValue('zyro-payment-settings', null)
      delete state.revisions['zyro-payment-requests']
      delete state.bases['zyro-payment-requests']
      delete state.revisions['zyro-payment-settings']
      delete state.bases['zyro-payment-settings']
      window.localStorage.setItem('zyro-web-sync-user-id', userId)
    }
    const manifest = await requestJson('/api/management/data', {
      method: 'POST',
      body: JSON.stringify({ action: 'manifest' }),
    })
    for (const key of requestedKeys || getAccessibleDataKeys()) {
      const remoteRevision = Number(manifest.keys?.[key]?.revision) || 0
      if (scannerMode && cloudOwnedKeys.has(key)) {
        if (remoteRevision > 0 && (state.bases[key] === undefined || remoteRevision !== Number(state.revisions[key]) || JSON.stringify(localValue(key)) !== state.bases[key])) {
          const fetched = await requestJson('/api/management/data', {
            method: 'POST',
            body: JSON.stringify({ action: 'get', key }),
          })
          saveLocalValue(key, fetched.value)
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
          saveLocalValue(key, local)
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
          saveLocalValue(key, merged)
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
            saveLocalValue(key, restoredValue)
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
    writeSyncState(state)
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
          for (const message of result.messages || []) emitCallMessage(message)
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
      if (key === 'zyro-payment-requests' && readCachedUser()?.role !== 'admin') {
        return {
          found: true,
          value: Array.isArray(value) ? value.filter((entry) => String(entry.requesterId) === String(readCachedUser()?.id || '')) : [],
        }
      }
      return { found: true, value }
    },
    set: async (key, value) => {
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
        saveLocalValue(key, value)
        if (isPaymentData) {
          await syncCloudData(true)
        }
      } catch (error) {
        if (isPaymentData) {
          saveLocalValue(key, previousValue)
        }
        return { success: false, message: `Speichern fehlgeschlagen: ${error.message}` }
      }
      if (getAccessibleDataKeys().includes(key)) scheduleSync()
      return { success: true }
    },
    getSnapshot: async () => {
      try {
        await syncCloudData()
      } catch (error) {
        emit('zyro-data-sync-error', { message: error.message })
      }
      return {
        revision: `web-${localRevision}`,
        data: Object.fromEntries(getAccessibleDataKeys().map((key) => [key, localValue(key)])),
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
}
