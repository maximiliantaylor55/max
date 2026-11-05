const { discountedCratePrice } = require('./shop-catalog.cjs')
const { canonicalEmailAddress } = require('./email-address.cjs')

const products = new Map([
  ['pfirsich-maracuja', 'Pfrisch Maracuja'],
])

const cleanText = (value, field, maxLength, required = false) => {
  if (typeof value !== 'string') {
    if (required) throw new Error(`${field} fehlt.`)
    return ''
  }
  const cleaned = value.trim()
  if ((required && !cleaned) || cleaned.length > maxLength) throw new Error(`${field} ist ungültig.`)
  return cleaned
}

const validatePublicOrder = (input, catalog = products, availablePaymentMethods = []) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Bestellanfrage ungültig.')
  if (input.privacyNoticeAcknowledged !== true) throw new Error('Bitte die Datenschutzhinweise zur Kenntnis nehmen.')

  const name = cleanText(input.name, 'Name', 100, true)
  let email
  try {
    email = canonicalEmailAddress(cleanText(input.email, 'E-Mail', 254, true))
  } catch {
    throw new Error('E-Mail-Adresse ungültig.')
  }
  const phone = cleanText(input.phone, 'Telefon', 40)
  let billingEmail = cleanText(input.billingEmail, 'Rechnungs-E-Mail', 254)
  if (billingEmail) {
    try {
      billingEmail = canonicalEmailAddress(billingEmail)
    } catch {
      throw new Error('Rechnungs-E-Mail-Adresse ungültig.')
    }
  }
  const billingAddress = cleanText(input.billingAddress, 'Rechnungsanschrift', 180)
  const billingPostalCode = cleanText(input.billingPostalCode, 'Rechnungs-PLZ', 10)
  const billingCity = cleanText(input.billingCity, 'Rechnungsort', 100)
  if ([billingAddress, billingPostalCode, billingCity].some(Boolean)
    && (!billingAddress || !billingPostalCode || !billingCity)) {
    throw new Error('Bitte die abweichende Rechnungsadresse vollständig ausfüllen.')
  }
  if (billingPostalCode && !/^[A-Za-z0-9 -]{3,10}$/.test(billingPostalCode)) {
    throw new Error('Rechnungs-PLZ ungültig.')
  }
  const vatId = cleanText(input.vatId, 'USt-IdNr.', 20).toUpperCase()
  if (vatId && !/^[A-Z]{2}[A-Z0-9]{6,14}$/.test(vatId)) {
    throw new Error('USt-IdNr. ungültig.')
  }
  const paymentMethod = cleanText(input.paymentMethod, 'Zahlungsart', 20, true)
  if (!['vorkasse', 'paypal', 'stripe'].includes(paymentMethod) || !availablePaymentMethods.includes(paymentMethod)) {
    throw new Error('Diese Zahlungsart ist derzeit nicht verfügbar.')
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > catalog.size) {
    throw new Error('Bitte gültige Produkte auswählen.')
  }

  const seenProducts = new Set()
  const items = input.items.map((item) => {
    const productId = typeof item?.productId === 'string' ? item.productId : ''
    const quantity = Number(item?.quantity)
    const product = catalog.get(productId)
    if (!product || product.active === false || seenProducts.has(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
      throw new Error('Produkt oder Menge ungültig.')
    }
    seenProducts.add(productId)
    const isPreorder = typeof product !== 'string'
      && product.stock === 0
      && product.preorderEnabled === true
    if (typeof product !== 'string' && Number.isSafeInteger(product.stock) && quantity > product.stock && !isPreorder) {
      throw new Error(`Vom Artikel „${product.name}“ sind nur noch ${product.stock} Dosen auf Lager.`)
    }
    const productName = typeof product === 'string' ? product : product.name
    const cratePriceCents = typeof product === 'string' ? null : discountedCratePrice(product.cratePriceCents, product.tiers, quantity)
    if (cratePriceCents !== null && (!Number.isSafeInteger(cratePriceCents) || cratePriceCents < 0)) {
      throw new Error('Produktpreis ungültig.')
    }
    const largeCartonCount = Math.floor(quantity / 24)
    const smallCartonCount = quantity % 24
    const lineTotalCents = cratePriceCents === null
      ? null
      : largeCartonCount * cratePriceCents + Math.round(smallCartonCount * cratePriceCents / 24)
    if (lineTotalCents !== null && !Number.isSafeInteger(lineTotalCents)) throw new Error('Gesamtpreis ungültig.')
    return {
      productId,
      productName,
      quantity,
      isPreorder,
      ...(isPreorder && product.expectedDeliveryDate ? { expectedDeliveryDate: product.expectedDeliveryDate } : {}),
      depositCents: typeof product === 'string' ? 0 : (Number(product.depositCents) || 0) * quantity,
      crateCount: largeCartonCount,
      largeCartonCount,
      smallCartonCount,
      ...(cratePriceCents === null ? {} : { cratePriceCents, lineTotalCents }),
    }
  })

  const totalPriceCents = items.every((item) => Number.isSafeInteger(item.lineTotalCents))
    ? items.reduce((sum, item) => sum + item.lineTotalCents, 0)
    : null

  return {
    company: cleanText(input.company, 'Unternehmen', 120),
    name,
    email,
    phone,
    address: cleanText(input.address, 'Lieferanschrift', 180, true),
    postalCode: cleanText(input.postalCode, 'PLZ', 10, true),
    city: cleanText(input.city, 'Ort', 100, true),
    billingEmail,
    billingCompany: cleanText(input.billingCompany, 'Rechnungsfirma', 120),
    billingAddress,
    billingPostalCode,
    billingCity,
    vatId,
    note: cleanText(input.note, 'Nachricht', 1000),
    privacyNoticeAcknowledged: true,
    privacyPolicyVersion: '2026-10',
    paymentMethod,
    items,
    hasPreorderItems: items.some((item) => item.isPreorder),
    bottleCount: items.reduce((sum, item) => sum + item.quantity, 0),
    crateCount: items.reduce((sum, item) => sum + item.largeCartonCount, 0),
    largeCartonCount: items.reduce((sum, item) => sum + item.largeCartonCount, 0),
    smallCartonCount: items.reduce((sum, item) => sum + item.smallCartonCount, 0),
    depositCents: items.reduce((sum, item) => sum + item.depositCents, 0),
    ...(totalPriceCents === null ? {} : { totalPriceCents }),
  }
}

module.exports = { validatePublicOrder }