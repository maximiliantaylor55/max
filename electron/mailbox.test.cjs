const assert = require('node:assert/strict')
const test = require('node:test')
const {
  classifyFolder,
  findSentFolder,
  findSpamFolder,
  findTrashFolder,
  resolveFolder,
  normalizeAttachments,
} = require('../functions/mailbox.cjs')

test('finds the server-designated sent folder', async () => {
  const client = {
    list: async () => [
      { path: 'INBOX' },
      { path: 'INBOX.Sent', specialUse: '\\Sent' },
      { path: 'INBOX.Gesendet' },
    ],
  }
  assert.equal(await findSentFolder(client), 'INBOX.Sent')
  assert.equal(await resolveFolder(client, 'sent'), 'INBOX.Sent')
})

test('finds common sent folder names when the server omits special-use flags', async () => {
  const client = { list: async () => [{ path: 'INBOX' }, { path: 'INBOX.Gesendete Objekte' }] }
  assert.equal(await findSentFolder(client), 'INBOX.Gesendete Objekte')
  assert.equal(await resolveFolder(client, 'sent'), 'INBOX.Gesendete Objekte')
})

test('does not treat the inbox as the sent folder', async () => {
  const client = { list: async () => [{ path: 'INBOX' }] }
  assert.equal(await findSentFolder(client), '')
  await assert.rejects(resolveFolder(client, 'sent'), /Gesendet-Ordner/)
  assert.equal(await resolveFolder(client, 'inbox'), 'INBOX')
})

test('finds spam and trash mailboxes by special-use flags or common folder names', async () => {
  const flagged = {
    list: async () => [
      { path: 'INBOX' },
      { path: 'INBOX.Spam', specialUse: '\\Junk' },
      { path: 'INBOX.Trash', specialUse: '\\Trash' },
    ],
  }
  assert.equal(await findSpamFolder(flagged), 'INBOX.Spam')
  assert.equal(await findTrashFolder(flagged), 'INBOX.Trash')
  assert.equal(await resolveFolder(flagged, 'spam'), 'INBOX.Spam')
  assert.equal(await resolveFolder(flagged, 'trash'), 'INBOX.Trash')

  const named = { list: async () => [{ path: 'INBOX' }, { path: 'INBOX.Junk' }, { path: 'INBOX.Papierkorb' }] }
  assert.equal(await findSpamFolder(named), 'INBOX.Junk')
  assert.equal(await findTrashFolder(named), 'INBOX.Papierkorb')
  assert.equal(classifyFolder({ path: 'INBOX.Archiv' }), 'folder')
})

test('allows listed IMAP folders and rejects unlisted paths', async () => {
  const client = {
    list: async () => [
      { path: 'INBOX' },
      { path: 'INBOX.Sent', specialUse: '\\Sent' },
      { path: 'INBOX.Archiv' },
    ],
  }
  assert.equal(await resolveFolder(client, 'INBOX.Archiv'), 'INBOX.Archiv')
  await assert.rejects(resolveFolder(client, 'INBOX/../../secrets'), /Ordner wurde auf dem Mailserver nicht gefunden/)
})

test('validates and normalizes email attachments', () => {
  const [attachment] = normalizeAttachments([{
    filename: '..\\report.pdf',
    contentType: 'application/pdf',
    contentBase64: Buffer.from('report').toString('base64'),
  }])
  assert.equal(attachment.filename, 'report.pdf')
  assert.equal(attachment.contentType, 'application/pdf')
  assert.deepEqual(attachment.content, Buffer.from('report'))
})

test('rejects malformed or oversized email attachments', () => {
  assert.throws(() => normalizeAttachments([{ filename: 'file.txt', contentBase64: 'invalid!' }]), /Anhang/)
  assert.throws(() => normalizeAttachments(Array.from({ length: 11 }, () => ({
    filename: 'file.txt',
    contentBase64: Buffer.from('file').toString('base64'),
  }))), /Maximal 10/)
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')
  assert.throws(() => normalizeAttachments([{ filename: 'large.bin', contentBase64: oversized }]), /zwischen 1 Byte und 5 MB/)
  const fourMegabytes = Buffer.alloc(4 * 1024 * 1024).toString('base64')
  assert.throws(() => normalizeAttachments([
    { filename: 'first.bin', contentBase64: fourMegabytes },
    { filename: 'second.bin', contentBase64: fourMegabytes },
  ]), /höchstens 7 MB/)
})
