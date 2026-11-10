const claimTypeCodes = new Map([
  ['H01', 'Anzeigen in Zeitungen u.a.'],
  ['H02', 'Ärztliche oder zahnärztliche Leistung'],
  ['H03', 'Bürgschaft'],
  ['H04', 'Darlehensrückzahlung'],
  ['H05', 'Dienstleistungsvertrag'],
  ['H06', 'Frachtkosten'],
  ['H07', 'Geschäftsbesorgung durch Selbständige'],
  ['H08', 'Handwerkerleistung'],
  ['H09', 'Heimunterbringung'],
  ['H10', 'Hotelkosten'],
  ['H11', 'Kaufvertrag'],
  ['H12', 'Kontokorrentabrechnung'],
  ['H13', 'Krankenhauskosten-Pflege/Behandlung'],
  ['H14', 'Lagerkosten'],
  ['H15', 'Leasing/Mietkauf'],
  ['H16', 'Lehrgangs-/Unterrichtskosten'],
  ['H17', 'Miete für Geschäftsraum einschl. Nebenkosten'],
  ['H18', 'Miete für Kraftfahrzeug'],
  ['H19', 'Miete für Wohnraum einschl. Nebenkosten'],
  ['H20', 'Mietnebenkosten - auch Renovierungskosten-'],
  ['H21', 'Miete'],
  ['H22', 'Mitgliedsbeitrag'],
  ['H23', 'Pacht'],
  ['H24', 'Rechtsanwalts-/Rechtsbeistandshonorar'],
  ['H25', 'Rentenrückstände'],
  ['H26', 'Reparaturleistung'],
  ['H27', 'Rückgriff aus Versicherungsvertrag wegen Unfall/Vorfall'],
  ['H28', 'Schadenersatz aus Vertrag'],
  ['H29', 'Schadenersatz aus Unfall/Vorfall'],
  ['H30', 'Scheck/Wechsel'],
  ['H31', 'Scheck-/Wechselprovision (1/3 %)'],
  ['H32', 'Scheck-/Wechselunkosten - Spesen/Protest-'],
  ['H33', 'Schuldanerkenntnis'],
  ['H34', 'Speditionskosten'],
  ['H35', 'Tilgungs-/Zinsraten'],
  ['H36', 'Überziehung des Bankkontos'],
  ['H37', 'Ungerechtfertigte Bereicherung'],
  ['H38', 'Unterhaltsrückstände'],
  ['H39', 'Vergleich, außergerichtlicher'],
  ['H40', 'Vermittlungs-/Maklerprovision'],
  ['H41', 'Versicherungsprämie/-beitrag'],
  ['H42', 'Versorgungsleistung - Strom, Wasser, Gas, Wärme-'],
  ['H43', 'Warenlieferung/-en'],
  ['H44', 'Werkvertrag/Werklieferungsvertrag'],
  ['H45', 'Zeitungs-/Zeitschriftenbezug'],
  ['H46', 'Zinsrückstände/Verzugszinsen'],
  ['H61', 'Wahlleistungen bei stationärer Behandlung'],
  ['H70', 'Kindertagesstättenbeitrag'],
  ['H75', 'Reisevertrag'],
  ['H76', 'Telekommunikationsleistungen'],
  ['H77', 'Krankentransportkosten'],
  ['H78', 'Tierärztliche Leistung'],
  ['H79', 'Verpflegungskosten'],
  ['H80', 'Rückgriff aus Bürgschaft oder Garantie'],
  ['H90', 'Wohngeld/Hausgeld für Wohnungseigentümergemeinschaft'],
  ['H95', 'Beiträge zur privaten Pflegeversicherung'],
])

const requiredText = (value, label, maxLength = 200) => {
  const text = String(value || '').trim()
  if (!text || text.length > maxLength) throw new Error(`${label} fehlt oder ist zu lang.`)
  return text
}

const optionalText = (value, maxLength = 200) => {
  const text = String(value || '').trim()
  if (text.length > maxLength) throw new Error('Ein Paywise-Feld ist zu lang.')
  return text
}

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value

const normalizePaywiseSubmission = (input = {}) => {
  const actingAs = input.actingAs
  const identityType = input.identityType
  if (!['consumer', 'business'].includes(actingAs)) throw new Error('Bitte die tatsächliche Schuldnerart auswählen.')
  if (actingAs === 'business' && !['organization', 'person'].includes(identityType)) {
    throw new Error('Bitte die tatsächliche Unternehmensform auswählen.')
  }

  const debtor = {
    actingAs,
    street: requiredText(input.street, 'Straße', 180),
    postalCode: requiredText(input.postalCode, 'Postleitzahl', 20),
    city: requiredText(input.city, 'Ort', 100),
    country: requiredText(input.country, 'Ländercode', 2).toUpperCase(),
    identityType: actingAs === 'business' ? identityType : 'person',
  }
  if (!/^[A-Z]{2}$/.test(debtor.country)) throw new Error('Bitte den zweistelligen ISO-Ländercode eingeben.')
  if (debtor.country === 'DE' && !/^\d{5}$/.test(debtor.postalCode)) {
    throw new Error('Für Deutschland muss die Postleitzahl aus fünf Ziffern bestehen.')
  }

  if (debtor.identityType === 'organization') {
    debtor.organizationName = requiredText(input.organizationName, 'Firmenname', 200)
  } else {
    debtor.firstName = requiredText(input.firstName, 'Vorname', 100)
    debtor.lastName = requiredText(input.lastName, 'Nachname', 100)
    const salutation = optionalText(input.salutation, 2).toLowerCase()
    if (salutation && !['mr', 'ms', 'mx'].includes(salutation)) throw new Error('Anrede ungültig.')
    debtor.salutation = salutation
  }

  const claimTypeCode = requiredText(input.claimTypeCode, 'Rechtsgrund', 3).toUpperCase()
  if (!claimTypeCodes.has(claimTypeCode)) throw new Error('Bitte einen gültigen Paywise-Rechtsgrund auswählen.')
  if (['H17', 'H19'].includes(claimTypeCode)) {
    throw new Error('Mietforderungen benötigen einen gesonderten Paywise-Mietauftrag und können hier nicht übergeben werden.')
  }

  const documentDate = requiredText(input.documentDate, 'Rechnungsdatum', 10)
  const dueDate = requiredText(input.dueDate, 'Fälligkeitsdatum', 10)
  const delayDate = requiredText(input.delayDate, 'Verzugsdatum', 10)
  if (![documentDate, dueDate, delayDate].every(isIsoDate)) throw new Error('Bitte gültige Datumsangaben wählen.')
  const today = new Date().toISOString().slice(0, 10)
  if (documentDate > today || dueDate > today || delayDate > today || delayDate < dueDate) {
    throw new Error('Die Rechnung muss fällig sein; das Verzugsdatum muss zwischen Fälligkeit und heute liegen.')
  }
  if (input.creditorObligationFulfilled !== true
    || input.claimUndisputed !== true
    || input.fullAmountOutstanding !== true) {
    throw new Error('Bitte die vollständige Leistung, die unbestrittene Forderung und den noch offenen Gesamtbetrag ausdrücklich bestätigen.')
  }

  return {
    debtor,
    claimTypeCode,
    legalDescription: requiredText(input.legalDescription, 'Beschreibung des Vertrags / Geschäfts', 2000),
    documentDate,
    dueDate,
    delayDate,
    creditorObligationFulfilled: true,
    claimUndisputed: true,
    fullAmountOutstanding: true,
  }
}

const buildPaywiseDebtorPayload = (submission, reference) => {
  const debtor = submission.debtor
  const identity = debtor.identityType === 'organization'
    ? { organization: { name: debtor.organizationName } }
    : {
      person: {
        first_name: debtor.firstName,
        last_name: debtor.lastName,
        ...(debtor.salutation ? { salutation: debtor.salutation } : {}),
      },
    }

  return {
    your_reference: reference,
    acting_as: debtor.actingAs,
    ...identity,
    addresses: [{
      street: debtor.street,
      postal_code: debtor.postalCode,
      city: debtor.city,
      country: debtor.country,
      primary: true,
    }],
  }
}

const buildPaywiseOrderPayload = ({ debtorId, invoice, submission, amount }) => ({
  debtor_id: debtorId,
  additional_debtor_ids: [],
  starting_approach: 'extrajudicial',
  creditor_obligation_fulfilled: submission.creditorObligationFulfilled,
  claims: [{
    type: 'receivable',
    your_reference: `ZYRO-${String(invoice.id).slice(0, 180)}`,
    document_reference: String(invoice.number),
    subject_matter: String(invoice.items?.map((item) => item.description || item.productName || item.customName || '').filter(Boolean).join(', ')
      || invoice.description
      || `Rechnung ${invoice.number}`).slice(0, 500),
    principal_amount: { value: amount.toFixed(2), currency: 'EUR' },
    document_date: submission.documentDate,
    due_date: submission.dueDate,
    delay_date: submission.delayDate,
    is_disputed: !submission.claimUndisputed,
    items: [],
    additional_charges: [],
    reminders: [],
    documents: [],
    legal_basis: {
      claim_type_code: submission.claimTypeCode,
      description: submission.legalDescription,
    },
  }],
})

const calculateInvoicePayableTotal = (invoice, products = []) => {
  const items = Array.isArray(invoice?.items) ? invoice.items : []
  const netTotal = Number.isFinite(Number(invoice?.websiteInvoiceTotals?.netTotal))
    ? Number(invoice.websiteInvoiceTotals.netTotal)
    : items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0)
  const taxTotal = Number.isFinite(Number(invoice?.websiteInvoiceTotals?.taxTotal))
    ? Number(invoice.websiteInvoiceTotals.taxTotal)
    : netTotal * Number(invoice?.vatRate || 0) / 100
  const grossTotal = Number.isFinite(Number(invoice?.websiteInvoiceTotals?.grossTotal))
    ? Number(invoice.websiteInvoiceTotals.grossTotal)
    : netTotal + taxTotal
  const depositTotal = items.reduce((sum, item) => {
    const product = products.find((entry) => String(entry.id) === String(item.productId))
      || products.find((entry) => item.productSku && entry.sku === item.productSku)
    return sum + Number(item.quantity || 0) * Number(product?.depositPerUnit || 0)
  }, 0)
  const total = Math.round((grossTotal + depositTotal + Number.EPSILON) * 100) / 100
  if (!Number.isFinite(total) || total <= 0) throw new Error('Der offene Rechnungsbetrag ist ungültig.')
  return total
}

// Webhook-Signatur: X-Paywise-Signature: sha256=<hex HMAC-SHA256 des Roh-Bodys>
const verifyPaywiseWebhookSignature = (rawBody, signatureHeader, secret) => {
  const header = String(signatureHeader || '')
  const key = String(secret || '').trim()
  if (!key || !header.startsWith('sha256=') || !Buffer.isBuffer(rawBody)) return false
  const received = header.slice(7).trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(received)) return false
  const expected = require('node:crypto').createHmac('sha256', key).update(rawBody).digest('hex')
  return require('node:crypto').timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}

// Sammelt UUIDs aus den Ereignisdaten, um sie Übergaben (Auftrag/Forderung/Schuldner) zuzuordnen.
const collectPaywiseIds = (value, found = new Set(), depth = 0) => {
  if (found.size >= 30 || depth > 6 || value === null || value === undefined) return found
  if (typeof value === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) found.add(value.toLowerCase())
    return found
  }
  if (Array.isArray(value)) value.slice(0, 50).forEach((entry) => collectPaywiseIds(entry, found, depth + 1))
  else if (typeof value === 'object') Object.values(value).slice(0, 80).forEach((entry) => collectPaywiseIds(entry, found, depth + 1))
  return found
}

const getPaywiseApiBaseUrl = (apiKey) => String(apiKey || '').startsWith('pw_sbx_')
  ? 'https://api-sandbox.paywise.de'
  : 'https://api.paywise.de'

const callPaywiseApi = async (apiKey, path, { method = 'GET', body, idempotencyKey, fetchImpl = fetch } = {}) => {
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  let response
  try {
    response = await fetchImpl(`${getPaywiseApiBaseUrl(apiKey)}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(25000),
    })
  } catch (error) {
    throw new Error(`Paywise ist nicht erreichbar: ${error.message}`)
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = String(result.detail || result.message || result.error || `HTTP ${response.status}`).slice(0, 400)
    const error = new Error(`Paywise (${response.status}): ${message}`)
    error.paywiseCode = String(result.code || '')
    error.paywiseStatus = response.status
    throw error
  }
  return result
}


// Rechnungs-PDF als Beleg an die Paywise-Forderung anhängen (POST /v2/claims/{id}/documents/).
// Paywise erlaubt PDF/JPEG/PNG bis 10 MiB, PDFs mit höchstens 100 Seiten.
const PAYWISE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

const buildPaywiseInvoiceDocumentPayload = (invoiceNumber, pdf) => {
  if (!Buffer.isBuffer(pdf) || pdf.length < 5 || pdf.subarray(0, 4).toString() !== '%PDF') {
    throw new Error('Die Rechnungs-PDF ist ungültig und kann nicht an Paywise übermittelt werden.')
  }
  if (pdf.length > PAYWISE_DOCUMENT_MAX_BYTES) {
    throw new Error('Die Rechnungs-PDF ist größer als 10 MB und kann nicht an Paywise übermittelt werden.')
  }
  const safeNumber = String(invoiceNumber || 'Rechnung').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'Rechnung'
  return {
    type: 'invoice',
    filename: `Rechnung-${safeNumber}.pdf`,
    base64: pdf.toString('base64'),
  }
}

const paywiseDocumentFailureTexts = {
  page_limit_exceeded: 'die PDF hat mehr als 100 Seiten',
  encrypted: 'die PDF ist verschlüsselt',
  corrupt: 'die PDF ist beschädigt',
  unsupported: 'das Dateiformat wird nicht unterstützt',
  processing_failed: 'die Verarbeitung bei Paywise ist fehlgeschlagen',
}

// Paywise prüft Belege asynchron (Virenscan). Erst bei Status „ready“ darf der Auftrag eingereicht werden.
const waitForPaywiseDocument = async (apiKey, claimId, documentId, {
  path = `/v2/claims/${claimId}/documents/${documentId}/`,
  call = callPaywiseApi,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxAttempts = 8,
} = {}) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const document = await call(apiKey, path)
    const status = String(document?.status || '')
    if (status === 'ready') return document
    if (status === 'rejected' || status === 'failed') {
      const reason = paywiseDocumentFailureTexts[document?.failure_reason] || (status === 'rejected' ? 'der Beleg wurde abgelehnt' : 'unbekannter Fehler')
      const error = new Error(`Paywise hat die Rechnungs-PDF nicht angenommen: ${reason}.`)
      error.paywiseDocumentRejected = true
      throw error
    }
    await sleep(Math.min(2 ** attempt, 15) * 1000)
  }
  throw new Error('Paywise prüft die Rechnungs-PDF noch. Bitte in einer Minute erneut auf „An Paywise übergeben“ klicken – es wird kein doppelter Auftrag angelegt.')
}

// ---------------------------------------------------------------------------
// Paywise-Mahnservice (vorgerichtliches Mahnwesen): https://api.paywise.de/mahnservice/v1/
// Gleicher API-Schlüssel wie das Inkasso. Ablauf: Schuldner → Rechnung (held) → PDF → Freigabe.
// ---------------------------------------------------------------------------
const MAHNSERVICE_BASE = '/mahnservice/v1'

const mahnserviceDunningStateLabels = {
  held: 'Angelegt, noch nicht freigegeben',
  pending: 'Freigegeben – wartet auf aktiven Mahnlauf im Paywise-Portal',
  active: 'Mahnlauf aktiv',
  paused: 'Mahnlauf pausiert',
  completed: 'Mahnstufen abgeschlossen',
  paid: 'Bezahlt',
  cancelled: 'Storniert',
  written_off: 'Ausgebucht',
  inkasso: 'An Paywise-Inkasso übergeben',
}

const normalizeMahnserviceDebtor = (input = {}) => {
  const type = input.type === 'person' ? 'person' : input.type === 'company' ? 'company' : ''
  if (!type) throw new Error('Bitte auswählen, ob der Kunde ein Unternehmen oder eine Privatperson ist.')
  const email = optionalText(input.email, 254).toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Die E-Mail-Adresse des Kunden ist ungültig.')
  const country = (optionalText(input.country, 2) || 'DE').toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) throw new Error('Bitte den zweistelligen ISO-Ländercode eingeben.')
  const postalCode = requiredText(input.postalCode, 'Postleitzahl', 20)
  if (country === 'DE' && !/^\d{5}$/.test(postalCode)) throw new Error('Für Deutschland muss die Postleitzahl aus fünf Ziffern bestehen.')
  if (!email) throw new Error('Für den Mahnservice wird die E-Mail-Adresse des Kunden benötigt.')
  return {
    name: requiredText(input.name, 'Kundenname', 255),
    type,
    email,
    street: requiredText(input.street, 'Straße', 255),
    postalCode,
    city: requiredText(input.city, 'Ort', 100),
    country,
  }
}

const buildMahnserviceDebtorPayload = (debtor, customerNumber) => ({
  name: debtor.name,
  type: debtor.type,
  email: debtor.email,
  ...(customerNumber ? { customer_number: String(customerNumber).slice(0, 50) } : {}),
  address: {
    street: debtor.street,
    zip_code: debtor.postalCode,
    city: debtor.city,
    country: debtor.country,
  },
})

const buildMahnserviceInvoicePayload = ({ invoice, amount, debtorId }) => {
  if (!isIsoDate(invoice.dueDate)) throw new Error('Die Rechnung hat kein gültiges Fälligkeitsdatum.')
  const documentDate = isIsoDate(invoice.documentDate) && invoice.documentDate <= invoice.dueDate ? invoice.documentDate : null
  return {
    invoice_number: requiredText(invoice.number, 'Rechnungsnummer', 100),
    amount: amount.toFixed(2),
    currency: 'EUR',
    due_date: invoice.dueDate,
    ...(documentDate ? { document_date: documentDate } : {}),
    your_reference: `ZYRO-${String(invoice.id).slice(0, 240)}`,
    debtor: debtorId,
  }
}

// PDF-Upload als multipart/form-data (Feld „file“), wie in der Mahnservice-Doku beschrieben.
const uploadPaywisePdf = async (apiKey, path, pdf, filename, { fetchImpl = fetch } = {}) => {
  buildPaywiseInvoiceDocumentPayload(filename, pdf)
  const form = new FormData()
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), filename)
  let response
  try {
    response = await fetchImpl(`${getPaywiseApiBaseUrl(apiKey)}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(45000),
    })
  } catch (error) {
    throw new Error(`Paywise ist nicht erreichbar: ${error.message}`)
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = String(result.detail || result.message || result.code || `HTTP ${response.status}`).slice(0, 400)
    throw new Error(`Paywise (${response.status}): ${message}`)
  }
  return result
}

module.exports = {
  buildMahnserviceDebtorPayload,
  buildMahnserviceInvoicePayload,
  mahnserviceDunningStateLabels,
  MAHNSERVICE_BASE,
  normalizeMahnserviceDebtor,
  uploadPaywisePdf,
  buildPaywiseInvoiceDocumentPayload,
  waitForPaywiseDocument,
  buildPaywiseDebtorPayload,
  buildPaywiseOrderPayload,
  calculateInvoicePayableTotal,
  callPaywiseApi,
  claimTypeCodes,
  getPaywiseApiBaseUrl,
  normalizePaywiseSubmission,
  verifyPaywiseWebhookSignature,
  collectPaywiseIds,
}
