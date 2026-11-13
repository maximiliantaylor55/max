// Lexware Office Public API: ZYRO-Rechnungen als Buchhaltungsbeleg („Ausgangsrechnung“) inkl. PDF übertragen.
// Doku: https://developers.lexware.io/docs/ · Gateway: https://api.lexware.io · max. 2 Anfragen/Sekunde.
// Es wird bewusst KEINE neue Lexware-Rechnung erzeugt (die hätte eine eigene Nummer), sondern ein Beleg
// mit der ZYRO-Rechnungsnummer – so gibt es jede Rechnung nur einmal.

const LEXWARE_BASE = 'https://api.lexware.io'

// Buchungskategorien laut Lexware-Doku (Ausgangsrechnungen).
const LEXWARE_CATEGORY_WARENVERKAEUFE = '8f8664a8-fd86-11e1-a21f-0800200c9a66'

// Diese ZYRO-Rechnungsstatus gelten als ausgestellt und werden übertragen.
const lexwareEligibleStatuses = new Set(['Ausgestellt', 'Versendet', 'Überfällig', 'Bezahlt'])

const round2 = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
const isLexwareUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Prüft, ob eine Rechnung übertragen werden darf, und liefert sonst einen verständlichen Grund.
const getLexwareIneligibleReason = (invoice) => {
  if (!invoice || invoice.kind !== 'rechnung') return 'Nur Rechnungen können an Lexware übertragen werden.'
  if (invoice.status === 'Storniert') return 'Stornierte Rechnungen werden nicht übertragen.'
  if (!lexwareEligibleStatuses.has(invoice.status)) return 'Nur ausgestellte Rechnungen (nicht Entwürfe) werden übertragen.'
  if (!String(invoice.number || '').trim()) return 'Die Rechnung hat keine Rechnungsnummer.'
  if (!isIsoDate(invoice.documentDate)) return 'Die Rechnung hat kein gültiges Rechnungsdatum.'
  return ''
}

// Baut den Beleg für POST /v1/vouchers. totals = calculateInvoiceTotals(invoice, products) aus auto-invoice.cjs.
const buildLexwareVoucherPayload = (invoice, totals) => {
  const reason = getLexwareIneligibleReason(invoice)
  if (reason) throw new Error(reason)
  const vatRate = Number(totals.vatRate)
  if (![7, 19].includes(vatRate)) {
    // 0 % (EU-/Auslandslieferung) braucht in Lexware eine andere Kategorie – lieber nicht falsch buchen.
    throw new Error(`Rechnungen mit ${vatRate} % USt. bitte manuell in Lexware buchen (nur 7 % und 19 % werden automatisch übertragen).`)
  }
  const netTotal = round2(totals.netTotal)
  const taxTotal = round2(totals.taxTotal)
  const depositTotal = round2(totals.depositTotal)
  if (!(netTotal > 0)) throw new Error('Der Rechnungsbetrag ist ungültig.')

  const voucherItems = [{
    amount: netTotal,
    taxAmount: taxTotal,
    taxRatePercent: vatRate,
    categoryId: LEXWARE_CATEGORY_WARENVERKAEUFE,
  }]
  // Pfand wird auf der ZYRO-Rechnung ohne eigene USt. ausgewiesen → hier ebenso als 0-%-Position.
  if (depositTotal > 0) {
    voucherItems.push({ amount: depositTotal, taxAmount: 0, taxRatePercent: 0, categoryId: LEXWARE_CATEGORY_WARENVERKAEUFE })
  }
  const totalTaxAmount = round2(voucherItems.reduce((sum, item) => sum + item.taxAmount, 0))
  const totalGrossAmount = round2(voucherItems.reduce((sum, item) => sum + item.amount + item.taxAmount, 0))
  const dueDate = isIsoDate(invoice.dueDate) && invoice.dueDate >= invoice.documentDate ? invoice.dueDate : invoice.documentDate
  const remark = [`ZYRO ${invoice.number}`, invoice.recipient, invoice.orderNumber ? `Auftrag ${invoice.orderNumber}` : '']
    .map((part) => String(part || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ').slice(0, 500)

  return {
    type: 'salesinvoice',
    voucherStatus: 'open',
    voucherNumber: String(invoice.number).trim().slice(0, 50),
    voucherDate: invoice.documentDate,
    dueDate,
    totalGrossAmount,
    totalTaxAmount,
    taxType: 'net',
    useCollectiveContact: true,
    remark,
    voucherItems,
  }
}

const readLexwareError = (result, status) => {
  const details = Array.isArray(result?.details)
    ? result.details.map((entry) => [entry.field, entry.message || entry.violation].filter(Boolean).join(': ')).filter(Boolean).join('; ')
    : ''
  return String(details || result?.message || result?.error || `HTTP ${status}`).slice(0, 400)
}

// Ruft die Lexware-API auf; bei 429 (Ratenlimit) wird bis zu 3× mit wachsender Pause wiederholt.
const callLexwareApi = async (apiKey, path, { method = 'GET', body, form, fetchImpl = fetch, retries = 3 } = {}) => {
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  for (let attempt = 0; ; attempt += 1) {
    let response
    try {
      response = await fetchImpl(`${LEXWARE_BASE}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(form ? { body: form } : {}),
        signal: AbortSignal.timeout(30000),
      })
    } catch (error) {
      throw new Error(`Lexware ist nicht erreichbar: ${error.message}`)
    }
    if (response.status === 429 && attempt < retries) {
      await sleep(1000 * 2 ** attempt)
      continue
    }
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(response.status === 401
        ? 'Lexware: API-Schlüssel ungültig oder abgelaufen (Schlüssel sind max. 24 Monate gültig).'
        : response.status === 403
          ? 'Lexware: Dem API-Schlüssel fehlt die Berechtigung (Belege lesen/schreiben).'
          : `Lexware (${response.status}): ${readLexwareError(result, response.status)}`)
      error.lexwareStatus = response.status
      throw error
    }
    return result
  }
}

// Sucht einen bereits vorhandenen Ausgangsbeleg mit derselben Belegnummer (verhindert Doppelbuchungen).
const findLexwareVoucherByNumber = async (apiKey, voucherNumber, options = {}) => {
  const query = new URLSearchParams({ voucherType: 'salesinvoice', voucherStatus: 'any', voucherNumber, size: '25' })
  const result = await callLexwareApi(apiKey, `/v1/voucherlist?${query}`, options)
  const content = Array.isArray(result?.content) ? result.content : []
  return content.find((entry) => String(entry.voucherNumber) === String(voucherNumber) && isLexwareUuid(entry.id)) || null
}

const uploadLexwareVoucherFile = async (apiKey, voucherId, pdf, filename, options = {}) => {
  if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 4).toString() !== '%PDF') throw new Error('Die Rechnungs-PDF ist ungültig.')
  const form = new FormData()
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), filename)
  return callLexwareApi(apiKey, `/v1/vouchers/${voucherId}/files`, { ...options, method: 'POST', form })
}

const lexwareFileName = (invoiceNumber) => `${String(invoiceNumber || 'Rechnung').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'Rechnung'}.pdf`

module.exports = {
  LEXWARE_BASE,
  LEXWARE_CATEGORY_WARENVERKAEUFE,
  lexwareEligibleStatuses,
  buildLexwareVoucherPayload,
  callLexwareApi,
  findLexwareVoucherByNumber,
  getLexwareIneligibleReason,
  isLexwareUuid,
  lexwareFileName,
  sleep,
  uploadLexwareVoucherFile,
}
