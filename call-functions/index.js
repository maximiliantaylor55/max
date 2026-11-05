const crypto = require('node:crypto')
const zlib = require('node:zlib')
const admin = require('firebase-admin')
const { onRequest } = require('firebase-functions/v2/https')

admin.initializeApp()

const db = admin.firestore()
const region = 'europe-west3'
const allowedOrigins = new Set([
  'https://zyro-78855.web.app',
  'https://zyro-78855.firebaseapp.com',
  'https://www.xn--zyro-getrnke-ocb.de',
  'https://xn--zyro-getrnke-ocb.de',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])
const webCallPresenceRef = db.collection('webAppCallPresence')
const webCallInboxRef = db.collection('webAppCallInboxes')
const webCallIdPattern = /^[A-Za-z0-9_-]{1,128}$/
const webCallClientIdPattern = /^[A-Fa-f0-9-]{36}$/
const webCallMessageLimit = 64 * 1024

const setCors = (request, response) => {
  const origin = request.get('origin')
  if (allowedOrigins.has(origin)) response.set('Access-Control-Allow-Origin', origin)
  response.set('Vary', 'Origin')
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  response.set('Access-Control-Max-Age', '3600')
}

const sendMethodError = (response) => response.status(405).json({ error: 'Methode nicht erlaubt.' })

const readCloudUsers = async () => {
  const manifest = (await db.collection('appData').doc('manifest').get()).data()?.keys || {}
  const entry = manifest['zyro-users']
  if (!entry || !Number.isSafeInteger(entry.chunkCount) || entry.chunkCount < 1) return []
  const refs = Array.from({ length: entry.chunkCount }, (_, index) => (
    db.collection('appDataChunks').doc(`zyro-users_${String(index).padStart(3, '0')}`)
  ))
  const snapshots = await db.getAll(...refs)
  const encoded = snapshots.map((snapshot) => snapshot.data()?.data || '').join('')
  return JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'))
}

const verifyWebAppPassword = (password, passwordHash) => {
  const [salt, expectedHash] = String(passwordHash || '').split(':')
  if (!salt || !expectedHash) return false
  const expected = Buffer.from(expectedHash, 'hex')
  const actual = crypto.scryptSync(password, salt, 64)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

const enforceLoginRateLimit = async (request, username) => {
  const ipHash = crypto.createHash('sha256').update(String(request.ip || 'unbekannt')).digest('hex')
  const id = crypto.createHash('sha256').update(`${ipHash}:${username.toLowerCase()}`).digest('hex')
  const ref = db.collection('webAppLoginRateLimits').doc(id)
  const now = Date.now()
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const previous = snapshot.exists ? snapshot.data() : {}
    const activeWindow = Number(previous.windowStart || 0) > now - 15 * 60 * 1000
    const count = activeWindow ? Number(previous.count || 0) : 0
    if (count >= 10) throw new Error('Zu viele Anmeldeversuche. Bitte später erneut versuchen.')
    transaction.set(ref, { windowStart: activeWindow ? previous.windowStart : now, count: count + 1 })
  })
}

const createCallSession = async (request, response) => {
  const username = String(request.body?.username || '').trim()
  const password = String(request.body?.password || '')
  if (!username || username.length > 100 || !password || password.length > 1024) {
    return response.status(400).json({ error: 'Benutzername oder Passwort ungültig.' })
  }
  await enforceLoginRateLimit(request, username)
  const users = await readCloudUsers()
  const user = (Array.isArray(users) ? users : []).find((entry) => entry.username?.toLowerCase() === username.toLowerCase())
  if (!user || !verifyWebAppPassword(password, user.passwordHash)) {
    return response.status(401).json({ error: 'Benutzername oder Passwort falsch.' })
  }
  const sessionToken = crypto.randomBytes(32).toString('base64url')
  const sessionId = crypto.createHash('sha256').update(sessionToken).digest('hex')
  await db.collection('webAppSessions').doc(sessionId).create({
    userId: String(user.id),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })
  return response.json({
    sessionToken,
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  })
}

const getActor = async (request) => {
  const authorization = String(request.get('authorization') || '')
  const sessionToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) throw new Error('Anmeldung erforderlich.')
  const sessionId = crypto.createHash('sha256').update(sessionToken).digest('hex')
  const session = (await db.collection('webAppSessions').doc(sessionId).get()).data()
  if (!session?.expiresAt || session.expiresAt.toMillis() <= Date.now()) {
    throw new Error('Anmeldung abgelaufen. Bitte erneut anmelden.')
  }
  const users = await readCloudUsers()
  const actor = (Array.isArray(users) ? users : []).find((user) => String(user.id) === String(session.userId))
  if (!actor) throw new Error('Benutzerkonto nicht gefunden. Bitte erneut anmelden.')
  return actor
}

const enqueueEvent = (transaction, userId, message) => {
  const ref = webCallInboxRef.doc(String(userId)).collection('messages').doc()
  transaction.set(ref, { message, createdAt: admin.firestore.FieldValue.serverTimestamp() })
}

const getCallUsers = async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 15 * 1000)
  const [presenceSnapshot, users] = await Promise.all([
    webCallPresenceRef.where('seenAt', '>=', cutoff).get(),
    readCloudUsers(),
  ])
  const usersById = new Map((Array.isArray(users) ? users : []).map((user) => [String(user.id), user]))
  return presenceSnapshot.docs
    .map((presence) => usersById.get(presence.id))
    .filter(Boolean)
    .map(({ id, name, role }) => ({ id: String(id), name, role }))
}

const updatePresence = async (actor, clientId) => {
  const ref = webCallPresenceRef.doc(String(actor.id))
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const previous = snapshot.data()
    const isRecent = previous?.seenAt?.toMillis?.() > Date.now() - 15 * 1000
    if (isRecent && previous.clientId !== clientId) throw new Error('Dieses Benutzerkonto ist bereits im Telefon angemeldet.')
    transaction.set(ref, {
      clientId,
      seenAt: admin.firestore.Timestamp.now(),
      activeCallId: isRecent ? previous.activeCallId || '' : '',
    })
  })
}

const clearPresence = (transaction, userId) => {
  transaction.set(webCallPresenceRef.doc(String(userId)), {
    activeCallId: '',
    seenAt: admin.firestore.Timestamp.now(),
  }, { merge: true })
}

exports.cloudCallRelay = onRequest({
  region,
  invoker: 'public',
  cors: false,
  maxInstances: 10,
  timeoutSeconds: 30,
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  const origin = String(request.get('origin') || '')
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'Telefonzugriff nicht zulässig.' })

  try {
    if (request.body?.action === 'login') return await createCallSession(request, response)

    const actor = await getActor(request)
    const action = String(request.body?.action || '')
    const clientId = String(request.body?.clientId || '')
    if (!webCallClientIdPattern.test(clientId)) return response.status(400).json({ error: 'Telefonverbindung ungültig.' })
    const actorId = String(actor.id)
    const presenceRef = webCallPresenceRef.doc(actorId)
    const presenceSnapshot = await presenceRef.get()
    if (!presenceSnapshot.exists || presenceSnapshot.data().clientId !== clientId) {
      if (action !== 'connect') return response.status(409).json({ error: 'Telefonverbindung wurde ersetzt. Bitte erneut verbinden.' })
    }

    if (action === 'connect') {
      await updatePresence(actor, clientId)
      return response.json({ users: await getCallUsers() })
    }

    if (action === 'poll') {
      await db.runTransaction(async (transaction) => {
        const currentPresence = await transaction.get(presenceRef)
        if (!currentPresence.exists || currentPresence.data().clientId !== clientId) {
          throw new Error('Telefonverbindung wurde ersetzt. Bitte erneut verbinden.')
        }
        transaction.set(presenceRef, { seenAt: admin.firestore.Timestamp.now() }, { merge: true })
      })
      const inboxRef = webCallInboxRef.doc(actorId).collection('messages')
      const messages = await inboxRef.orderBy('createdAt').limit(100).get()
      if (!messages.empty) {
        const batch = db.batch()
        messages.docs.forEach((message) => batch.delete(message.ref))
        await batch.commit()
      }
      return response.json({
        users: await getCallUsers(),
        messages: messages.docs.map((message) => message.data().message).filter(Boolean),
      })
    }

    if (action === 'disconnect') {
      const activeCallId = String(presenceSnapshot.data()?.activeCallId || '')
      await db.runTransaction(async (transaction) => {
        const currentPresence = await transaction.get(presenceRef)
        if (!currentPresence.exists || currentPresence.data().clientId !== clientId) return
        const callRef = activeCallId ? db.collection('webAppCalls').doc(activeCallId) : null
        const callSnapshot = callRef ? await transaction.get(callRef) : null
        const call = callSnapshot?.data()
        const otherId = call && (call.callerId === actorId ? call.targetId : call.callerId)
        if (otherId) await transaction.get(webCallPresenceRef.doc(String(otherId)))
        transaction.delete(presenceRef)
        if (!callRef || !callSnapshot?.exists || !['ringing', 'active'].includes(call.status)) return
        transaction.update(callRef, { status: 'ended', endedAt: admin.firestore.FieldValue.serverTimestamp() })
        enqueueEvent(transaction, otherId, { type: 'call:ended', callId: activeCallId, reason: 'Verbindung getrennt.' })
        clearPresence(transaction, otherId)
      })
      return response.json({ disconnected: true })
    }

    if (action !== 'send') return response.status(400).json({ error: 'Telefonaktion ungültig.' })
    const message = request.body?.message
    const encodedMessage = JSON.stringify(message)
    if (!message || typeof message !== 'object' || Buffer.byteLength(encodedMessage) > webCallMessageLimit) {
      return response.status(400).json({ error: 'Telefonnachricht ungültig oder zu groß.' })
    }
    const callId = String(message.callId || '')
    if (!webCallIdPattern.test(callId)) return response.status(400).json({ error: 'Anrufkennung ungültig.' })
    const callRef = db.collection('webAppCalls').doc(callId)
    const targetId = String(message.targetUserId || '')

    if (message.type === 'call:invite') {
      if (!targetId || targetId === actorId) return response.status(400).json({ error: 'Anrufziel ungültig.' })
      const users = await readCloudUsers()
      if (!users.some((user) => String(user.id) === targetId)) return response.status(404).json({ error: 'Benutzerkonto nicht gefunden.' })
      const targetPresenceRef = webCallPresenceRef.doc(targetId)
      const result = await db.runTransaction(async (transaction) => {
        const [callerPresence, targetPresence, existingCall] = await Promise.all([
          transaction.get(presenceRef),
          transaction.get(targetPresenceRef),
          transaction.get(callRef),
        ])
        if (existingCall.exists) return { error: 'Anrufkennung wird bereits verwendet.' }
        const now = Date.now()
        if (!callerPresence.exists || callerPresence.data().clientId !== clientId
          || callerPresence.data().activeCallId
          || !targetPresence.exists || !targetPresence.data().seenAt
          || targetPresence.data().seenAt.toMillis() < now - 15 * 1000
          || targetPresence.data().activeCallId) {
          return { error: 'Benutzer ist nicht verfügbar oder bereits in einem Gespräch.' }
        }
        transaction.create(callRef, {
          callerId: actorId,
          targetId,
          status: 'ringing',
          videoEnabled: Boolean(message.videoEnabled),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: admin.firestore.Timestamp.fromMillis(now + 2 * 60 * 60 * 1000),
        })
        transaction.set(presenceRef, { activeCallId: callId }, { merge: true })
        transaction.set(targetPresenceRef, { activeCallId: callId }, { merge: true })
        enqueueEvent(transaction, targetId, {
          type: 'call:incoming',
          callId,
          caller: { id: actorId, name: actor.name },
          videoEnabled: Boolean(message.videoEnabled),
        })
        enqueueEvent(transaction, actorId, { type: 'call:ringing', callId, targetId })
        return { sent: true }
      })
      if (result.error) return response.json({ message: { type: 'call:unavailable', callId, message: result.error } })
      return response.json({ sent: true })
    }

    const result = await db.runTransaction(async (transaction) => {
      const callSnapshot = await transaction.get(callRef)
      if (!callSnapshot.exists) return { error: 'Anruf nicht gefunden.' }
      const call = callSnapshot.data()
      if (call.callerId !== actorId && call.targetId !== actorId) return { error: 'Kein Zugriff auf diesen Anruf.' }
      if (!['ringing', 'active'].includes(call.status)) return { error: 'Anruf wurde bereits beendet.' }
      const otherId = call.callerId === actorId ? call.targetId : call.callerId
      await Promise.all([
        transaction.get(presenceRef),
        transaction.get(webCallPresenceRef.doc(String(otherId))),
      ])

      if (message.type === 'call:accept' && call.targetId === actorId && call.status === 'ringing') {
        transaction.update(callRef, { status: 'active', acceptedAt: admin.firestore.FieldValue.serverTimestamp() })
        enqueueEvent(transaction, call.callerId, { type: 'call:accepted', callId, targetId: actorId })
        enqueueEvent(transaction, actorId, { type: 'call:accepted', callId, targetId: actorId })
      } else if (message.type === 'call:reject' && call.targetId === actorId) {
        transaction.update(callRef, { status: 'rejected', endedAt: admin.firestore.FieldValue.serverTimestamp() })
        enqueueEvent(transaction, call.callerId, { type: 'call:rejected', callId, reason: 'Anruf abgelehnt.' })
        clearPresence(transaction, call.callerId)
        clearPresence(transaction, actorId)
      } else if (message.type === 'call:signal' && message.data && ['ringing', 'active'].includes(call.status)) {
        enqueueEvent(transaction, otherId, { type: 'call:signal', callId, data: message.data })
      } else if (message.type === 'call:end') {
        transaction.update(callRef, { status: 'ended', endedAt: admin.firestore.FieldValue.serverTimestamp() })
        enqueueEvent(transaction, otherId, { type: 'call:ended', callId, reason: 'Anruf beendet.' })
        clearPresence(transaction, actorId)
        clearPresence(transaction, otherId)
      } else {
        return { error: 'Telefonaktion für diesen Anruf nicht zulässig.' }
      }
      return { sent: true }
    })
    if (result.error) return response.status(409).json({ error: result.error })
    return response.json({ sent: true })
  } catch (error) {
    const status = error.message.includes('Anmeldung') || error.message.includes('Benutzerkonto') ? 401
      : error.message.includes('bereits im Telefon') || error.message.includes('Telefonverbindung wurde ersetzt') ? 409
        : error.message.startsWith('Zu viele Anmeldeversuche') ? 429
          : 400
    console.error('Cloud-Telefon fehlgeschlagen:', error.message)
    return response.status(status).json({ error: error.message || 'Telefonanfrage fehlgeschlagen.' })
  }
})
