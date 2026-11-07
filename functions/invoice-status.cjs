const allowedStatusChanges = {
  Entwurf: new Set(['Ausgestellt', 'Versendet', 'Storniert']),
  Ausgestellt: new Set(['Versendet', 'Bezahlt', 'Überfällig', 'Storniert']),
  Versendet: new Set(['Bezahlt', 'Überfällig', 'Storniert']),
  Überfällig: new Set(['Bezahlt', 'Storniert']),
  Bezahlt: new Set(['Storniert']),
  Storniert: new Set(),
}

const isAllowedInvoiceStatusChange = (previous, next) => (
  previous === next || Boolean(allowedStatusChanges[previous]?.has(next))
)

const invoiceFieldsForComparison = (invoice) => {
  const fields = { ...invoice }
  delete fields.status
  delete fields.emailedAt
  delete fields.portalPublishedAt
  return fields
}

const haveSameInvoiceFields = (previous, next) => {
  const originalFields = invoiceFieldsForComparison(previous)
  const nextFields = invoiceFieldsForComparison(next)
  if (previous.status !== 'Bezahlt' && !previous.paidAt && next.status === 'Bezahlt'
    && /^\d{4}-\d{2}-\d{2}$/.test(next.paidAt || '')) {
    delete originalFields.paidAt
    delete nextFields.paidAt
  }
  return JSON.stringify(originalFields) === JSON.stringify(nextFields)
}

module.exports = { isAllowedInvoiceStatusChange, haveSameInvoiceFields }
