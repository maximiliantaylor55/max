const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const accountPattern = /^\d{4,6}$/
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export const getSkr03AccountSuggestion = ({ type, category, vatRate }) => {
  if (type !== 'income' || category !== 'Warenverkauf') return ''
  if (Number(vatRate) === 19) return '8400'
  if (Number(vatRate) === 7) return '8300'
  return ''
}

export const createSalesInvoiceFinanceEntry = (invoice, { id, paidAt = '' }) => {
  if (!invoice || invoice.kind !== 'rechnung' || invoice.status !== 'Bezahlt') {
    throw new Error('Nur bezahlte Rechnungen können für die Finanzbuchhaltung vorbereitet werden.')
  }
  if (id === undefined || id === null || !isValidDate(invoice.documentDate)) {
    throw new Error('Rechnungsnummer oder Belegdatum fehlt.')
  }
  if (paidAt !== '' && !isValidDate(paidAt)) throw new Error('Das Zahlungsdatum ist ungültig.')

  const vatRate = Number(invoice.vatRate)
  const items = Array.isArray(invoice.items) && invoice.items.length > 0
    ? invoice.items
    : [{ quantity: invoice.quantity ?? 1, unitPrice: invoice.unitPrice ?? 0 }]
  if (![0, 7, 19].includes(vatRate)) {
    throw new Error('Rechnungspositionen oder Umsatzsteuersatz sind ungültig.')
  }
  const netCents = items.reduce((sum, item) => {
    const quantity = Number(item.quantity)
    const unitPriceCents = Math.round(Number(item.unitPrice) * 100)
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) {
      throw new Error('Eine Rechnungsposition enthält ungültige Menge oder Preis.')
    }
    return sum + Math.round(quantity * unitPriceCents)
  }, 0)
  if (!Number.isSafeInteger(netCents) || netCents < 1) throw new Error('Der Rechnungsbetrag ist ungültig.')

  const grossCents = Math.round(netCents * (1 + vatRate / 100))
  const entry = {
    id: String(id),
    type: 'income',
    category: 'Warenverkauf',
    date: invoice.documentDate,
    paidAt: typeof paidAt === 'string' ? paidAt : '',
    description: `Rechnung ${String(invoice.number || '').slice(0, 80)}`,
    counterparty: String(invoice.recipient || '').slice(0, 160),
    documentNumber: String(invoice.number || '').slice(0, 80),
    grossCents,
    vatRate,
    receiptAvailable: false,
    receiptAttachments: [],
    sourceDocumentId: String(invoice.id),
  }
  entry.accountNumber = getSkr03AccountSuggestion(entry)
  return entry
}

export const createPurchaseFinanceEntry = (order, { id, paidAt = '' }) => {
  if (!order || !['ordered', 'partial', 'received'].includes(order.status) || !order.invoiceNumber || !isValidDate(order.invoiceDate)) {
    throw new Error('Für die Einkaufsbuchung werden eine Eingangsrechnung mit Belegnummer und Belegdatum benötigt.')
  }
  if (id === undefined || id === null || (paidAt !== '' && !isValidDate(paidAt))) {
    throw new Error('Buchungs-ID oder Zahlungsdatum ungültig.')
  }
  const netCents = order.lines.reduce((sum, line) => (
    sum + line.quantity * line.unitCostCents
  ), 0)
  if (!Number.isSafeInteger(netCents) || netCents < 1) throw new Error('Nettobetrag der Einkaufsrechnung ist ungültig.')
  const grossCents = Math.round(netCents * (1 + Number(order.vatRate) / 100))
  return {
    id: String(id),
    type: 'expense',
    category: 'Wareneinkauf',
    date: order.invoiceDate,
    paidAt,
    description: `Eingangsrechnung ${String(order.invoiceNumber).slice(0, 80)}`,
    counterparty: String(order.supplierName || '').slice(0, 160),
    documentNumber: String(order.invoiceNumber).slice(0, 80),
    grossCents,
    vatRate: Number(order.vatRate),
    receiptAvailable: false,
    receiptAttachments: [],
    accountNumber: '3400',
    sourcePurchaseOrderId: String(order.id),
  }
}

const csvCell = (value) => {
  const text = String(value ?? '')
  const safeText = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text
  return `"${safeText.replaceAll('"', '""')}"`
}

const euro = (cents) => (cents / 100).toFixed(2).replace('.', ',')
const exportDate = (date) => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`
const isValidDate = (value) => datePattern.test(value)
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value

export const buildDatevPreparationCsv = (entries, month, bankAccount = '1200') => {
  if (!monthPattern.test(month)) throw new Error('Ungültiger Buchungsmonat.')
  if (!accountPattern.test(bankAccount)) throw new Error('Das SKR03-Bankkonto muss 4 bis 6 Ziffern haben.')

  const records = (Array.isArray(entries) ? entries : []).filter((entry) => (
    typeof entry?.paidAt === 'string' && entry.paidAt.startsWith(`${month}-`)
  ))
  if (records.length === 0) throw new Error('Für den ausgewählten Monat gibt es keine bezahlten Buchungen.')

  const invalidEntry = records.find((entry) => (
    !accountPattern.test(String(entry.accountNumber || ''))
    || !Number.isSafeInteger(entry.grossCents) || entry.grossCents < 1
    || !['income', 'expense'].includes(entry.type)
    || !isValidDate(entry.date)
    || !isValidDate(entry.paidAt)
    || ![0, 7, 19].includes(Number(entry.vatRate))
  ))
  if (invalidEntry) {
    throw new Error(`Buchung „${invalidEntry.description || invalidEntry.id}“ braucht ein gültiges SKR03-Konto und Belegdatum.`)
  }

  const rows = [
    ['Belegdatum', 'Zahlungsdatum', 'Belegfeld 1', 'Geschäftspartner', 'Buchungstext', 'Umsatz brutto EUR', 'Sollkonto', 'Habenkonto', 'Steuersatz %'],
    ...records.map((entry) => [
      exportDate(entry.date),
      exportDate(entry.paidAt),
      entry.documentNumber,
      entry.counterparty,
      entry.description,
      euro(entry.grossCents),
      entry.type === 'income' ? bankAccount : entry.accountNumber,
      entry.type === 'income' ? entry.accountNumber : bankAccount,
      entry.vatRate,
    ]),
  ]

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`
}
