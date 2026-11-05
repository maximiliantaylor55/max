const test = require('node:test')
const assert = require('node:assert/strict')
const { validateFinanceEntries } = require('./finance-validation.cjs')

const expense = {
  id: 'entry-1',
  type: 'expense',
  category: 'Wareneinkauf',
  date: '2026-10-25',
  paidAt: '',
  description: 'Einkauf Test',
  counterparty: 'Lieferant GmbH',
  documentNumber: 'RE-123',
  grossCents: 11900,
  vatRate: 19,
  receiptAvailable: true,
}

test('accepts a valid finance entry for an admin', () => {
  assert.doesNotThrow(() => validateFinanceEntries([], [expense], { role: 'admin' }))
})

test('requires an admin or explicit finance permission to write finance entries', () => {
  assert.throws(() => validateFinanceEntries([], [expense], { role: 'mitarbeiter', permissions: ['kunden'] }), /Finanzen-Berechtigung/)
  assert.doesNotThrow(() => validateFinanceEntries([], [expense], { role: 'mitarbeiter', permissions: ['finanzen'] }))
})

test('rejects invalid dates, VAT rates, and duplicate ids', () => {
  assert.throws(() => validateFinanceEntries([], [{ ...expense, date: '2026-02-30' }], { role: 'admin' }), /ungültig/)
  assert.throws(() => validateFinanceEntries([], [{ ...expense, vatRate: 8 }], { role: 'admin' }), /ungültig/)
  assert.throws(() => validateFinanceEntries([], [expense, expense], { role: 'admin' }), /ungültig/)
})

test('accepts optional SKR03 account numbers and rejects malformed accounts', () => {
  assert.doesNotThrow(() => validateFinanceEntries([], [{ ...expense, accountNumber: '3400' }], { role: 'admin' }))
  assert.doesNotThrow(() => validateFinanceEntries([], [expense], { role: 'admin' }))
  assert.throws(() => validateFinanceEntries([], [{ ...expense, accountNumber: '34A0' }], { role: 'admin' }), /ungültig/)
})

test('prevents duplicate finance entries linked to the same sales invoice', () => {
  const linked = { ...expense, id: 'income-1', type: 'income', category: 'Warenverkauf', sourceDocumentId: 'invoice-1' }
  assert.doesNotThrow(() => validateFinanceEntries([], [linked], { role: 'admin' }))
  assert.throws(() => validateFinanceEntries([], [
    linked,
    { ...linked, id: 'income-2' },
  ], { role: 'admin' }), /Rechnungsverknüpfung/)
  assert.throws(() => validateFinanceEntries([], [{
    ...linked,
    type: 'expense',
    category: 'Wareneinkauf',
  }], { role: 'admin' }), /Rechnungsverknüpfung/)
})

test('prevents duplicate finance entries linked to the same purchase order', () => {
  const linked = {
    ...expense,
    sourcePurchaseOrderId: 'purchase-1',
    receiptAttachments: [{
      id: '3a4082ee-6c75-40d4-999e-b06a03b66e2b',
      fileName: 'rechnung.pdf',
      contentType: 'application/pdf',
      size: 1024,
      uploadedAt: '2026-10-25T12:00:00.000Z',
    }],
  }
  assert.doesNotThrow(() => validateFinanceEntries([], [linked], { role: 'admin' }))
  assert.throws(() => validateFinanceEntries([], [linked, { ...linked, id: 'entry-2' }], { role: 'admin' }), /Einkaufsverknüpfung/)
  assert.throws(() => validateFinanceEntries([], [{ ...linked, type: 'income', category: 'Warenverkauf' }], { role: 'admin' }), /Einkaufsverknüpfung/)
  assert.throws(() => validateFinanceEntries([], [{ ...expense, sourcePurchaseOrderId: 'purchase-1' }], { role: 'admin' }), /hochgeladener Beleg/)
})

test('validates attached receipt metadata on finance entries', () => {
  const receiptAttachments = [{
    id: '3a4082ee-6c75-40d4-999e-b06a03b66e2b',
    fileName: 'rechnung.pdf',
    contentType: 'application/pdf',
    size: 1024,
    uploadedAt: '2026-10-25T12:00:00.000Z',
  }]
  assert.doesNotThrow(() => validateFinanceEntries([], [{ ...expense, receiptAttachments }], { role: 'admin' }))
  assert.throws(() => validateFinanceEntries([], [{ ...expense, receiptAttachments: [{ ...receiptAttachments[0], contentType: 'text/html' }] }], { role: 'admin' }), /Belegangabe ungültig/)
})

test('requires admin permission to delete saved finance entries', () => {
  assert.throws(() => validateFinanceEntries([expense], [], { role: 'mitarbeiter', permissions: ['finanzen'] }), /nur von einem Admin/)
  assert.doesNotThrow(() => validateFinanceEntries([expense], [], { role: 'admin' }))
})
