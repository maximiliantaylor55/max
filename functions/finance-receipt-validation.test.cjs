const test = require('node:test')
const assert = require('node:assert/strict')
const {
  validateFinanceReceiptContent,
  validateFinanceReceiptMetadata,
  validateFinanceReceiptUpload,
} = require('./finance-receipt-validation.cjs')

const receipt = {
  id: '3a4082ee-6c75-40d4-999e-b06a03b66e2b',
  fileName: 'rechnung.pdf',
  contentType: 'application/pdf',
  size: 1024,
  uploadedAt: '2026-10-25T12:00:00.000Z',
}

test('accepts PDF and image receipts up to 10 MB', () => {
  assert.deepEqual(validateFinanceReceiptUpload({
    entryId: 'entry-1',
    fileName: 'rechnung.pdf',
    contentType: 'application/pdf',
    size: 10 * 1024 * 1024,
  }), {
    entryId: 'entry-1',
    fileName: 'rechnung.pdf',
    contentType: 'application/pdf',
    size: 10 * 1024 * 1024,
  })
  assert.doesNotThrow(() => validateFinanceReceiptUpload({
    entryId: 'entry-1',
    fileName: 'bild.jpg',
    contentType: 'image/jpeg',
    size: 1024,
  }))
  assert.doesNotThrow(() => validateFinanceReceiptUpload({
    entryId: 'entry-1',
    fileName: 'bild.png',
    contentType: 'image/png',
    size: 1024,
  }))
})

test('rejects invalid receipt names, formats, entry ids, and sizes', () => {
  assert.throws(() => validateFinanceReceiptUpload({ entryId: '../entry', fileName: 'x.pdf', contentType: 'application/pdf', size: 1 }), /ungültig/)
  assert.throws(() => validateFinanceReceiptUpload({ entryId: 'entry-1', fileName: '../x.pdf', contentType: 'application/pdf', size: 1 }), /ungültig/)
  assert.throws(() => validateFinanceReceiptUpload({ entryId: 'entry-1', fileName: 'x.svg', contentType: 'image/svg+xml', size: 1 }), /PDF-, JPG- und PNG/)
  assert.throws(() => validateFinanceReceiptUpload({ entryId: 'entry-1', fileName: 'x.pdf', contentType: 'application/pdf', size: 10 * 1024 * 1024 + 1 }), /höchstens 10 MB/)
})

test('checks receipt content signatures against the selected file type', () => {
  assert.doesNotThrow(() => validateFinanceReceiptContent('application/pdf', Buffer.from('%PDF-1.7')))
  assert.doesNotThrow(() => validateFinanceReceiptContent('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])))
  assert.doesNotThrow(() => validateFinanceReceiptContent('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
  assert.throws(() => validateFinanceReceiptContent('application/pdf', Buffer.from('<html>')), /Dateiinhalt/)
})

test('validates stored receipt metadata and caps attachments per booking', () => {
  assert.doesNotThrow(() => validateFinanceReceiptMetadata([receipt]))
  assert.throws(() => validateFinanceReceiptMetadata([{ ...receipt, contentType: 'text/plain' }]), /Belegangabe ungültig/)
  assert.throws(() => validateFinanceReceiptMetadata(Array.from({ length: 6 }, (_, index) => ({
    ...receipt,
    id: `3a4082ee-6c75-40d4-999e-b06a03b66e${String(index).padStart(2, '0')}`,
  }))), /höchstens fünf/)
})
