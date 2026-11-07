const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const cloudEndpoint = 'https://europe-west3-zyro-78855.cloudfunctions.net/cloudData'
const pollIntervalMs = 10 * 1000
const pushDelayMs = 3 * 1000
const cloudRetryDelaysMs = [500, 1500, 4000]

const recordId = (getId, key, record) => {
  const id = getId(key, record)
  return id === undefined || id === null ? JSON.stringify(record) : String(id)
}

// Three-way merge by record id: remote state plus the local changes made since the last sync.
const mergeRecords = (key, base, local, remote, getId) => {
  if (!Array.isArray(local) || !Array.isArray(remote)) return local
  const toMap = (list) => new Map((Array.isArray(list) ? list : []).map((record) => [recordId(getId, key, record), record]))
  const baseMap = toMap(base)
  const localMap = toMap(local)
  const result = toMap(remote)
  const deletedIds = new Set([...baseMap.keys()].filter((id) => !localMap.has(id) || !result.has(id)))
  for (const [id, record] of localMap) {
    if (deletedIds.has(id)) continue
    const baseRecord = baseMap.get(id)
    if (baseRecord === undefined || JSON.stringify(record) !== JSON.stringify(baseRecord)) result.set(id, record)
  }
  for (const id of deletedIds) result.delete(id)
  return [...result.values()]
}

const encodeValue = (value) => zlib.gzipSync(Buffer.from(JSON.stringify(value ?? null), 'utf8')).toString('base64')
const decodeValue = (data) => JSON.parse(zlib.gunzipSync(Buffer.from(data, 'base64')).toString('utf8'))

const createCloudSync = ({
  statePath,
  keys,
  getRecordId,
  readBusinessData,
  writeBusinessData,
  acquireWriteLock,
  getToken,
  backupLocalData,
  onRemoteChange = () => {},
}) => {
  let state = { enabled: false, lastSyncAt: '', lastError: '', revisions: {}, bases: {} }
  let timer = null
  let pushTimer = null
  let runningPromise = null
  let rerunRequested = false

  try {
    state = { ...state, ...JSON.parse(fs.readFileSync(statePath, 'utf8')) }
  } catch {
    // No sync state yet.
  }

  const saveState = () => {
    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    const temporaryPath = `${statePath}.tmp`
    fs.writeFileSync(temporaryPath, JSON.stringify(state), 'utf8')
    fs.renameSync(temporaryPath, statePath)
  }

  const call = async (body, token) => {
    let lastError
    for (let attempt = 0; attempt <= cloudRetryDelaysMs.length; attempt += 1) {
      try {
        const response = await fetch(cloudEndpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        })
        const result = await response.json().catch(() => ({}))
        if (response.status === 409) return { conflict: true, ...result }
        if (response.ok) return result
        if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
          const error = new Error(response.status === 401 || response.status === 403
            ? 'Das Admin-Token wurde von der Cloud abgelehnt.'
            : result.error || `Cloud-Fehler (${response.status}).`)
          error.retryable = false
          throw error
        }
        lastError = new Error(result.error || `Cloud-Fehler (${response.status}).`)
      } catch (error) {
        if (error.retryable === false) throw error
        lastError = error
      }
      if (attempt < cloudRetryDelaysMs.length) {
        await new Promise((resolve) => setTimeout(resolve, cloudRetryDelaysMs[attempt]))
      }
    }
    throw new Error(`Cloud vorübergehend nicht erreichbar: ${lastError?.message || 'Unbekannter Netzwerkfehler'}`)
  }

  const writeLocalKeys = (changes) => {
    const releaseLock = acquireWriteLock()
    try {
      const data = readBusinessData()
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) delete data[key]
        else data[key] = value
      }
      data._meta = { revision: `${Date.now()}-cloud-${Math.random()}` }
      writeBusinessData(data)
    } finally {
      releaseLock()
    }
  }

  const syncKey = async (key, remoteRevision, token, conflictAttempt = 0) => {
    const knownRevision = state.revisions[key] || 0
    const local = readBusinessData()[key]
    const localJson = JSON.stringify(local ?? null)
    const baseJson = state.bases[key] ?? 'null'
    const localChanged = localJson !== baseJson
    if (remoteRevision === knownRevision && !localChanged) return false

    let pushValue = local
    let pushRevision = knownRevision
    if (remoteRevision !== knownRevision) {
      const fetched = await call({ action: 'get', key }, token)
      const remote = fetched.data ? decodeValue(fetched.data) : null
      const merged = localChanged ? mergeRecords(key, JSON.parse(baseJson), local, remote, getRecordId) : remote
      if (JSON.stringify(merged ?? null) !== localJson) {
        const current = readBusinessData()[key]
        // The app wrote to this key while we were syncing; merge again on the next run.
        if (JSON.stringify(current ?? null) !== localJson) return true
        writeLocalKeys({ [key]: merged ?? undefined })
        onRemoteChange()
      }
      state.revisions[key] = fetched.revision
      state.bases[key] = JSON.stringify(remote ?? null)
      if (JSON.stringify(merged ?? null) === state.bases[key]) return true
      pushValue = merged
      pushRevision = fetched.revision
    }

    const result = await call({ action: 'put', key, baseRevision: pushRevision, data: encodeValue(pushValue) }, token)
    if (result.conflict) {
      if (conflictAttempt >= 2) throw new Error('Der Cloud-Stand wurde mehrfach gleichzeitig geändert.')
      return syncKey(key, Number(result.revision) || 0, token, conflictAttempt + 1)
    }
    state.revisions[key] = result.revision
    state.bases[key] = JSON.stringify(pushValue ?? null)
    return true
  }

  const syncNow = async () => {
    if (!state.enabled) return getStatus()
    if (runningPromise) {
      rerunRequested = true
      return runningPromise
    }
    runningPromise = (async () => {
      try {
        do {
          rerunRequested = false
          const token = await getToken()
          if (!token) throw new Error('Bitte zuerst das Admin-Token einrichten.')
          const manifest = (await call({ action: 'manifest' }, token)).keys || {}
          const errors = []
          for (const key of keys) {
            try {
              await syncKey(key, manifest[key]?.revision || 0, token)
            } catch (error) {
              errors.push(`${key}: ${error.message}`)
            }
          }
          if (errors.length > 0) {
            const summary = errors.slice(0, 5).join(' | ')
            state.lastError = errors.length > 5 ? `${summary} | und ${errors.length - 5} weitere Fehler` : summary
          } else {
            state.lastSyncAt = new Date().toISOString()
            state.lastError = ''
          }
        } while (rerunRequested && state.enabled)
      } catch (error) {
        state.lastError = error.message
      } finally {
        runningPromise = null
        saveState()
      }
      return getStatus()
    })()
    return runningPromise
  }

  const schedulePush = () => {
    if (!state.enabled) return
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => { syncNow() }, pushDelayMs)
    pushTimer.unref?.()
  }

  const startTimer = () => {
    clearInterval(timer)
    if (!state.enabled) return
    timer = setInterval(() => { syncNow() }, pollIntervalMs)
    timer.unref?.()
    syncNow()
  }

  const getStatus = () => ({
    enabled: state.enabled,
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError,
  })

  const enable = async () => {
    const token = await getToken()
    if (!token) throw new Error('Bitte zuerst das Admin-Token einrichten.')
    const manifest = (await call({ action: 'manifest' }, token)).keys || {}
    const remoteKeys = keys.filter((key) => manifest[key])
    state.revisions = {}
    state.bases = {}
    if (remoteKeys.length > 0) {
      // Existing cloud data wins; the local state is saved to a backup first.
      await backupLocalData()
      const changes = {}
      for (const key of keys) {
        if (!manifest[key]) continue
        const fetched = await call({ action: 'get', key }, token)
        const value = fetched.data ? decodeValue(fetched.data) : null
        changes[key] = value ?? undefined
        state.revisions[key] = fetched.revision
        state.bases[key] = JSON.stringify(value ?? null)
      }
      writeLocalKeys(changes)
    }
    state.enabled = true
    state.lastError = ''
    saveState()
    startTimer()
    return { ...getStatus(), downloaded: remoteKeys.length > 0 }
  }

  const disable = () => {
    state.enabled = false
    clearInterval(timer)
    clearTimeout(pushTimer)
    saveState()
    return getStatus()
  }

  return { enable, disable, syncNow, schedulePush, startTimer, getStatus, isEnabled: () => state.enabled }
}

module.exports = { createCloudSync, mergeRecords }
