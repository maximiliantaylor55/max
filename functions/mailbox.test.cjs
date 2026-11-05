const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeConfig, serializeMessageAttachments, messageBodies } = require('./mailbox.cjs')

test('preserves HTML and text email bodies within the display limit', () => {
  assert.deepEqual(messageBodies({ text: 'Hello', html: '<p>Hello <a href="https://example.com">there</a></p>' }), {
    text: 'Hello',
    html: '<p>Hello <a href="https://example.com">there</a></p>',
  })
  assert.deepEqual(messageBodies({ html: false }), { text: '', html: '' })
  assert.equal(messageBodies({ html: 'x'.repeat(200001) }).html.length, 200000)
})

test('normalizes internationalized mailbox domains without rejecting umlauts in addresses', () => {
  const config = normalizeConfig({
    email: 'müller@bücher.de',
    password: 'secret',
    smtpHost: 'smtp.example.de',
    imapHost: 'imap.example.de',
  })

  assert.equal(config.email, 'müller@xn--bcher-kva.de')
})

test('exposes attachment data for viewing and marks oversized attachments unavailable', () => {
  const attachments = serializeMessageAttachments([
    { filename: 'label.pdf', size: 3, contentType: 'application/pdf', content: Buffer.from('PDF') },
    { filename: 'large.zip', size: 6 * 1024 * 1024, contentType: 'application/zip', content: Buffer.from('zip') },
  ])

  assert.deepEqual(attachments[0], {
    index: 0,
    name: 'label.pdf',
    size: 3,
    contentType: 'application/pdf',
    available: true,
    contentBase64: Buffer.from('PDF').toString('base64'),
  })
  assert.equal(attachments[1].name, 'large.zip')
  assert.equal(attachments[1].available, false)
  assert.equal('contentBase64' in attachments[1], false)
})
