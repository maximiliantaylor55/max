const { ImapFlow } = require('imapflow')
const { simpleParser } = require('mailparser')
const nodemailer = require('nodemailer')
const { normalizeEmailAddress } = require('./email-address.cjs')
const { ensureRecipientsAccepted, sendWithTransientRetry } = require('./email-delivery.cjs')

const defaults = { email: '', password: '', displayName: '', signature: '', imapHost: 'imap.strato.de', imapPort: 993, smtpHost: 'smtp.strato.de', smtpPort: 465 }
const hostPattern = /^[a-z0-9.-]{3,100}$/i
const maxAttachmentBytes = 5 * 1024 * 1024
const maxAttachmentTotalBytes = 7 * 1024 * 1024
const maxAttachmentCount = 10

const normalizeConfig = (value = {}) => {
  let email
  try {
    email = normalizeEmailAddress(String(value.email || ''))
  } catch {
    throw new Error('Bitte eine gültige E-Mail-Adresse eintragen.')
  }
  const config = {
    email,
    password: String(value.password || ''),
    displayName: String(value.displayName || '').trim().slice(0, 80),
    signature: String(value.signature || '').slice(0, 1000),
    imapHost: String(value.imapHost || defaults.imapHost).trim().toLowerCase(),
    imapPort: Number(value.imapPort) || defaults.imapPort,
    smtpHost: String(value.smtpHost || defaults.smtpHost).trim().toLowerCase(),
    smtpPort: Number(value.smtpPort) || defaults.smtpPort,
  }
  if (!config.password) throw new Error('Bitte das Postfach-Passwort eintragen.')
  if (!hostPattern.test(config.imapHost) || !hostPattern.test(config.smtpHost)) throw new Error('Server-Adresse ungültig.')
  if (![config.imapPort, config.smtpPort].every((port) => Number.isInteger(port) && port > 0 && port < 65536)) throw new Error('Port ungültig.')
  return config
}

const withClient = async (config, task) => {
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: { user: config.email, pass: config.password },
    logger: false,
    socketTimeout: 30000,
  })
  client.on('error', () => {})
  await client.connect()
  try {
    return await task(client)
  } finally {
    await client.logout().catch(() => client.close())
  }
}

const friendlyError = (error) => {
  if (error?.authenticationFailed || /auth|login|credentials/i.test(String(error?.response || error?.message))) return new Error('Anmeldung abgelehnt. E-Mail-Adresse und Passwort prüfen.')
  if (['ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET'].includes(error?.code)) return new Error('Mailserver nicht erreichbar. Server, Port und Internetverbindung prüfen.')
  return new Error(`Postfach-Fehler: ${error?.message || 'unbekannt'}`)
}

const run = async (config, task) => {
  try {
    return await withClient(config, task)
  } catch (error) {
    throw friendlyError(error)
  }
}

const findSpecial = async (client, flag) => {
  const list = await client.list()
  return list.find((entry) => entry.specialUse === flag)?.path || ''
}

const folderNameTokens = (entry) => String(entry.path || '')
  .split(/[/.]/)
  .map((part) => part.trim().replace(/[_-]+/g, ' ').toLowerCase())

const classifyFolder = (entry, sentFolder = '') => {
  const specialUse = String(entry.specialUse || '').toLowerCase()
  const tokens = folderNameTokens(entry)
  if (specialUse === '\\inbox' || String(entry.path || '').toUpperCase() === 'INBOX') return 'inbox'
  if (entry.path === sentFolder || specialUse === '\\sent' || tokens.some((name) => (
    ['sent', 'sent items', 'sent messages', 'sent mail', 'gesendet', 'gesendete objekte'].includes(name)
  ))) return 'sent'
  if (['\\junk', '\\spam'].includes(specialUse) || tokens.some((name) => (
    ['spam', 'junk', 'bulk', 'quarantine', 'unerwuenscht', 'unerwünscht'].includes(name)
  ))) return 'spam'
  if (specialUse === '\\trash' || tokens.some((name) => (
    ['trash', 'deleted', 'deleted items', 'papierkorb', 'geloscht', 'gelöscht'].includes(name)
  ))) return 'trash'
  return 'folder'
}

const findSentFolder = async (client) => {
  const list = await client.list()
  const specialFolder = list.find((entry) => entry.specialUse === '\\Sent')
  if (specialFolder) return specialFolder.path
  const sentNames = new Set(['sent', 'sent items', 'sent messages', 'sent mail', 'gesendet', 'gesendete objekte'])
  return list.find((entry) => folderNameTokens(entry).some((part) => sentNames.has(part)))?.path || ''
}

const findSpamFolder = async (client) => {
  const list = await client.list()
  return list.find((entry) => ['\\Junk', '\\Spam'].includes(entry.specialUse))?.path
    || list.find((entry) => classifyFolder(entry) === 'spam')?.path
    || ''
}

const findTrashFolder = async (client) => {
  const list = await client.list()
  return list.find((entry) => entry.specialUse === '\\Trash')?.path
    || list.find((entry) => classifyFolder(entry) === 'trash')?.path
    || ''
}

const listFolders = (config) => run(config, async (client) => {
  const folders = await client.list()
  const sentFolder = await findSentFolder(client)
  return folders
    .filter((entry) => entry.path)
    .map((entry) => ({
      path: String(entry.path),
      name: String(entry.name || entry.path),
      role: classifyFolder(entry, sentFolder),
    }))
    .sort((first, second) => {
      const priority = { inbox: 0, sent: 1, spam: 2, trash: 3, folder: 4 }
      return priority[first.role] - priority[second.role] || first.name.localeCompare(second.name, 'de')
    })
})

const resolveFolder = async (client, folder) => {
  const list = await client.list()
  const sentFolder = await findSentFolder(client)
  const folders = list.map((entry) => ({ ...entry, role: classifyFolder(entry, sentFolder) }))
  const role = ['inbox', 'sent', 'spam', 'trash'].includes(folder) ? folder : ''
  const match = role
    ? folders.find((entry) => entry.role === role)
    : folders.find((entry) => entry.path === folder)
  if (match) return match.path
  if (folder === 'inbox') return 'INBOX'
  if (folder === 'sent') throw new Error('Gesendet-Ordner wurde auf dem Mailserver nicht gefunden.')
  if (folder === 'spam') throw new Error('Spam-/Junk-Ordner wurde auf dem Mailserver nicht gefunden.')
  if (folder === 'trash') throw new Error('Papierkorb wurde auf dem Mailserver nicht gefunden.')
  throw new Error('Der ausgewählte E-Mail-Ordner wurde auf dem Mailserver nicht gefunden.')
}

const formatAddress = (address) => address ? (address.name ? `${address.name} <${address.address}>` : String(address.address || '')) : ''

const serializeMessageAttachments = (attachments = []) => {
  let totalBytes = 0
  return attachments.map((file, index) => {
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content || '')
    const size = Number(file.size) || content.length
    const rawContentType = String(file.contentType || '').split(';')[0].trim().toLowerCase()
    const contentType = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(rawContentType)
      ? rawContentType
      : 'application/octet-stream'
    const filename = String(file.filename || '').split(/[\\/]/).pop()
      .split('').filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('').slice(0, 180)
    const available = index < maxAttachmentCount
      && size > 0
      && size <= maxAttachmentBytes
      && totalBytes + size <= maxAttachmentTotalBytes
      && content.length === size
    if (available) totalBytes += size
    return {
      index,
      name: filename || 'Anhang',
      size,
      contentType,
      available,
      ...(available ? { contentBase64: content.toString('base64') } : {}),
    }
  })
}

const messageBodies = (parsed) => ({
  text: String(parsed.text || '').slice(0, 200000),
  html: typeof parsed.html === 'string' ? parsed.html.slice(0, 200000) : '',
})

const testConnection = (config) => run(config, async (client) => {
  const lock = await client.getMailboxLock('INBOX')
  try { return { ok: true, total: client.mailbox.exists } } finally { lock.release() }
})

const listMessages = (config, { folder = 'inbox', limit = 50 } = {}) => run(config, async (client) => {
  const path = await resolveFolder(client, folder)
  const lock = await client.getMailboxLock(path)
  try {
    const total = client.mailbox.exists
    if (!total) return { total: 0, messages: [] }
    const from = Math.max(1, total - Math.min(Math.max(Number(limit) || 50, 1), 200) + 1)
    const messages = []
    for await (const message of client.fetch(`${from}:*`, { uid: true, envelope: true, flags: true })) {
      const envelope = message.envelope || {}
      messages.push({
        uid: message.uid,
        subject: envelope.subject || '(ohne Betreff)',
        from: formatAddress(envelope.from?.[0]),
        to: (envelope.to || []).map(formatAddress).join(', '),
        date: envelope.date ? new Date(envelope.date).toISOString() : '',
        seen: message.flags?.has('\\Seen') || false,
      })
    }
    messages.sort((a, b) => String(b.date).localeCompare(String(a.date)))
    return { total, messages }
  } finally {
    lock.release()
  }
})

const readMessage = (config, { folder = 'inbox', uid }) => run(config, async (client) => {
  const path = await resolveFolder(client, folder)
  const lock = await client.getMailboxLock(path)
  try {
    const raw = await client.fetchOne(Number(uid), { source: true }, { uid: true })
    if (!raw?.source) throw new Error('Nachricht nicht gefunden.')
    const parsed = await simpleParser(raw.source)
    await client.messageFlagsAdd(Number(uid), ['\\Seen'], { uid: true }).catch(() => {})
    return {
      uid: Number(uid),
      subject: parsed.subject || '(ohne Betreff)',
      from: formatAddress(parsed.from?.value?.[0]),
      replyTo: parsed.replyTo?.value?.[0]?.address || parsed.from?.value?.[0]?.address || '',
      to: parsed.to?.text || '',
      date: parsed.date ? parsed.date.toISOString() : '',
      messageId: parsed.messageId || '',
      references: [].concat(parsed.references || []).join(' '),
      ...messageBodies(parsed),
      attachments: serializeMessageAttachments(parsed.attachments || []),
    }
  } finally {
    lock.release()
  }
})

const deleteMessage = (config, { folder = 'inbox', uid }) => run(config, async (client) => {
  const path = await resolveFolder(client, folder)
  const lock = await client.getMailboxLock(path)
  try {
    const trash = await findSpecial(client, '\\Trash')
    const trashPath = trash || await findTrashFolder(client)
    if (trashPath && trashPath !== path) await client.messageMove(Number(uid), trashPath, { uid: true })
    else await client.messageDelete(Number(uid), { uid: true })
    return { ok: true }
  } finally {
    lock.release()
  }
})

const moveMessage = (config, { folder, toFolder, uid }) => run(config, async (client) => {
  const sourcePath = await resolveFolder(client, folder)
  const targetPath = await resolveFolder(client, toFolder)
  if (sourcePath === targetPath) throw new Error('Die E-Mail befindet sich bereits in diesem Ordner.')
  const lock = await client.getMailboxLock(sourcePath)
  try {
    await client.messageMove(Number(uid), targetPath, { uid: true })
    return { ok: true }
  } finally {
    lock.release()
  }
})

const normalizeAttachments = (attachments = []) => {
  if (!Array.isArray(attachments) || attachments.length > maxAttachmentCount) {
    throw new Error(`Maximal ${maxAttachmentCount} Anhänge pro E-Mail.`)
  }
  let totalBytes = 0
  return attachments.map((attachment) => {
    const filename = String(attachment?.filename || '').trim().split(/[\\/]/).pop()
      .split('').filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('').slice(0, 180)
    const contentBase64 = String(attachment?.contentBase64 || '')
    const contentType = String(attachment?.contentType || 'application/octet-stream')
    if (!filename || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(contentType)) {
      throw new Error('Anhang ist ungültig.')
    }
    if (!contentBase64 || contentBase64.length > Math.ceil(maxAttachmentBytes / 3) * 4 || contentBase64.length % 4 !== 0) {
      throw new Error(`Jeder Anhang darf höchstens ${maxAttachmentBytes / (1024 * 1024)} MB groß sein.`)
    }
    const content = Buffer.from(contentBase64, 'base64')
    if (content.length < 1 || content.length > maxAttachmentBytes || content.toString('base64') !== contentBase64) {
      throw new Error(`Jeder Anhang muss zwischen 1 Byte und ${maxAttachmentBytes / (1024 * 1024)} MB groß sein.`)
    }
    totalBytes += content.length
    if (totalBytes > maxAttachmentTotalBytes) {
      throw new Error(`Anhänge dürfen zusammen höchstens ${maxAttachmentTotalBytes / (1024 * 1024)} MB groß sein.`)
    }
    return { filename, contentType, content }
  })
}

const sendMessage = async (config, { to, subject, text, inReplyTo, references, attachments: attachmentsInput }) => {
  let recipients
  try {
    recipients = String(to || '').split(/[,;]/).map((item) => normalizeEmailAddress(item.trim())).filter(Boolean)
  } catch {
    throw new Error('Bitte gültige Empfängeradresse eintragen.')
  }
  if (!recipients.length) throw new Error('Bitte gültige Empfängeradresse eintragen.')
  if (recipients.length > 10) throw new Error('Maximal 10 Empfänger.')
  const attachments = normalizeAttachments(attachmentsInput)
  const message = {
    from: config.displayName ? { name: config.displayName, address: config.email } : config.email,
    to: recipients,
    subject: String(subject || '').slice(0, 300) || '(ohne Betreff)',
    text: String(text || ''),
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
    ...(attachments.length > 0 ? { attachments } : {}),
  }
  const rendered = await nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  }).sendMail(message)
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.email, pass: config.password },
    connectionTimeout: 20000,
  })
  try {
    const info = await sendWithTransientRetry(() => transporter.sendMail({ ...message, messageId: rendered.messageId }))
    ensureRecipientsAccepted(info, recipients)
    try {
      const saved = await withClient(config, async (client) => {
        const sentFolder = await findSentFolder(client)
        if (!sentFolder) return false
        await client.append(sentFolder, rendered.message, ['\\Seen'])
        return true
      })
      return {
        ok: true,
        messageId: info.messageId,
        sentFolderSaved: saved,
        ...(saved ? {} : { sentFolderError: 'Gesendet-Ordner wurde auf dem Mailserver nicht gefunden.' }),
      }
    } catch (error) {
      return { ok: true, messageId: info.messageId, sentFolderSaved: false, sentFolderError: friendlyError(error).message }
    }
  } catch (error) {
    throw friendlyError(error)
  }
}

module.exports = {
  defaults,
  normalizeConfig,
  testConnection,
  listFolders,
  listMessages,
  readMessage,
  deleteMessage,
  moveMessage,
  sendMessage,
  findSentFolder,
  findSpamFolder,
  findTrashFolder,
  resolveFolder,
  normalizeAttachments,
  serializeMessageAttachments,
  messageBodies,
  classifyFolder,
}
