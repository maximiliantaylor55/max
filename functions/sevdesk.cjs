// sevDesk API: ZYRO-Rechnungen sowie Einnahmen/Ausgaben aus „Finanzen“ als Beleg (Voucher) inkl. PDF/Beleg übertragen.
// Doku: https://api.sevdesk.de · Basis: https://my.sevdesk.de/api/v1 · Token roh im Authorization-Header (ohne „Bearer“).
// Rechnungen werden als Einnahme-Beleg mit der ZYRO-Rechnungsnummer gebucht (keine zweite sevDesk-Rechnung).
// Setzt sevDesk-Update 2.0 (Steuerregeln statt Steuerart) voraus.

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1'

// Steuerregeln sevDesk 2.0: 1 = umsatzsteuerpflichtige Umsätze, 8 = vorsteuerabziehbare Aufwendungen,
// 9 = nicht vorsteuerabziehbare Aufwendungen.
const TAX_RULE_REVENUE = 1
const TAX_RULE_EXPENSE = 8
const TAX_RULE_EXPENSE_NO_INPUT_TAX = 9

// Standard-Konten je Kontenrahmen. Jede Finanzbuchung kann über „accountNumber“ ein eigenes Konto vorgeben;
// außerdem lassen sich Konten in Firestore unter sevdeskSettings/config.accounts überschreiben.
const defaultAccounts = {
  SKR03: {
    invoice19: '8400',
    invoice7: '8300',
    deposit: '8200',
    income: { Warenverkauf: '8400', 'Sonstige Einnahmen': '8400', Erstattungen: '8400' },
    income7: { Warenverkauf: '8300', 'Sonstige Einnahmen': '8300', Erstattungen: '8300' },
    expense: {
      Wareneinkauf: '3400',
      'Verpackung und Versand': '4710',
      'Miete und Nebenkosten': '4210',
      'Telefon und Internet': '4920',
      Marketing: '4600',
      Fahrtkosten: '4670',
      Gebühren: '4970',
      Versicherungen: '4360',
      'Büro und Verwaltung': '4930',
      'Sonstige Betriebsausgaben': '4900',
    },
    expense7: { Wareneinkauf: '3300' },
  },
  SKR04: {
    invoice19: '4400',
    invoice7: '4300',
    deposit: '4200',
    income: { Warenverkauf: '4400', 'Sonstige Einnahmen': '4400', Erstattungen: '4400' },
    income7: { Warenverkauf: '4300', 'Sonstige Einnahmen': '4300', Erstattungen: '4300' },
    expense: {
      Wareneinkauf: '5400',
      'Verpackung und Versand': '6710',
      'Miete und Nebenkosten': '6310',
      'Telefon und Internet': '6805',
      Marketing: '6600',
      Fahrtkosten: '6670',
      Gebühren: '6855',
      Versicherungen: '6400',
      'Büro und Verwaltung': '6815',
      'Sonstige Betriebsausgaben': '6300',
    },
    expense7: { Wareneinkauf: '5300' },
  },
}

const sevdeskEligibleStatuses = new Set(['Ausgestellt', 'Versendet', 'Überfällig', 'Bezahlt'])

const round2 = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
const germanDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const cleanText = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)

const toList = (result) => (Array.isArray(result?.objects) ? result.objects
  : Array.isArray(result) ? result
    : result?.objects ? [result.objects] : [])

// ---------------------------------------------------------------------------
// Konten & Steuerregeln (aus GET /ReceiptGuidance/forAllAccounts)
// ---------------------------------------------------------------------------
// sevDesk liefert die Steuersätze als Wörter („ZERO“, „SEVEN“, „NINETEEN“), teils auch als Zahl („19.0“).
const rateWords = { ZERO: 0, FIVE: 5, SEVEN: 7, SIXTEEN: 16, NINETEEN: 19 }
const parseRate = (value) => {
  const word = rateWords[String(value ?? '').trim().toUpperCase()]
  return word ?? Number(value)
}

const allowedRates = (guide, ruleId) => (Array.isArray(guide?.allowedTaxRules) ? guide.allowedTaxRules : [])
  .filter((rule) => Number(rule.id) === Number(ruleId))
  .flatMap((rule) => (Array.isArray(rule.taxRates) ? rule.taxRates : []).map(parseRate))

// Kurzbeschreibung für Fehlermeldungen: was erlaubt sevDesk für dieses Konto tatsächlich?
const describeGuide = (guides, accountNumber) => {
  const guide = findGuide(guides, accountNumber)
  if (!guide) {
    const total = toList(guides).length
    const revenue19 = toList(guides)
      .filter((entry) => allowedRates(entry, TAX_RULE_REVENUE).includes(19))
      .slice(0, 8)
      .map((entry) => `${entry.accountNumber}${entry.accountName ? ` ${cleanText(entry.accountName, 40)}` : ''}`)
    return `Konto ${accountNumber} ist in sevDesk nicht vorhanden; sevDesk kennt ${total} Konten`
      + (revenue19.length ? `, Erlöskonten mit 19 %: ${revenue19.join(', ')}` : '')
  }
  const rules = (Array.isArray(guide.allowedTaxRules) ? guide.allowedTaxRules : [])
    .map((rule) => `Regel ${rule.id}: ${(Array.isArray(rule.taxRates) ? rule.taxRates : []).join('/') || '–'}`)
  return `sevDesk erlaubt für ${accountNumber}: ${rules.join('; ') || 'keine Steuerregel'}`
}

// Kontonummern ggf. mit führenden Nullen („08400“) – daher auch numerisch vergleichen.
const sameAccount = (a, b) => String(a).trim() === String(b).trim()
  || (/^\d+$/.test(String(a).trim()) && /^\d+$/.test(String(b).trim()) && Number(a) === Number(b))
const findGuide = (guides, accountNumber) => toList(guides).find((entry) => sameAccount(entry.accountNumber, accountNumber)) || null

// Erkennt den Kontenrahmen am Erlöskonto: 8400 → SKR03, 4400 → SKR04.
const detectChart = (guides) => {
  if (allowedRates(findGuide(guides, '8400'), TAX_RULE_REVENUE).includes(19)) return 'SKR03'
  if (allowedRates(findGuide(guides, '4400'), TAX_RULE_REVENUE).includes(19)) return 'SKR04'
  return ''
}

// Liefert die DATEV-Konto-ID, wenn das Konto die Steuerregel mit allen geforderten Steuersätzen erlaubt.
const resolveAccount = (guides, accountNumber, ruleId, rates) => {
  const guide = findGuide(guides, accountNumber)
  if (!guide) return null
  const allowed = allowedRates(guide, ruleId)
  if (!rates.every((rate) => allowed.includes(Number(rate)))) return null
  return Number(guide.accountDatevId)
}

const mergeAccounts = (chart, overrides = {}) => {
  const base = defaultAccounts[chart]
  if (!base) throw new Error('sevDesk-Kontenrahmen (SKR03/SKR04) konnte nicht erkannt werden. Bitte in Firestore unter sevdeskSettings/config „chart“ setzen.')
  return {
    ...base,
    ...overrides,
    chart,
    income: { ...base.income, ...(overrides.income || {}) },
    income7: { ...base.income7, ...(overrides.income7 || {}) },
    expense: { ...base.expense, ...(overrides.expense || {}) },
    expense7: { ...base.expense7, ...(overrides.expense7 || {}) },
  }
}

// ---------------------------------------------------------------------------
// Belege bauen
// ---------------------------------------------------------------------------
const buildVoucher = ({ creditDebit, date, dueDate, number, partner, taxRuleId, positions, filename }) => ({
  voucher: {
    objectName: 'Voucher',
    mapAll: true,
    voucherDate: germanDate(date),
    deliveryDate: germanDate(date),
    paymentDeadline: germanDate(isIsoDate(dueDate) && dueDate >= date ? dueDate : date),
    description: cleanText(number, 100),
    supplierName: cleanText(partner, 100) || null,
    status: 100,
    taxRule: { id: taxRuleId, objectName: 'TaxRule' },
    creditDebit,
    voucherType: 'VOU',
    currency: 'EUR',
  },
  voucherPosSave: positions.map((position) => ({
    objectName: 'VoucherPos',
    mapAll: true,
    accountDatev: { id: position.accountId, objectName: 'AccountDatev' },
    taxRate: position.taxRate,
    // Brutto übergeben, damit sevDesk exakt den Belegbetrag bucht (keine Rundungsdifferenz bei der USt.).
    net: false,
    sumGross: round2(position.gross),
    comment: cleanText(position.comment, 250),
  })),
  voucherPosDelete: null,
  filename: filename || null,
})

const getInvoiceIneligibleReason = (invoice) => {
  if (!invoice || invoice.kind !== 'rechnung') return 'Nur Rechnungen können an sevDesk übertragen werden.'
  if (invoice.status === 'Storniert') return 'Stornierte Rechnungen werden nicht übertragen.'
  if (!sevdeskEligibleStatuses.has(invoice.status)) return 'Nur ausgestellte Rechnungen (nicht Entwürfe) werden übertragen.'
  if (!String(invoice.number || '').trim()) return 'Die Rechnung hat keine Rechnungsnummer.'
  if (!isIsoDate(invoice.documentDate)) return 'Die Rechnung hat kein gültiges Rechnungsdatum.'
  return ''
}

// Rechnung → Einnahme-Beleg. totals = calculateInvoiceTotals(invoice, products) aus auto-invoice.cjs.
const buildInvoiceVoucher = ({ invoice, totals, guides, accounts, filename }) => {
  const reason = getInvoiceIneligibleReason(invoice)
  if (reason) throw new Error(reason)
  const vatRate = Number(totals.vatRate)
  if (![7, 19].includes(vatRate)) {
    throw new Error(`Rechnungen mit ${vatRate} % USt. bitte manuell in sevDesk buchen (nur 7 % und 19 % werden automatisch übertragen).`)
  }
  const netTotal = round2(totals.netTotal)
  const taxTotal = round2(totals.taxTotal)
  const depositTotal = round2(totals.depositTotal)
  if (!(netTotal > 0)) throw new Error('Der Rechnungsbetrag ist ungültig.')

  const mainNumber = vatRate === 19 ? accounts.invoice19 : accounts.invoice7
  const mainId = resolveAccount(guides, mainNumber, TAX_RULE_REVENUE, [vatRate])
  if (!mainId) throw new Error(`sevDesk-Erlöskonto ${mainNumber} erlaubt keine ${vatRate} % USt. (${describeGuide(guides, mainNumber)}) – bitte Konto in sevdeskSettings/config anpassen.`)
  const comment = [`ZYRO ${invoice.number}`, invoice.orderNumber ? `Auftrag ${invoice.orderNumber}` : ''].filter(Boolean).join(' · ')
  const positions = [{ accountId: mainId, taxRate: vatRate, gross: netTotal + taxTotal, comment }]
  if (depositTotal > 0) {
    // Pfand steht auf der ZYRO-Rechnung ohne eigene USt. → hier als 0-%-Position.
    const depositId = resolveAccount(guides, accounts.deposit, TAX_RULE_REVENUE, [0])
    if (!depositId) {
      throw new Error(`Für das Pfand (0 % USt.) erlaubt sevDesk-Konto ${accounts.deposit} keine Buchung. Bitte in Firestore unter sevdeskSettings/config „accounts.deposit“ ein passendes Konto eintragen.`)
    }
    positions.push({ accountId: depositId, taxRate: 0, gross: depositTotal, comment: `Pfand · ZYRO ${invoice.number}` })
  }
  return buildVoucher({
    creditDebit: 'D',
    date: invoice.documentDate,
    dueDate: invoice.dueDate,
    number: invoice.number,
    partner: invoice.recipient,
    taxRuleId: TAX_RULE_REVENUE,
    positions,
    filename,
  })
}

// Finanzbuchung (Einnahme/Ausgabe) prüfen. Einnahmen aus einer Rechnung kommen schon über die Rechnung.
const getEntryIneligibleReason = (entry) => {
  if (!entry || !['income', 'expense'].includes(entry.type)) return 'Unbekannte Buchungsart.'
  if (entry.type === 'income' && entry.sourceDocumentId) return 'Kommt bereits über die verknüpfte Rechnung nach sevDesk.'
  if (!isIsoDate(entry.date)) return 'Die Buchung hat kein gültiges Datum.'
  if (!Number.isSafeInteger(entry.grossCents) || entry.grossCents < 1) return 'Der Betrag ist ungültig.'
  if (![0, 7, 19].includes(Number(entry.vatRate))) return 'Der Steuersatz ist ungültig.'
  return ''
}

// Eindeutige Belegnummer in sevDesk: eigene Belegnummer der Buchung, sonst Kurzform der ZYRO-ID.
const entryVoucherNumber = (entry) => cleanText(entry.documentNumber, 80)
  || `ZYRO-${entry.type === 'income' ? 'E' : 'A'}-${String(entry.id).replace(/[^A-Za-z0-9]/g, '').slice(-12)}`

const buildEntryVoucher = ({ entry, guides, accounts, filename }) => {
  const reason = getEntryIneligibleReason(entry)
  if (reason) throw new Error(reason)
  const vatRate = Number(entry.vatRate)
  const isIncome = entry.type === 'income'
  // Das Sachkonto in der ZYRO-Buchung ist ein SKR03-Konto – nur übernehmen, wenn sevDesk auch SKR03 nutzt.
  const ownAccount = accounts.chart === 'SKR03' ? String(entry.accountNumber || '').trim() : ''
  const accountNumber = ownAccount
    || (vatRate === 7 && (isIncome ? accounts.income7 : accounts.expense7)[entry.category])
    || (isIncome ? accounts.income : accounts.expense)[entry.category]
  if (!accountNumber) throw new Error(`Für die Kategorie „${entry.category}“ ist kein sevDesk-Konto hinterlegt.`)

  // Steuerregel wählen, die das Konto mit diesem Steuersatz erlaubt.
  const rules = isIncome ? [TAX_RULE_REVENUE] : [TAX_RULE_EXPENSE, TAX_RULE_EXPENSE_NO_INPUT_TAX]
  let taxRuleId = 0
  let accountId = null
  for (const rule of rules) {
    accountId = resolveAccount(guides, accountNumber, rule, [vatRate])
    if (accountId) { taxRuleId = rule; break }
  }
  if (!accountId) {
    throw new Error(`sevDesk-Konto ${accountNumber} erlaubt für ${isIncome ? 'Einnahmen' : 'Ausgaben'} keine ${vatRate} % USt. (${describeGuide(guides, accountNumber)}) – bitte in der Buchung ein anderes Konto (Kontonummer) eintragen.`)
  }
  const number = entryVoucherNumber(entry)
  return buildVoucher({
    creditDebit: isIncome ? 'D' : 'C',
    date: entry.date,
    dueDate: entry.date,
    number,
    partner: entry.counterparty,
    taxRuleId,
    positions: [{ accountId, taxRate: vatRate, gross: entry.grossCents / 100, comment: `${entry.category}: ${entry.description}` }],
    filename,
  })
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const readSevdeskError = (result, status) => {
  const message = result?.error?.message || result?.message || result?.error
  return String(typeof message === 'string' ? message : JSON.stringify(message || '') || `HTTP ${status}`).slice(0, 400)
}

// Ruft die sevDesk-API auf; bei 429 (Ratenlimit) bis zu 3× mit wachsender Pause wiederholen.
const callSevdeskApi = async (apiToken, path, { method = 'GET', body, form, fetchImpl = fetch, retries = 3 } = {}) => {
  const headers = { Authorization: apiToken, Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  for (let attempt = 0; ; attempt += 1) {
    let response
    try {
      response = await fetchImpl(`${SEVDESK_BASE}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(form ? { body: form } : {}),
        signal: AbortSignal.timeout(30000),
      })
    } catch (error) {
      throw new Error(`sevDesk ist nicht erreichbar: ${error.message}`)
    }
    if (response.status === 429 && attempt < retries) {
      await sleep(1000 * 2 ** attempt)
      continue
    }
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(response.status === 401
        ? 'sevDesk: API-Token ungültig. Bitte in sevDesk unter Einstellungen → Benutzer den Token prüfen.'
        : `sevDesk (${response.status}): ${readSevdeskError(result, response.status)}`)
      error.sevdeskStatus = response.status
      throw error
    }
    return result
  }
}

// Sucht einen schon vorhandenen Beleg mit derselben Belegnummer und Richtung (verhindert Doppelbuchungen).
const findSevdeskVoucherByNumber = async (apiToken, number, creditDebit, options = {}) => {
  const query = new URLSearchParams({ creditDebit, descriptionLike: number, limit: '100' })
  const result = await callSevdeskApi(apiToken, `/Voucher?${query}`, options)
  return toList(result).find((entry) => String(entry.description || '').trim() === String(number).trim() && entry.id) || null
}

const allowedUploadTypes = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const uploadSevdeskTempFile = async (apiToken, data, filename, contentType = 'application/pdf', options = {}) => {
  if (!Buffer.isBuffer(data) || data.length < 5) throw new Error('Der Beleg ist ungültig.')
  if (!allowedUploadTypes.has(contentType)) throw new Error('Nur PDF, JPG und PNG können an sevDesk übertragen werden.')
  if (contentType === 'application/pdf' && data.subarray(0, 4).toString() !== '%PDF') throw new Error('Die PDF ist ungültig.')
  const form = new FormData()
  form.append('file', new Blob([data], { type: contentType }), filename)
  const result = await callSevdeskApi(apiToken, '/Voucher/Factory/uploadTempFile', { ...options, method: 'POST', form })
  const tempName = result?.objects?.filename || result?.filename
  if (!tempName) throw new Error('sevDesk hat für den Beleg keinen Dateinamen zurückgegeben.')
  return String(tempName)
}

const safeFileName = (value, fallback = 'Beleg') => {
  const text = String(value || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
  return text || fallback
}

module.exports = {
  SEVDESK_BASE,
  TAX_RULE_EXPENSE,
  TAX_RULE_EXPENSE_NO_INPUT_TAX,
  TAX_RULE_REVENUE,
  buildEntryVoucher,
  buildInvoiceVoucher,
  callSevdeskApi,
  defaultAccounts,
  detectChart,
  entryVoucherNumber,
  findSevdeskVoucherByNumber,
  getEntryIneligibleReason,
  getInvoiceIneligibleReason,
  mergeAccounts,
  resolveAccount,
  safeFileName,
  sleep,
  toList,
  uploadSevdeskTempFile,
}
