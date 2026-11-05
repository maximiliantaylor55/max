const crypto = require('node:crypto')
const { normalizeEmailAddress } = require('./email-address.cjs')

const mdeError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode })

const acceptMdeOrder = ({ document, actor }) => {
  if (!document || document.kind !== 'kundenauftrag') throw mdeError('Kundenauftrag wurde in der Cloud nicht gefunden.', 404)
  if (document.status === 'Verpackt' || document.status === 'Versendet') throw mdeError('Dieser Auftrag wurde bereits verpackt.', 409)
  if (document.status === 'Storniert') throw mdeError('Ein stornierter Auftrag kann nicht angenommen werden.', 409)
  if (document.status === 'Kommissionierung') {
    if (String(document.pickingUserId) !== String(actor.id)) throw mdeError(`Der Auftrag wird bereits von ${document.pickingUserName || 'einem anderen Mitarbeiter'} kommissioniert.`, 409)
    return document
  }
  if (!['Offen', 'Bestätigt', 'In Produktion'].includes(document.status)) {
    throw mdeError('Dieser Auftragsstatus kann nicht am MDE angenommen werden.', 409)
  }
  document.status = 'Kommissionierung'
  document.pickingUserId = String(actor.id)
  document.pickingUserName = actor.name || actor.username || 'Zyro-Benutzer'
  document.pickingAcceptedAt = new Date().toISOString()
  document.mdeScannedQuantities = {}
  return document
}

const recordMdeScan = ({ document, products, barcode, actor }) => {
  if (!document || document.kind !== 'kundenauftrag') throw mdeError('Kundenauftrag wurde in der Cloud nicht gefunden.', 404)
  if (document.status !== 'Kommissionierung' || String(document.pickingUserId) !== String(actor.id)) {
    throw mdeError('Nimm den Auftrag zuerst an. Nur der zuständige Mitarbeiter kann Artikel scannen.', 409)
  }
  const code = String(barcode || '').trim().toLocaleLowerCase()
  if (!code || code.length > 200) throw mdeError('Produktbarcode ungültig.')
  const matchingProducts = products.filter((product) =>
    [product.sku, product.ean13, product.bottleLabel?.ean13].some((value) => String(value || '').trim().toLocaleLowerCase() === code),
  )
  if (matchingProducts.length > 1) throw mdeError('Der Barcode ist mehreren Produkten zugeordnet.', 409)
  if (matchingProducts.length === 0) throw mdeError(`Kein Produkt mit Barcode „${barcode}“ gefunden.`, 404)
  const product = matchingProducts[0]
  const requiredQuantity = (Array.isArray(document.items) ? document.items : [{
    productId: document.productId,
    quantity: document.quantity || 1,
  }])
    .filter((item) => String(item?.productId ?? '') === String(product.id))
    .reduce((total, item) => total + Number(item.quantity || 0), 0)
  if (!Number.isSafeInteger(requiredQuantity) || requiredQuantity < 1) {
    throw mdeError(`${product.name || 'Dieses Produkt'} gehört nicht zu diesem Auftrag.`, 409)
  }
  const scannedQuantities = document.mdeScannedQuantities && typeof document.mdeScannedQuantities === 'object'
    ? document.mdeScannedQuantities
    : {}
  const scannedQuantity = Number(scannedQuantities[String(product.id)] || 0)
  if (scannedQuantity >= requiredQuantity) throw mdeError(`Die bestellte Menge für ${product.name || 'dieses Produkt'} ist bereits vollständig gescannt.`, 409)
  document.mdeScannedQuantities = {
    ...scannedQuantities,
    [String(product.id)]: scannedQuantity + 1,
  }
  document.pickingLastScannedAt = new Date().toISOString()
  return { document, product, scannedQuantity: scannedQuantity + 1, requiredQuantity }
}

const validateShipment = ({ document, carrier, carrierName, trackingNumber, trackingUrl }) => {
  if (!document || document.kind !== 'kundenauftrag') throw mdeError('Kundenauftrag wurde in der Cloud nicht gefunden.', 404)
  if (!['Verpackt', 'Versendet'].includes(document.status)) throw mdeError('Nur verpackte Aufträge können versendet werden.', 409)
  if (!['DPD', 'Spedition'].includes(carrier)) throw mdeError('Bitte DPD oder Spedition als Versanddienst wählen.')
  const normalizedTrackingNumber = String(trackingNumber || '').trim()
  const normalizedCarrierName = String(carrierName || '').trim()
  const normalizedTrackingUrl = String(trackingUrl || '').trim()
  if (!normalizedTrackingNumber || normalizedTrackingNumber.length > 120) throw mdeError('Bitte eine gültige Sendungsnummer eintragen.')
  if (carrier === 'Spedition' && (!normalizedCarrierName || normalizedCarrierName.length > 100)) {
    throw mdeError('Bitte den Namen der Spedition eintragen.')
  }
  if (normalizedTrackingUrl) {
    let parsedUrl
    try {
      parsedUrl = new URL(normalizedTrackingUrl)
    } catch {
      throw mdeError('Die Tracking-Adresse ist ungültig.')
    }
    if (parsedUrl.protocol !== 'https:') throw mdeError('Tracking-Adressen müssen mit https:// beginnen.')
  }
  const shipmentChanged = document.carrier !== carrier
    || document.carrierName !== (carrier === 'DPD' ? 'DPD' : normalizedCarrierName)
    || document.trackingNumber !== normalizedTrackingNumber
    || document.trackingUrl !== normalizedTrackingUrl
  document.carrier = carrier
  document.carrierName = carrier === 'DPD' ? 'DPD' : normalizedCarrierName
  document.trackingNumber = normalizedTrackingNumber
  document.trackingUrl = normalizedTrackingUrl
  document.trackingToken ||= crypto.randomBytes(32).toString('hex')
  document.status = 'Versendet'
  document.shippedAt ||= new Date().toISOString()
  if (shipmentChanged) {
    document.shipmentNotificationStatus = 'pending'
    document.shipmentNotificationError = ''
  }
  return document
}

const getPublicShipment = ({ documents, token }) => {
  const normalizedToken = String(token || '')
  if (!/^[a-f0-9]{64}$/.test(normalizedToken)) return null
  const tokenBuffer = Buffer.from(normalizedToken, 'hex')
  const document = documents.find((entry) => {
    const candidate = String(entry.trackingToken || '')
    if (!/^[a-f0-9]{64}$/.test(candidate)) return false
    return crypto.timingSafeEqual(tokenBuffer, Buffer.from(candidate, 'hex'))
  })
  if (!document || document.kind !== 'kundenauftrag' || document.status !== 'Versendet') return null
  let trackingUrl = ''
  try {
    const parsedTrackingUrl = new URL(String(document.trackingUrl || ''))
    if (parsedTrackingUrl.protocol === 'https:') trackingUrl = parsedTrackingUrl.toString()
  } catch {
    trackingUrl = ''
  }
  return {
    orderNumber: String(document.number || document.id || ''),
    status: document.status,
    carrier: String(document.carrierName || document.carrier || ''),
    trackingNumber: String(document.trackingNumber || ''),
    trackingUrl,
    shippedAt: String(document.shippedAt || ''),
  }
}

const validateMdePacking = ({ document, products, actorId }) => {
  if (!document || document.kind !== 'kundenauftrag') throw mdeError('Kundenauftrag wurde in der Cloud nicht gefunden.', 404)
  if (document.status === 'Verpackt') throw mdeError('Dieser Auftrag wurde bereits verpackt.', 409)
  if (document.status !== 'Kommissionierung' || String(document.pickingUserId) !== String(actorId)) {
    throw mdeError('Nimm den Auftrag zuerst an und scanne alle Artikel am MDE.', 409)
  }
  if (document.status === 'Storniert') throw mdeError('Ein stornierter Auftrag kann nicht verpackt werden.', 409)
  try {
    normalizeEmailAddress(String(document.recipientEmail || ''))
  } catch {
    throw mdeError('Bitte zuerst eine gültige Kunden-E-Mail-Adresse im Auftrag hinterlegen.', 400)
  }

  const requiredQuantities = new Map()
  const items = Array.isArray(document.items) ? document.items : [{
    productId: document.productId,
    productName: document.productName || document.product,
    quantity: document.quantity || 1,
  }]
  for (const item of items) {
    const productId = String(item?.productId || '')
    const quantity = Number(item?.quantity)
    if (!productId || !Number.isSafeInteger(quantity) || quantity < 1) {
      throw mdeError('Der Kundenauftrag enthält eine ungültige Produktmenge.', 409)
    }
    const nextQuantity = (requiredQuantities.get(productId) || 0) + quantity
    if (!Number.isSafeInteger(nextQuantity)) throw mdeError('Die bestellte Gesamtmenge ist ungültig.', 409)
    requiredQuantities.set(productId, nextQuantity)
  }

  const rawScanned = document.mdeScannedQuantities && typeof document.mdeScannedQuantities === 'object'
    ? document.mdeScannedQuantities
    : {}
  const scannedQuantities = new Map(Object.entries(rawScanned).map(([id, quantity]) => [String(id), Number(quantity)]))
  if ([...scannedQuantities.values()].some((quantity) => !Number.isSafeInteger(quantity) || quantity < 0)) {
    throw mdeError('Gescannte Produktmenge ungültig.')
  }
  const mismatch = [...new Set([...requiredQuantities.keys(), ...scannedQuantities.keys()])]
    .find((id) => (requiredQuantities.get(id) || 0) !== (scannedQuantities.get(id) || 0))
  if (mismatch !== undefined) {
    const productName = products.find((entry) => String(entry.id) === mismatch)?.name || `Produkt ${mismatch}`
    throw mdeError(`Die gescannte Menge stimmt nicht exakt mit dem Auftrag überein: ${productName} – gescannt ${scannedQuantities.get(mismatch) || 0} von ${requiredQuantities.get(mismatch) || 0}.`, 409)
  }

  return [...requiredQuantities].map(([productId, quantity]) => {
    const product = products.find((entry) => String(entry.id) === productId)
    if (!product) throw mdeError('Ein Auftragsprodukt wurde in der Cloud nicht gefunden.', 409)
    if (!Number.isSafeInteger(product.availableBottles) || product.availableBottles < quantity) {
      throw mdeError(`Bestand für ${product.name || 'ein Auftragsprodukt'} fehlt oder reicht nicht.`, 409)
    }
    return { product, quantity }
  })
}

module.exports = { acceptMdeOrder, getPublicShipment, recordMdeScan, validateMdePacking, validateShipment }
