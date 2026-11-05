import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateFinanceReport, calculateVatSubmissionPreview } from './finance-accounting.js'

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
