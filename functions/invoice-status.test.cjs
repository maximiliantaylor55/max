const assert = require('node:assert/strict')
const test = require('node:test')
const { isAllowedInvoiceStatusChange, haveSameInvoiceFields } = require('./invoice-status.cjs')

test('allows issuing an invoice without marking it as sent', () => {
  assert.equal(isAllowedInvoiceStatusChange('Entwurf', 'Ausgestellt'), true)
  for (const status of ['Versendet', 'Bezahlt', 'Überfällig', 'Storniert']) {
    assert.equal(isAllowedInvoiceStatusChange('Ausgestellt', status), true)
  }
  assert.equal(isAllowedInvoiceStatusChange('Ausgestellt', 'Entwurf'), false)
  assert.equal(isAllowedInvoiceStatusChange('Bezahlt', 'Ausgestellt'), false)
})

test('issued invoice fields stay immutable when status changes', () => {
  const original = { id: '1', status: 'Ausgestellt', recipientEmail: '', total: 100 }
  assert.equal(haveSameInvoiceFields(original, { ...original, status: 'Bezahlt', paidAt: '2026-11-07' }), true)
  assert.equal(haveSameInvoiceFields({ ...original, paidAt: '' }, { ...original, status: 'Bezahlt', paidAt: '2026-11-07' }), true)
  assert.equal(haveSameInvoiceFields(original, { ...original, status: 'Bezahlt', total: 1, paidAt: '2026-11-07' }), false)
  assert.equal(haveSameInvoiceFields(original, { ...original, status: 'Versendet', paidAt: '2026-11-07' }), false)
  assert.equal(haveSameInvoiceFields(original, { ...original, status: 'Bezahlt', paidAt: 'invalid' }), false)
  assert.equal(haveSameInvoiceFields({ ...original, status: 'Bezahlt' }, { ...original, status: 'Bezahlt', paidAt: '2026-11-07' }), false)
  assert.equal(haveSameInvoiceFields({ ...original, paidAt: '2026-11-01' }, { ...original, status: 'Bezahlt', paidAt: '2026-11-07' }), false)
})
