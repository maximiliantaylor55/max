const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildEntryVoucher,
  buildInvoiceVoucher,
  callSevdeskApi,
  detectChart,
  entryVoucherNumber,
  findSevdeskVoucherByNumber,
  getEntryIneligibleReason,
  getInvoiceIneligibleReason,
  mergeAccounts,
  resolveAccount,
  uploadSevdeskTempFile,
} = require('./sevdesk.cjs')

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

const entry = (changes = {}) => ({
  id: 'fin-abc123',
  type: 'expense',
  category: 'Marketing',
  date: '2026-11-05',
  paidAt: '2026-11-05',
  description: 'Instagram-Werbung',
  counterparty: 'Meta Platforms',
  documentNumber: 'FB-998877',
  grossCents: 11900,
  vatRate: 19,
  receiptAvailable: true,
  ...changes,
})

const guides = {
  objects: [
    { accountDatevId: 501, accountNumber: '8400', allowedTaxRules: [{ id: '1', taxRates: ['19'] }] },
    { accountDatevId: 502, accountNumber: '8300', allowedTaxRules: [{ id: 1, taxRates: [7] }] },
    { accountDatevId: 503, accountNumber: '8200', allowedTaxRules: [{ id: 1, taxRates: [0] }] },
    { accountDatevId: 601, accountNumber: '4600', allowedTaxRules: [{ id: 8, taxRates: [0, 7, 19] }] },
    { accountDatevId: 602, accountNumber: '4360', allowedTaxRules: [{ id: 9, taxRates: [0] }] },
    { accountDatevId: 603, accountNumber: '3400', allowedTaxRules: [{ id: 8, taxRates: [19] }] },
  ],
}
const accounts = mergeAccounts('SKR03')

test('erkennt den Kontenrahmen und prüft Konto + Steuersatz', () => {
  assert.equal(detectChart(guides), 'SKR03')
  assert.equal(detectChart({ objects: [{ accountNumber: '4400', accountDatevId: 1, allowedTaxRules: [{ id: 1, taxRates: [19] }] }] }), 'SKR04')
  assert.equal(resolveAccount(guides, '8400', 1, [19]), 501)
  assert.equal(resolveAccount(guides, '8400', 1, [0]), null)
  assert.throws(() => mergeAccounts(''), /Kontenrahmen/)
})

test('versteht Steuersätze im sevDesk-Format (ZERO/SEVEN/NINETEEN, „19.0“)', () => {
  const real = { objects: [
    { accountDatevId: 701, accountNumber: '8400', allowedTaxRules: [{ id: 1, name: 'USTPFL_UMS_EINN', taxRates: ['ZERO', 'SEVEN', 'NINETEEN'] }] },
    { accountDatevId: 702, accountNumber: '8300', allowedTaxRules: [{ id: '1', taxRates: ['7.0'] }] },
  ] }
  assert.equal(detectChart(real), 'SKR03')
  assert.equal(resolveAccount(real, '8400', 1, [19]), 701)
  assert.equal(resolveAccount(real, '8300', 1, [7]), 702)
  assert.equal(resolveAccount(real, '8400', 8, [19]), null)
})

test('Rechnung → Einnahme-Beleg mit Bruttobetrag, Pfand und PDF', () => {
  const payload = buildInvoiceVoucher({ invoice: invoice(), totals: { netTotal: 100, taxTotal: 19, depositTotal: 6, vatRate: 19 }, guides, accounts, filename: 'abc.pdf' })
  assert.equal(payload.voucher.creditDebit, 'D')
  assert.equal(payload.voucher.status, 100)
  assert.equal(payload.voucher.description, 'RE-2026-0042')
  assert.equal(payload.voucher.voucherDate, '10.11.2026')
  assert.equal(payload.voucher.paymentDeadline, '24.11.2026')
  assert.deepEqual(payload.voucher.taxRule, { id: 1, objectName: 'TaxRule' })
  assert.equal(payload.filename, 'abc.pdf')
  assert.deepEqual(payload.voucherPosSave.map((pos) => [pos.accountDatev.id, pos.taxRate, pos.sumGross]), [[501, 19, 119], [503, 0, 6]])
})

test('Rechnung: 0 % und Entwürfe werden abgelehnt', () => {
  assert.throws(() => buildInvoiceVoucher({ invoice: invoice(), totals: { netTotal: 1, taxTotal: 0, depositTotal: 0, vatRate: 0 }, guides, accounts }), /manuell/)
  assert.match(getInvoiceIneligibleReason(invoice({ status: 'Entwurf' })), /Entwürfe/)
  assert.match(getInvoiceIneligibleReason(invoice({ status: 'Storniert' })), /Storniert/i)
})

test('Ausgabe → Beleg „C“ mit Kategorie-Konto und Vorsteuer-Regel', () => {
  const payload = buildEntryVoucher({ entry: entry(), guides, accounts, filename: 'r.pdf' })
  assert.equal(payload.voucher.creditDebit, 'C')
  assert.equal(payload.voucher.description, 'FB-998877')
  assert.equal(payload.voucher.supplierName, 'Meta Platforms')
  assert.equal(payload.voucher.taxRule.id, 8)
  assert.deepEqual(payload.voucherPosSave.map((pos) => [pos.accountDatev.id, pos.taxRate, pos.sumGross]), [[601, 19, 119]])
})

test('Ausgabe ohne Vorsteuer (Versicherung 0 %) nutzt Steuerregel 9', () => {
  const payload = buildEntryVoucher({ entry: entry({ category: 'Versicherungen', vatRate: 0, grossCents: 5000 }), guides, accounts })
  assert.equal(payload.voucher.taxRule.id, 9)
  assert.equal(payload.voucherPosSave[0].accountDatev.id, 602)
})

test('eigene Kontonummer der Buchung hat Vorrang; unpassendes Konto gibt klare Meldung', () => {
  const payload = buildEntryVoucher({ entry: entry({ accountNumber: '3400' }), guides, accounts })
  assert.equal(payload.voucherPosSave[0].accountDatev.id, 603)
  assert.throws(() => buildEntryVoucher({ entry: entry({ accountNumber: '9999' }), guides, accounts }), /9999/)
  // Bei SKR04 wird das (SKR03-)Sachkonto der Buchung ignoriert und das Kategorie-Konto genutzt.
  const skr04Guides = { objects: [{ accountDatevId: 701, accountNumber: '6600', allowedTaxRules: [{ id: 8, taxRates: [19] }] }] }
  const skr04 = buildEntryVoucher({ entry: entry({ accountNumber: '4600' }), guides: skr04Guides, accounts: mergeAccounts('SKR04') })
  assert.equal(skr04.voucherPosSave[0].accountDatev.id, 701)
})

test('Einnahme aus Rechnung wird übersprungen, sonst als „D“ gebucht', () => {
  assert.match(getEntryIneligibleReason(entry({ type: 'income', category: 'Warenverkauf', sourceDocumentId: 'inv-1' })), /Rechnung/)
  const payload = buildEntryVoucher({ entry: entry({ type: 'income', category: 'Sonstige Einnahmen', documentNumber: '' }), guides, accounts })
  assert.equal(payload.voucher.creditDebit, 'D')
  assert.equal(payload.voucher.description, 'ZYRO-E-finabc123')
  assert.equal(entryVoucherNumber(entry({ documentNumber: '' })), 'ZYRO-A-finabc123')
})

test('sendet den Token ohne Bearer, wiederholt bei 429 und meldet Fehler lesbar', async () => {
  let calls = 0
  let auth = ''
  const fetchImpl = async (url, options) => {
    calls += 1
    auth = options.headers.Authorization
    if (calls === 1) return { ok: false, status: 429, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ objects: [] }) }
  }
  await callSevdeskApi('tok123', '/ReceiptGuidance/forAllAccounts', { fetchImpl })
  assert.equal(calls, 2)
  assert.equal(auth, 'tok123')
  const failing = async () => ({ ok: false, status: 422, json: async () => ({ error: { message: 'accountDatev not allowed' } }) })
  await assert.rejects(callSevdeskApi('t', '/Voucher/Factory/saveVoucher', { method: 'POST', body: {}, fetchImpl: failing }), /422.*accountDatev not allowed/)
})

test('findet vorhandenen Beleg exakt über Belegnummer und Richtung', async () => {
  let requested = ''
  const fetchImpl = async (url) => {
    requested = url
    return { ok: true, status: 200, json: async () => ({ objects: [{ id: '7', description: 'RE-2026-00421' }, { id: '8', description: 'RE-2026-0042' }] }) }
  }
  assert.equal((await findSevdeskVoucherByNumber('t', 'RE-2026-0042', 'D', { fetchImpl })).id, '8')
  assert.match(requested, /Voucher\?creditDebit=D&descriptionLike=RE-2026-0042/)
})

test('lädt PDF/Bild hoch und liefert den temporären Dateinamen', async () => {
  const fetchImpl = async () => ({ ok: true, status: 201, json: async () => ({ objects: { filename: 'f019.pdf' } }) })
  assert.equal(await uploadSevdeskTempFile('t', Buffer.from('%PDF-1.4 test'), 'RE.pdf', 'application/pdf', { fetchImpl }), 'f019.pdf')
  assert.equal(await uploadSevdeskTempFile('t', Buffer.from('\xff\xd8\xff jpg'), 'b.jpg', 'image/jpeg', { fetchImpl }), 'f019.pdf')
  await assert.rejects(uploadSevdeskTempFile('t', Buffer.from('nope!'), 'RE.pdf', 'application/pdf', { fetchImpl }), /ungültig/)
})
