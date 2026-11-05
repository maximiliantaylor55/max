const { validateFinanceReceiptMetadata } = require('./finance-receipt-validation.cjs')

const incomeCategories = new Set(['Warenverkauf', 'Sonstige Einnahmen', 'Erstattungen'])
const expenseCategories = new Set([
  'Wareneinkauf',
  'Verpackung und Versand',
  'Miete und Nebenkosten',
  'Telefon und Internet',
  'Marketing',
  'Fahrtkosten',
  'Gebühren',
  'Versicherungen',
  'Büro und Verwaltung',
  'Sonstige Betriebsausgaben',
])

const isValidDate = (value, allowEmpty = false) => {
  if (allowEmpty && value === '') return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const validateFinanceEntries = (currentValue, nextValue, actor = null) => {
  if (!Array.isArray(nextValue)) throw new Error('Finanzbuchungen müssen als Liste gespeichert werden.')
  const canManageFinance = actor?.role === 'admin'
    || (Array.isArray(actor?.permissions) && actor.permissions.includes('finanzen'))
  if (actor && !canManageFinance) throw new Error('Für Finanzdaten brauchst du eine Admin- oder Finanzen-Berechtigung.')

  const current = Array.isArray(currentValue) ? currentValue : []
  const nextById = new Map()
  const linkedSalesDocuments = new Set()
  const linkedPurchaseOrders = new Set()
  for (const entry of nextValue) {
    const categories = entry?.type === 'income' ? incomeCategories : entry?.type === 'expense' ? expenseCategories : null
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > 100
      || nextById.has(entry.id)
      || !categories?.has(entry.category)
      || !isValidDate(entry.date)
      || !isValidDate(entry.paidAt, true)
      || typeof entry.description !== 'string' || !entry.description.trim() || entry.description.length > 200
      || typeof entry.counterparty !== 'string' || entry.counterparty.length > 160
      || typeof entry.documentNumber !== 'string' || entry.documentNumber.length > 80
      || (entry.accountNumber !== undefined
        && (typeof entry.accountNumber !== 'string' || (entry.accountNumber !== '' && !/^\d{4,6}$/.test(entry.accountNumber))))
      || (entry.sourceDocumentId !== undefined
        && (typeof entry.sourceDocumentId !== 'string' || entry.sourceDocumentId.length > 100))
      || (entry.sourcePurchaseOrderId !== undefined
        && (typeof entry.sourcePurchaseOrderId !== 'string' || entry.sourcePurchaseOrderId.length > 100))
      || !Number.isSafeInteger(entry.grossCents) || entry.grossCents < 1 || entry.grossCents > 100_000_000_000
      || ![0, 7, 19].includes(entry.vatRate)
      || typeof entry.receiptAvailable !== 'boolean') {
      throw new Error('Finanzbuchung ungültig. Bitte Datum, Kategorie, Betrag und Steuersatz prüfen.')
    }
    if (entry.sourceDocumentId) {
      if (entry.type !== 'income' || entry.category !== 'Warenverkauf' || linkedSalesDocuments.has(entry.sourceDocumentId)) {
        throw new Error('Rechnungsverknüpfung ungültig oder bereits vorhanden.')
      }
      linkedSalesDocuments.add(entry.sourceDocumentId)
    }
    if (entry.sourcePurchaseOrderId) {
      if (entry.type !== 'expense' || entry.category !== 'Wareneinkauf' || linkedPurchaseOrders.has(entry.sourcePurchaseOrderId)) {
        throw new Error('Einkaufsverknüpfung ungültig oder bereits vorhanden.')
      }
      if (!entry.receiptAvailable || !Array.isArray(entry.receiptAttachments) || entry.receiptAttachments.length === 0) {
        throw new Error('Für eine verknüpfte Einkaufsrechnung muss ein hochgeladener Beleg vorhanden sein.')
      }
      linkedPurchaseOrders.add(entry.sourcePurchaseOrderId)
    }
    validateFinanceReceiptMetadata(entry.receiptAttachments)
    nextById.set(entry.id, entry)
  }

  if (actor?.role !== 'admin' && current.some((entry) => !nextById.has(String(entry.id)))) {
    throw new Error('Finanzbuchungen dürfen nur von einem Admin gelöscht werden.')
  }
}

module.exports = { validateFinanceEntries }
