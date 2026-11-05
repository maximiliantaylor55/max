const assert = require('node:assert/strict')
const test = require('node:test')
const { maxOfferAttachmentBytes, validateOfferAttachment } = require('./offer-attachment.cjs')

test('validiert die unterstützten Angebotsdateien anhand ihres tatsächlichen Inhalts', () => {
  const pdf = validateOfferAttachment('angebot.pdf', 'application/pdf', Buffer.from('%PDF-1.7'))
  assert.equal(pdf.fileName, 'angebot.pdf')
  assert.equal(pdf.mimeType, 'application/pdf')
  assert.throws(() => validateOfferAttachment('falsch.pdf', 'application/pdf', Buffer.from('not a pdf')), /Dateiinhalt/)
  assert.throws(() => validateOfferAttachment('angebot.exe', 'application/octet-stream', Buffer.from('MZ')), /Bitte ein PDF/)
})

test('weist leere und zu große Angebotsdateien zurück', () => {
  assert.throws(() => validateOfferAttachment('angebot.pdf', 'application/pdf', Buffer.alloc(0)), /nicht leer/)
  assert.throws(() => validateOfferAttachment('angebot.pdf', 'application/pdf', Buffer.alloc(maxOfferAttachmentBytes + 1)), /höchstens 10 MB/)
})
