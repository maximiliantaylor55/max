import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDatevPreparationCsv,
  createPurchaseFinanceEntry,
  createSalesInvoiceFinanceEntry,
  getSkr03AccountSuggestion,
} from './erp-accounting.js'

const entries = [
  {
    id: 'sale-1',
    type: 'income',
    date: '2026-10-12',
    paidAt: '2026-10-20',
    documentNumber: 'RE-100',
    counterparty: 'Getränkemarkt GmbH',
    description: 'Warenverkauf',
    grossCents: 11900,
    vatRate: 19,
    accountNumber: '8400',
  },
  {
    id: 'purchase-1',
    type: 'expense',
    date: '2026-10-13',
    paidAt: '2026-10-21',
    documentNumber: 'ER-200',
    counterparty: 'Lieferant GmbH',
    description: 'Wareneinkauf',
    grossCents: 5950,
    vatRate: 19,
    accountNumber: '3400',
  },
  { id: 'unpaid-1', paidAt: '', grossCents: 5000 },
]

test('suggests sales accounts only for supported product sales tax rates', () => {
  assert.equal(getSkr03AccountSuggestion({ type: 'income', category: 'Warenverkauf', vatRate: 19 }), '8400')
  assert.equal(getSkr03AccountSuggestion({ type: 'income', category: 'Warenverkauf', vatRate: 7 }), '8300')
  assert.equal(getSkr03AccountSuggestion({ type: 'expense', category: 'Wareneinkauf', vatRate: 19 }), '')
  assert.equal(getSkr03AccountSuggestion({ type: 'income', category: 'Warenverkauf', vatRate: 0 }), '')
})

test('prepares an idempotently linkable finance entry from a paid sales invoice', () => {
  const entry = createSalesInvoiceFinanceEntry({
    id: 'invoice-1',
    kind: 'rechnung',
    status: 'Bezahlt',
    documentDate: '2026-10-12',
    number: 'RE-2026-0001',
    recipient: 'Getränkemarkt GmbH',
    vatRate: 19,
    items: [{ quantity: 2, unitPrice: 10 }],
  }, { id: 'finance-1', paidAt: '2026-10-20' })
  assert.equal(entry.grossCents, 2380)
  assert.equal(entry.accountNumber, '8400')
  assert.equal(entry.paidAt, '2026-10-20')
  assert.equal(entry.sourceDocumentId, 'invoice-1')
  assert.throws(() => createSalesInvoiceFinanceEntry({ kind: 'rechnung', status: 'Versendet' }, { id: 'finance-2' }), /Nur bezahlte Rechnungen/)
})

test('prepares legacy sales invoices without item arrays', () => {
  const entry = createSalesInvoiceFinanceEntry({
    id: 'legacy-invoice',
    kind: 'rechnung',
    status: 'Bezahlt',
    documentDate: '2026-10-12',
    number: 'RE-OLD',
    vatRate: 7,
    quantity: 3,
    unitPrice: 10,
  }, { id: 'finance-legacy' })
  assert.equal(entry.grossCents, 3210)
  assert.equal(entry.accountNumber, '8300')
})

test('prepares an incoming invoice as a linked purchase expense', () => {
  const entry = createPurchaseFinanceEntry({
    id: 'purchase-1',
    status: 'received',
    invoiceNumber: 'ER-100',
    invoiceDate: '2026-10-25',
    supplierName: 'Flaschenhandel GmbH',
    vatRate: 19,
    lines: [{ quantity: 24, unitCostCents: 500 }],
  }, { id: 'finance-purchase-1', paidAt: '' })
  assert.equal(entry.grossCents, 14280)
  assert.equal(entry.accountNumber, '3400')
  assert.equal(entry.sourcePurchaseOrderId, 'purchase-1')
  assert.throws(() => createPurchaseFinanceEntry({ status: 'ordered' }, { id: 'finance-purchase-2' }), /Eingangsrechnung/)
})

test('exports paid transactions with balanced account directions and excludes unpaid entries', () => {
  const csv = buildDatevPreparationCsv(entries, '2026-10')
  assert.match(csv, /"20\.10\.2026";"RE-100";"Getränkemarkt GmbH";"Warenverkauf";"119,00";"1200";"8400"/)
  assert.match(csv, /"21\.10\.2026";"ER-200";"Lieferant GmbH";"Wareneinkauf";"59,50";"3400";"1200"/)
  assert.doesNotMatch(csv, /unpaid-1/)
})

test('requires a valid SKR03 account and valid booking data before export', () => {
  assert.throws(() => buildDatevPreparationCsv([{ ...entries[0], accountNumber: '' }], '2026-10'), /SKR03-Konto/)
  assert.throws(() => buildDatevPreparationCsv([{ ...entries[0], date: '2026-02-30' }], '2026-10'), /SKR03-Konto/)
  assert.throws(() => buildDatevPreparationCsv(entries, '2026-13'), /Buchungsmonat/)
  assert.throws(() => buildDatevPreparationCsv(entries, '2026-10', '12A0'), /Bankkonto/)
})

test('escapes spreadsheet formula prefixes and quotes in export values', () => {
  const csv = buildDatevPreparationCsv([{
    ...entries[0],
    description: '=HYPERLINK("https://example.test")',
    counterparty: 'Kunde; "Nord"',
  }], '2026-10')
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/)
  assert.match(csv, /"Kunde; ""Nord"""/)
})
