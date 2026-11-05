const assert = require('node:assert/strict')
const test = require('node:test')
const { validateSalesDocumentEmail } = require('./sales-document-email.cjs')

const pdfBase64 = Buffer.from('%PDF-1.4\nZYRO test\n%%EOF', 'ascii').toString('base64')

test('validates and normalizes a sales document email attachment', () => {
  const result = validateSalesDocumentEmail({
    email: 'kunde@example.de',
    kind: 'rechnung',
    number: 'RE-2026-0001',
    recipientName: 'Kunde\nGmbH',
    pdfBase64,
  })
  assert.equal(result.email, 'kunde@example.de')
  assert.equal(result.label, 'Rechnung')
  assert.equal(result.number, 'RE-2026-0001')
  assert.equal(result.recipientName, 'Kunde GmbH')
  assert.equal(result.pdf.subarray(0, 4).toString(), '%PDF')
})

test('rejects invalid addresses, unsupported document types and non-PDF content', () => {
  assert.throws(() => validateSalesDocumentEmail({ email: 'bad', kind: 'rechnung', number: 'RE-1', pdfBase64 }), /E-Mail-Adresse/)
  assert.throws(() => validateSalesDocumentEmail({ email: 'kunde@example.de', kind: 'intern', number: 'RE-1', pdfBase64 }), /Dokumenttyp/)
  assert.throws(() => validateSalesDocumentEmail({ email: 'kunde@example.de', kind: 'rechnung', number: 'RE-1', pdfBase64: Buffer.from('not a pdf').toString('base64') }), /kein gültiges PDF/)
})
