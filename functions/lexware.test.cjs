const test = require('node:test')
const assert = require('node:assert/strict')
const {
  LEXWARE_CATEGORY_WARENVERKAEUFE,
  buildLexwareVoucherPayload,
  callLexwareApi,
  findLexwareVoucherByNumber,
  getLexwareIneligibleReason,
} = require('./lexware.cjs')

const invoice = (changes = {}) => ({
  id: 'inv-1',
  kind: 'rechnung',
  number: 'RE-2026-0042',
  status: 'Versendet',
  recipient: 'Kiosk am Markt',
  orderNumber: 'AU-2026-0100',
  documentDate: '2026-11-10',
  dueDate: '2026-11-24',
  ...changes,
})

test('baut einen Ausgangsbeleg mit Netto, USt. und Pfand', () => {
  const payload = buildLexwareVoucherPayload(invoice(), { netTotal: 100, taxTotal: 19, depositTotal: 6, vatRate: 19 })
  assert.equal(payload.type, 'salesinvoice')
  assert.equal(payload.voucherNumber, 'RE-2026-0042')
  assert.equal(payload.voucherDate, '2026-11-10')
  assert.equal(payload.dueDate, '2026-11-24')
  assert.equal(payload.taxType, 'net')
  assert.equal(payload.useCollectiveContact, true)
  assert.equal(payload.totalGrossAmount, 125)
  assert.equal(payload.totalTaxAmount, 19)
  assert.deepEqual(payload.voucherItems, [
    { amount: 100, taxAmount: 19, taxRatePercent: 19, categoryId: LEXWARE_CATEGORY_WARENVERKAEUFE },
    { amount: 6, taxAmount: 0, taxRatePercent: 0, categoryId: LEXWARE_CATEGORY_WARENVERKAEUFE },
  ])
  assert.match(payload.remark, /ZYRO RE-2026-0042 · Kiosk am Markt · Auftrag AU-2026-0100/)
})

test('rundet Beträge auf Cent und lässt Pfand weg, wenn keins anfällt', () => {
  const payload = buildLexwareVoucherPayload(invoice(), { netTotal: 33.333, taxTotal: 6.3333, depositTotal: 0, vatRate: 19 })
  assert.equal(payload.voucherItems.length, 1)
  assert.equal(payload.voucherItems[0].amount, 33.33)
  assert.equal(payload.voucherItems[0].taxAmount, 6.33)
  assert.equal(payload.totalGrossAmount, 39.66)
})

test('lehnt Entwürfe, Stornos und 0-%-Rechnungen ab', () => {
  assert.match(getLexwareIneligibleReason(invoice({ status: 'Entwurf' })), /Entwürfe/)
  assert.match(getLexwareIneligibleReason(invoice({ status: 'Storniert' })), /Storniert/i)
  assert.match(getLexwareIneligibleReason(invoice({ kind: 'angebot' })), /Nur Rechnungen/)
  assert.equal(getLexwareIneligibleReason(invoice({ status: 'Bezahlt' })), '')
  assert.throws(() => buildLexwareVoucherPayload(invoice(), { netTotal: 100, taxTotal: 0, depositTotal: 0, vatRate: 0 }), /manuell/)
})

test('Fälligkeit vor dem Rechnungsdatum fällt auf das Rechnungsdatum zurück', () => {
  const payload = buildLexwareVoucherPayload(invoice({ dueDate: '2026-11-01' }), { netTotal: 10, taxTotal: 0.7, depositTotal: 0, vatRate: 7 })
  assert.equal(payload.dueDate, '2026-11-10')
})

test('wiederholt bei 429 und meldet sonst lesbare Fehler', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) return { ok: false, status: 429, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ id: 'x' }) }
  }
  assert.deepEqual(await callLexwareApi('key', '/v1/profile', { fetchImpl }), { id: 'x' })
  assert.equal(calls, 2)

  const failing = async () => ({ ok: false, status: 406, json: async () => ({ message: 'Validation failed', details: [{ field: 'voucherItems', message: 'ungültig' }] }) })
  await assert.rejects(callLexwareApi('key', '/v1/vouchers', { method: 'POST', body: {}, fetchImpl: failing }), /voucherItems: ungültig/)
  const unauthorized = async () => ({ ok: false, status: 401, json: async () => ({}) })
  await assert.rejects(callLexwareApi('key', '/v1/profile', { fetchImpl: unauthorized }), /API-Schlüssel ungültig/)
})

test('findet vorhandenen Beleg über die Belegnummer', async () => {
  let requested = ''
  const fetchImpl = async (url) => {
    requested = url
    return { ok: true, status: 200, json: async () => ({ content: [{ id: '11111111-2222-3333-4444-555555555555', voucherNumber: 'RE-2026-0042' }] }) }
  }
  const found = await findLexwareVoucherByNumber('key', 'RE-2026-0042', { fetchImpl })
  assert.equal(found.id, '11111111-2222-3333-4444-555555555555')
  assert.match(requested, /voucherlist\?voucherType=salesinvoice&voucherStatus=any&voucherNumber=RE-2026-0042/)
})
