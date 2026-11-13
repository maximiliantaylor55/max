// DPD Deutschland Web Connect (SOAP): Login + Versandlabel erzeugen.
// Doku: LoginService V2.0, ShipmentService V4.4 (public-ws.dpd.com).

const DPD_ENDPOINTS = {
  live: 'https://public-ws.dpd.com/services',
  stage: 'https://public-ws-stage.dpd.com/services',
}
const DPD_PRODUCTS = { CL: 'DPD Classic', B2C: 'DPD Home (Privatkunde)', PL: 'DPD ParcelLetter' }

const COUNTRY_CODES = {
  deutschland: 'DE', germany: 'DE', de: 'DE',
  österreich: 'AT', oesterreich: 'AT', austria: 'AT', at: 'AT',
  schweiz: 'CH', switzerland: 'CH', ch: 'CH',
  niederlande: 'NL', netherlands: 'NL', nl: 'NL',
  belgien: 'BE', belgium: 'BE', be: 'BE',
  luxemburg: 'LU', luxembourg: 'LU', lu: 'LU',
  frankreich: 'FR', france: 'FR', fr: 'FR',
  dänemark: 'DK', daenemark: 'DK', denmark: 'DK', dk: 'DK',
  polen: 'PL', poland: 'PL', pl: 'PL',
  tschechien: 'CZ', czechia: 'CZ', cz: 'CZ',
  italien: 'IT', italy: 'IT', it: 'IT',
}

const dpdError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode })

const xmlEscape = (value) => String(value ?? '').replace(/[<>&'"]/g, (character) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
})[character])

const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

const xmlValue = (xml, tag) => {
  const match = String(xml).match(new RegExp(`<(?:[A-Za-z0-9_]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${tag}>`))
  return match ? match[1].trim() : ''
}
const xmlValues = (xml, tag) => [...String(xml).matchAll(new RegExp(`<(?:[A-Za-z0-9_]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${tag}>`, 'g'))]
  .map((match) => match[1].trim())

const countryCode = (value) => {
  const key = String(value || '').trim().toLowerCase()
  if (!key) return 'DE'
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase()
  return COUNTRY_CODES[key] || ''
}

const splitStreet = (line) => {
  const text = clip(line, 120)
  const match = text.match(/^(.*?[^\d\s])\s*,?\s+(\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?)$/)
  if (match) return { street: clip(match[1], 50), houseNo: clip(match[2].replace(/\s+/g, ''), 8) }
  const glued = text.match(/^(.*?[^\d\s])(\d+[a-zA-Z]?)$/)
  if (glued) return { street: clip(glued[1], 50), houseNo: clip(glued[2], 8) }
  return { street: clip(text, 50), houseNo: '' }
}

// "Firma\nMax Muster\nMusterstr. 5\n12345 Musterstadt\nDeutschland" → DPD-Adresse
const parseShippingAddress = ({ recipient = '', address = '', email = '', phone = '' }) => {
  const lines = String(address || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const zipIndex = lines.findLastIndex((line) => /^(?:[A-Z]{1,2}[-\s])?\d{4,5}\s+\S/.test(line))
  if (zipIndex < 1) {
    throw dpdError('Die Lieferadresse konnte nicht gelesen werden. Bitte im Format „Straße Nr.“ und darunter „PLZ Ort“ eintragen.')
  }
  const zipMatch = lines[zipIndex].match(/^(?:([A-Z]{1,2})[-\s])?(\d{4,5})\s+(.+)$/)
  const country = countryCode(lines[zipIndex + 1] || zipMatch[1] || 'DE')
  if (!country) throw dpdError(`Das Land „${lines[zipIndex + 1]}“ wird für DPD-Labels nicht erkannt. Bitte den Ländercode (z. B. AT) eintragen.`)
  const { street, houseNo } = splitStreet(lines[zipIndex - 1])
  if (!street) throw dpdError('In der Lieferadresse fehlt die Straße.')
  const nameLines = lines.slice(0, zipIndex - 1)
  const name1 = clip(recipient || nameLines[0], 50)
  const name2 = clip(nameLines.find((line) => clip(line, 50) !== name1) || '', 50)
  if (!name1) throw dpdError('Bitte den Empfänger eintragen.')
  return {
    name1,
    ...(name2 ? { name2 } : {}),
    street,
    ...(houseNo ? { houseNo } : {}),
    country,
    zipCode: clip(zipMatch[2], 9),
    city: clip(zipMatch[3], 50),
    ...(email ? { email: clip(email, 100) } : {}),
    ...(phone ? { phone: clip(phone, 30) } : {}),
  }
}

const senderFromCompany = (company = {}, customerNumber = '') => {
  const { street, houseNo } = splitStreet(company.street || '')
  const zip = String(company.postalCode || '').trim()
  if (!street || !zip || !company.city) throw dpdError('Bitte zuerst die Firmenanschrift (Straße, PLZ, Ort) in den Firmendaten pflegen.')
  return {
    name1: clip(company.name || 'Liberty Street Food GmbH', 50),
    street,
    ...(houseNo ? { houseNo } : {}),
    country: countryCode(company.country) || 'DE',
    zipCode: clip(zip, 9),
    city: clip(company.city, 50),
    ...(customerNumber ? { customerNumber: clip(customerNumber, 17) } : {}),
    ...(company.email ? { email: clip(company.email, 100) } : {}),
    ...(company.phone ? { phone: clip(company.phone, 30) } : {}),
  }
}

const addressXml = (tag, address) => `<${tag}>${Object.entries(address)
  .map(([key, value]) => `<${key}>${xmlEscape(value)}</${key}>`).join('')}</${tag}>`

const buildLoginXml = ({ username, password }) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://dpd.com/common/service/types/LoginService/2.0">
<soapenv:Header/>
<soapenv:Body>
<ns:getAuth><delisId>${xmlEscape(username)}</delisId><password>${xmlEscape(password)}</password><messageLanguage>de_DE</messageLanguage></ns:getAuth>
</soapenv:Body>
</soapenv:Envelope>`

const parseLoginResponse = (xml) => {
  const fault = xmlValue(xml, 'faultstring') || xmlValue(xml, 'message')
  const authToken = xmlValue(xml, 'authToken')
  if (!authToken) throw dpdError(`DPD-Anmeldung fehlgeschlagen${fault ? `: ${fault}` : '. Bitte Webservice-Kennung und Passwort prüfen.'}`, 502)
  return { authToken, depot: xmlValue(xml, 'depot'), delisId: xmlValue(xml, 'delisId') }
}

const buildStoreOrdersXml = ({ username, authToken, depot, sender, recipient, weightKg, product = 'CL', reference = '' }) => {
  const weight = Math.max(1, Math.round(Number(weightKg) * 100))
  const productCode = DPD_PRODUCTS[product] ? product : 'CL'
  const ref = clip(reference, 35)
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://dpd.com/common/service/types/Authentication/2.0" xmlns:ns1="http://dpd.com/common/service/types/ShipmentService/4.4">
<soapenv:Header>
<ns:authentication><delisId>${xmlEscape(username)}</delisId><authToken>${xmlEscape(authToken)}</authToken><messageLanguage>de_DE</messageLanguage></ns:authentication>
</soapenv:Header>
<soapenv:Body>
<ns1:storeOrders>
<printOptions><printOption><outputFormat>PDF</outputFormat><paperFormat>A6</paperFormat></printOption></printOptions>
<order>
<generalShipmentData>
${ref ? `<mpsCustomerReferenceNumber1>${xmlEscape(ref)}</mpsCustomerReferenceNumber1>` : ''}
<sendingDepot>${xmlEscape(String(depot || '').padStart(4, '0'))}</sendingDepot>
<product>${productCode}</product>
${addressXml('sender', sender)}
${addressXml('recipient', recipient)}
</generalShipmentData>
<parcels>${ref ? `<customerReferenceNumber1>${xmlEscape(ref)}</customerReferenceNumber1>` : ''}<weight>${weight}</weight></parcels>
<productAndServiceData><orderType>consignment</orderType>${productCode === 'B2C' && recipient.email ? `<predict><channel>1</channel><value>${xmlEscape(recipient.email)}</value><language>DE</language></predict>` : ''}</productAndServiceData>
</order>
</ns1:storeOrders>
</soapenv:Body>
</soapenv:Envelope>`
}

const parseStoreOrdersResponse = (xml) => {
  const faults = [...xmlValues(xml, 'message'), xmlValue(xml, 'faultstring')].filter(Boolean)
  const parcelLabelNumber = xmlValue(xml, 'parcelLabelNumber')
  const labelBase64 = xmlValue(xml, 'content') || xmlValue(xml, 'parcellabelsPDF')
  if (!parcelLabelNumber || !labelBase64) {
    throw dpdError(`DPD hat kein Label erstellt${faults.length ? `: ${[...new Set(faults)].join(' · ')}` : '.'}`, 502)
  }
  const pdf = Buffer.from(labelBase64.replace(/\s+/g, ''), 'base64')
  if (pdf.subarray(0, 4).toString('latin1') !== '%PDF') throw dpdError('DPD hat kein gültiges PDF-Label geliefert.', 502)
  return { parcelLabelNumber, labelPdfBase64: pdf.toString('base64'), mpsId: xmlValue(xml, 'mpsId') }
}

const soapRequest = async (url, body, fetchImpl = fetch) => {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
    body,
    signal: AbortSignal.timeout(30000),
  })
  const text = await response.text()
  if (!response.ok && !/<(?:\w+:)?Envelope/.test(text)) throw dpdError(`DPD-Webservice nicht erreichbar (${response.status}).`, 502)
  return text
}

let cachedAuth = null
const loginDpd = async (credentials, { environment = 'live', fetchImpl } = {}) => {
  const key = `${environment}:${credentials.username}`
  if (cachedAuth?.key === key && cachedAuth.expiresAt > Date.now()) return cachedAuth
  const xml = await soapRequest(`${DPD_ENDPOINTS[environment]}/LoginService/V2_0/`, buildLoginXml(credentials), fetchImpl)
  const auth = parseLoginResponse(xml)
  cachedAuth = { ...auth, key, expiresAt: Date.now() + 20 * 60 * 60 * 1000 }
  return cachedAuth
}

const createDpdLabel = async ({ credentials, company, recipient, weightKg, product, reference, environment = 'live', fetchImpl }) => {
  if (!credentials?.username || !credentials?.password) throw dpdError('Bitte zuerst den DPD-Webservice unter „Versand & Tracking“ einrichten.')
  const weight = Number(weightKg)
  if (!Number.isFinite(weight) || weight <= 0 || weight > 31.5) throw dpdError('Bitte ein Paketgewicht zwischen 0,01 und 31,5 kg angeben.')
  const auth = await loginDpd(credentials, { environment, fetchImpl })
  const sender = senderFromCompany(company, credentials.customerNumber)
  const body = buildStoreOrdersXml({
    username: credentials.username,
    authToken: auth.authToken,
    depot: auth.depot || credentials.depotNumber,
    sender,
    recipient,
    weightKg: weight,
    product,
    reference,
  })
  const xml = await soapRequest(`${DPD_ENDPOINTS[environment]}/ShipmentService/V4_4/`, body, fetchImpl)
  if (/authentication/i.test(xmlValue(xml, 'faultCodeType') || '') || /LOGIN_|authToken/i.test(xmlValue(xml, 'faultstring'))) {
    cachedAuth = null
  }
  return parseStoreOrdersResponse(xml)
}

const buildTrackingXml = ({ username, authToken, parcelLabelNumber }) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://dpd.com/common/service/types/Authentication/2.0" xmlns:ns1="http://dpd.com/common/service/types/ParcelLifeCycleService/2.0">
<soapenv:Header>
<ns:authentication><delisId>${xmlEscape(username)}</delisId><authToken>${xmlEscape(authToken)}</authToken><messageLanguage>de_DE</messageLanguage></ns:authentication>
</soapenv:Header>
<soapenv:Body><ns1:getTrackingData><parcelLabelNumber>${xmlEscape(parcelLabelNumber)}</parcelLabelNumber></ns1:getTrackingData></soapenv:Body>
</soapenv:Envelope>`

const DELIVERED_STATUSES = new Set(['DELIVERED', 'DELIVERED_SHOP', 'DELIVERED_PARCELSHOP', 'PICKED_UP_BY_CONSIGNEE'])

// Liest den Paketstatus: offizieller ParcelLifeCycleService (mit Zugang), sonst die öffentliche DPD-Sendungsverfolgung.
const parseTrackingXml = (xml) => {
  const infos = xmlValues(xml, 'statusInfo').map((block) => ({
    status: xmlValue(block, 'status'),
    label: xmlValue(xmlValue(block, 'label'), 'content') || xmlValue(block, 'label'),
    reached: /true/i.test(xmlValue(block, 'isReached') || xmlValue(block, 'statusHasBeenReached')),
    current: /true/i.test(xmlValue(block, 'isCurrentStatus')),
    date: xmlValue(xmlValue(block, 'date'), 'content'),
    location: xmlValue(xmlValue(block, 'location'), 'content'),
  }))
  return infos
}

const parseTrackingJson = (data) => {
  const infos = data?.parcellifecycleResponse?.parcelLifeCycleData?.statusInfo
  return (Array.isArray(infos) ? infos : []).map((info) => ({
    status: String(info.status || ''),
    label: String(info.label || ''),
    reached: info.statusHasBeenReached === true,
    current: info.isCurrentStatus === true,
    date: String(info.date || ''),
    location: String(info.location || ''),
  }))
}

const summarizeTracking = (infos) => {
  if (!infos.length) return null
  const current = infos.find((info) => info.current) || [...infos].reverse().find((info) => info.reached) || infos[0]
  const delivered = infos.some((info) => DELIVERED_STATUSES.has(String(info.status).toUpperCase()) && (info.reached || info.current))
  return {
    delivered,
    status: current.status,
    description: current.label,
    location: current.location,
    timestamp: current.date,
    // Alle bereits erreichten Stationen, neueste zuerst – für die Anzeige im Kundenkonto.
    events: infos
      .filter((info) => info.reached || info.current)
      .map((info) => ({ status: info.status, description: info.label, location: info.location, timestamp: info.date }))
      .reverse()
      .slice(0, 20),
  }
}

const trackDpdParcel = async ({ parcelLabelNumber, credentials = null, environment = 'live', fetchImpl = fetch }) => {
  const number = String(parcelLabelNumber || '').replace(/\s+/g, '')
  if (!/^[0-9A-Za-z]{8,28}$/.test(number)) return null
  if (credentials?.username && credentials?.password) {
    try {
      const auth = await loginDpd(credentials, { environment, fetchImpl })
      const xml = await soapRequest(`${DPD_ENDPOINTS[environment]}/ParcelLifeCycleService/V2_0/`, buildTrackingXml({ username: credentials.username, authToken: auth.authToken, parcelLabelNumber: number }), fetchImpl)
      const infos = parseTrackingXml(xml)
      const summary = summarizeTracking(infos)
      if (summary) return summary
      const fault = xmlValue(xml, 'faultstring') || xmlValue(xml, 'errorMessage') || xmlValue(xml, 'message')
      if (/LOGIN_|authToken|authentication/i.test(fault)) cachedAuth = null
      console.warn('DPD-Tracking: Webservice ohne Statusdaten', { parcel: number.slice(-4), fault: String(fault).slice(0, 300), statusInfos: infos.length, length: String(xml).length })
    } catch (error) {
      cachedAuth = null
      console.warn('DPD-Tracking: Webservice-Abfrage fehlgeschlagen', { parcel: number.slice(-4), error: String(error?.message || error).slice(0, 300) })
    }
  } else {
    console.warn('DPD-Tracking: keine DPD-Zugangsdaten hinterlegt – nur öffentliche Abfrage möglich')
  }
  try {
    const response = await fetchImpl(`https://tracking.dpd.de/rest/plc/de_DE/${encodeURIComponent(number)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      console.warn('DPD-Tracking: öffentliche Abfrage abgelehnt', { status: response.status })
      return null
    }
    const summary = summarizeTracking(parseTrackingJson(await response.json().catch(() => null)))
    if (!summary) console.warn('DPD-Tracking: öffentliche Abfrage ohne Statusdaten')
    return summary
  } catch (error) {
    console.warn('DPD-Tracking: öffentliche Abfrage fehlgeschlagen', String(error?.message || error).slice(0, 200))
    return null
  }
}

module.exports = {
  DPD_PRODUCTS,
  trackDpdParcel,
  buildLoginXml,
  buildStoreOrdersXml,
  createDpdLabel,
  parseLoginResponse,
  parseShippingAddress,
  parseStoreOrdersResponse,
  senderFromCompany,
  splitStreet,
}
