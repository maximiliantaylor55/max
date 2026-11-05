const cleanBusinessPrices = (products, input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Geschäftskunden-Verkaufspreise ungültig.')
  }
  const productIds = new Set(products.map((product) => product.id))
  const entries = Object.entries(input)
  if (entries.length > productIds.size) throw new Error('Geschäftskunden-Verkaufspreise ungültig.')
  return Object.fromEntries(entries.map(([productId, value]) => {
    const priceCents = Number(value)
    if (!productIds.has(productId) || !Number.isSafeInteger(priceCents) || priceCents < 1 || priceCents > 100_000_000) {
      throw new Error('Bitte gültige Geschäftskunden-Verkaufspreise eingeben.')
    }
    return [productId, priceCents]
  }))
}

const getCatalogBusinessPrices = (products, input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Geschäftskunden-Verkaufspreise ungültig.')
  }
  const productIds = new Set(products.map((product) => product.id))
  const applicablePrices = Object.fromEntries(Object.entries(input).filter(([productId]) => productIds.has(productId)))
  return cleanBusinessPrices(products, applicablePrices)
}

const applyBusinessPricing = (products, businessPrices = {}) => products.map((product) => ({
  ...product,
  cratePriceCents: businessPrices[product.id] ?? product.cratePriceCents,
  tiers: [],
}))

const normalizeBusinessTrayItems = (items) => {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    throw new Error('Bitte gültige Geschäftskunden-Traymengen eingeben.')
  }
  return items.map((item) => {
    const trays = item?.trays
    if (typeof item?.productId !== 'string' || !Number.isSafeInteger(trays) || trays < 1 || trays > 416) {
      throw new Error('Geschäftskunden bestellen bitte ganze 24er-Trays (maximal 416 je Artikel).')
    }
    return { productId: item.productId, quantity: trays * 24, trayCount: trays }
  })
}

module.exports = { applyBusinessPricing, cleanBusinessPrices, getCatalogBusinessPrices, normalizeBusinessTrayItems }
