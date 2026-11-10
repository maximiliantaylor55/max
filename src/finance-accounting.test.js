import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateFinanceReport,
  calculateIssuedInvoiceOverview,
  calculateVatSubmissionPreview,
} from './finance-accounting.js'

const entries = [
  { type: 'income', category: 'Warenverkauf', date: '2026-10-02', paidAt: '2026-10-03', grossCents: 11900, vatRate: 19 },
  { type: 'expense', category: 'Wareneinkauf', date: '2026-10-04', paidAt: '2026-10-05', grossCents: 5950, vatRate: 19, receiptAvailable: true },
  { type: 'expense', category: 'Marketing', date: '2026-10-06', paidAt: '', grossCents: 1190, vatRate: 19, receiptAvailable: true },
  { type: 'income', category: 'Warenverkauf', date: '2026-09-28', paidAt: '2026-09-30', grossCents: 5000, vatRate: 7 },
]

test('calculates an Ist-based monthly BWA and VAT summary', () => {
  const report = calculateFinanceReport(entries, '2026-10')
  assert.equal(report.incomeNetCents, 10000)
  assert.equal(report.expenseNetCents, 5000)
  assert.equal(report.operatingResultCents, 5000)
  assert.equal(report.outputVatCents, 1900)
  assert.equal(report.inputVatCents, 1140)
  assert.equal(report.vatDueCents, 760)
  assert.equal(report.paidEntries.length, 2)
})

test('does not claim purchase input VAT without an invoice receipt', () => {
  const report = calculateFinanceReport([
    { ...entries[1], receiptAvailable: false },
  ], '2026-10')
  assert.equal(report.inputVatCents, 0)
})

test('lists issued invoices for the selected month without counting drafts or cancelled invoices', () => {
  const overview = calculateIssuedInvoiceOverview([
    {
      id: 'invoice-1',
      kind: 'rechnung',
      status: 'Versendet',
      documentDate: '2026-10-12',
      number: 'RE-2026-0001',
      recipient: 'Getränkemarkt GmbH',
      vatRate: 19,
      items: [{ quantity: 2, unitPrice: 10 }],
    },
    {
      id: 'invoice-2',
      kind: 'rechnung',
      status: 'Bezahlt',
      documentDate: '2026-10-20',
      vatRate: 7,
      quantity: 1,
      unitPrice: 50,
    },
    { id: 'draft', kind: 'rechnung', status: 'Entwurf', documentDate: '2026-10-10' },
    { id: 'cancelled', kind: 'rechnung', status: 'Storniert', documentDate: '2026-10-11' },
    { id: 'other-month', kind: 'rechnung', status: 'Versendet', documentDate: '2026-09-30' },
  ], '2026-10')

  assert.equal(overview.invoices.length, 2)
  assert.equal(overview.invoices[0].grossCents, 2380)
  assert.equal(overview.invoices[1].grossCents, 5350)
  assert.equal(overview.netCents, 7000)
  assert.equal(overview.grossCents, 7730)
})

test('keeps issued invoices visible when their stored amount data is invalid', () => {
  const overview = calculateIssuedInvoiceOverview([{
    id: 'invoice-invalid',
    kind: 'rechnung',
    status: 'Ausgestellt',
    documentDate: '2026-10-12',
    vatRate: 19,
    items: [{ quantity: 0, unitPrice: 10 }],
  }], '2026-10')

  assert.equal(overview.invoices.length, 1)
  assert.equal(overview.invoices[0].grossCents, null)
  assert.equal(overview.invalidCount, 1)
  assert.equal(overview.grossCents, 0)
})

test('builds a monthly VAT submission preview with tax bases and VAT totals', () => {
  const preview = calculateVatSubmissionPreview(entries, '2026-10')
  assert.equal(preview.startMonth, '2026-10')
  assert.equal(preview.endMonth, '2026-10')
  assert.deepEqual(preview.vatSales, [
    { vatRate: 0, netCents: 0, vatCents: 0 },
    { vatRate: 7, netCents: 0, vatCents: 0 },
    { vatRate: 19, netCents: 10000, vatCents: 1900 },
  ])
  assert.equal(preview.outputVatCents, 1900)
  assert.equal(preview.inputVatCents, 1140)
  assert.equal(preview.vatDueCents, 760)
})

test('aggregates a quarterly VAT preview from the quarter containing the selected month', () => {
  const preview = calculateVatSubmissionPreview([
    ...entries,
    { type: 'income', category: 'Warenverkauf', date: '2026-11-03', paidAt: '2026-11-03', grossCents: 10700, vatRate: 7 },
  ], '2026-10', 'quarterly')
  assert.equal(preview.startMonth, '2026-10')
  assert.equal(preview.endMonth, '2026-12')
  assert.equal(preview.vatSales.find((item) => item.vatRate === 7).netCents, 10000)
  assert.equal(preview.vatSales.find((item) => item.vatRate === 7).vatCents, 700)
  assert.equal(preview.vatDueCents, 1460)
})

test('rejects an invalid month or ELSTER filing period for VAT preview', () => {
  assert.throws(() => calculateVatSubmissionPreview(entries, '2026-13'), /Auswertungsmonat/)
  assert.throws(() => calculateVatSubmissionPreview(entries, '2026-10', 'yearly'), /UStVA-Zeitraum/)
})
