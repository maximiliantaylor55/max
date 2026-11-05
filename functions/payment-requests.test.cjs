const assert = require('node:assert/strict')
const test = require('node:test')
const {
  normalizeIban,
  isValidIban,
  validatePaymentSettings,
  validatePaymentRequestUpdate,
  buildSepaXml,
} = require('./payment-requests.cjs')

const employee = { id: 'employee-1', name: 'Max Mitarbeiter', role: 'mitarbeiter' }
const admin = { id: 'admin-1', name: 'Admin', role: 'admin' }
const request = {
  id: 'payment-1',
  requesterId: employee.id,
  requesterName: employee.name,
  createdAt: '2026-10-29T10:00:00.000Z',
  clientName: 'Auftraggeber GmbH',
  recipientName: 'Lieferant & Söhne',
  recipientIban: 'DE89370400440532013000',
  recipientBic: '',
  amountCents: 12550,
  purpose: 'Rechnung & Lieferung',
  reference: 'RE-2026-007',
  requestedExecutionDate: '2026-11-02',
  status: 'pending',
}
const settings = { id: 'global', accountName: 'ZYRO & Company', iban: 'DE89370400440532013000', bic: '' }

test('normalizes and validates IBAN checksums', () => {
  assert.equal(normalizeIban('de89 3704 0044 0532 0130 00'), 'DE89370400440532013000')
  assert.equal(isValidIban('DE89 3704 0044 0532 0130 00'), true)
  assert.equal(isValidIban('DE89370400440532013001'), false)
})

test('employees can submit their own requests without changing others', () => {
  const otherRequest = { ...request, id: 'payment-2', requesterId: 'employee-2', requesterName: 'Other Employee' }
  const merged = validatePaymentRequestUpdate([otherRequest], [request], employee)
  assert.deepEqual(merged, [otherRequest, request])
  assert.throws(() => validatePaymentRequestUpdate([], [{ ...request, requesterId: 'employee-2' }], employee), /eigene/)
  assert.throws(() => validatePaymentRequestUpdate([request], [], employee), /nicht gelöscht/)
})

test('admins can approve only another employee request and track status changes', () => {
  const approved = {
    ...request,
    status: 'approved',
    reviewedById: admin.id,
    reviewedByName: admin.name,
    reviewedAt: '2026-10-29T11:00:00.000Z',
  }
  assert.deepEqual(validatePaymentRequestUpdate([request], [approved], admin), [approved])
  assert.throws(() => validatePaymentRequestUpdate([request], [{
    ...approved,
    reviewedById: employee.id,
    reviewedByName: employee.name,
  }], employee), /nur von einem Admin/)
  const adminsOwnRequest = { ...request, id: 'admin-payment', requesterId: admin.id, requesterName: admin.name }
  assert.throws(() => validatePaymentRequestUpdate([adminsOwnRequest], [{
    ...adminsOwnRequest,
    status: 'approved',
    reviewedById: admin.id,
    reviewedByName: admin.name,
    reviewedAt: '2026-10-29T11:00:00.000Z',
  }], admin), /Ein Admin darf eigene/)
  const exported = {
    ...approved,
    status: 'exported',
    exportedById: admin.id,
    exportedByName: admin.name,
    exportedAt: '2026-10-29T12:00:00.000Z',
    exportBatchId: 'batch-1',
  }
  assert.deepEqual(validatePaymentRequestUpdate([approved], [exported], admin), [exported])
  const paid = {
    ...exported,
    status: 'paid',
    paidById: admin.id,
    paidByName: admin.name,
    paidAt: '2026-10-30',
    paymentReference: 'BANK-123',
  }
  assert.deepEqual(validatePaymentRequestUpdate([exported], [paid], admin), [paid])
  assert.throws(() => validatePaymentRequestUpdate([approved], [{
    ...approved,
    status: 'exported',
    exportedById: admin.id,
    exportedByName: admin.name,
    exportedAt: '2026-10-29T12:00:00.000Z',
    exportBatchId: 'batch-1',
    reviewedByName: 'Falscher Name',
  }], admin), /unzulässige Änderungen/)
  assert.throws(() => validatePaymentRequestUpdate([request], [{ ...approved, amountCents: 1 }], admin), /nicht geändert/)
})

test('rejects invalid source payment accounts', () => {
  assert.doesNotThrow(() => validatePaymentSettings([settings]))
  assert.throws(() => validatePaymentSettings([{ ...settings, iban: 'DE89370400440532013001' }]), /gültige IBAN/)
})

test('creates a SEPA pain.001 XML with safe escaped fields and only approved requests', () => {
  const approved = { ...request, status: 'approved' }
  const xml = buildSepaXml({
    settings,
    requests: [approved],
    createdAt: new Date('2026-10-29T10:00:00.000Z'),
  })
  assert.match(xml, /pain\.001\.001\.03/)
  assert.match(xml, /<NbOfTxs>1<\/NbOfTxs>/)
  assert.match(xml, /<InstdAmt Ccy="EUR">125\.50<\/InstdAmt>/)
  assert.match(xml, /Lieferung/)
  assert.match(xml, /&amp;/)
  assert.throws(() => buildSepaXml({ settings, requests: [request] }), /Nur freigegebene/)
})
