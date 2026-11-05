const { normalizeEmailAddress } = require('./email-address.cjs')

const salesDocumentLabels = {
  rechnung: 'Rechnung',
  angebot: 'Angebot',
  kundenauftrag: 'Auftragsbestätigung',
}

const validateSalesDocumentEmail = (input = {}) => {
  const email = normalizeEmailAddress(input.email)
  const kind = String(input.kind || '')
  const label = salesDocumentLabels[kind]
  const number = String(input.number || '').trim()
  const recipientName = String(input.recipientName || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120)
  const pdfBase64 = String(input.pdfBase64 || '')
  if (!label || !/^[A-Za-z0-9-]{1,40}$/.test(number)) {
    throw new Error('Dokumenttyp oder Belegnummer ungültig.')
  }
  if (!pdfBase64 || pdfBase64.length > 7 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(pdfBase64)) {
    throw new Error('Die Rechnungs-PDF ist ungültig oder zu groß.')
  }
  const pdf = Buffer.from(pdfBase64, 'base64')
  if (pdf.length < 5 || pdf.length > 5 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('Die Datei ist kein gültiges PDF.')
  }
  return {
    email,
    kind,
    label,
    number,
    recipientName: recipientName || email,
    pdf,
  }
}

module.exports = { validateSalesDocumentEmail }
