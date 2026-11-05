const { calculateShipping } = require('./shipping-calculation.cjs')
const { applyDiscountToItems } = require('./shop-discounts.cjs')

const calculateOrderPricing = (order, catalog, settings, discount = { code: '', amountCents: 0 }, shippingOptions = {}) => {
  const originalSubtotalCents = order.totalPriceCents
  const discountCents = Number(discount.amountCents) || 0
  if (!Number.isSafeInteger(discountCents) || discountCents < 0 || discountCents > originalSubtotalCents) {
    throw new Error('Rabattbetrag ungültig.')
  }
  const discountedItems = applyDiscountToItems(order.items, discountCents)
  const subtotalCents = originalSubtotalCents - discountCents
  const { shippingWeightGrams, shippingBillableWeightKg, shippingPriceCents, shippingPalletCount, shippingMethod } = calculateShipping(order.items, catalog, settings, shippingOptions)
  const beforeTaxCents = subtotalCents + shippingPriceCents
  const vatCents = settings.pricesIncludeVat
    ? beforeTaxCents - Math.round(beforeTaxCents * 100 / (100 + settings.vatRate))
    : Math.round(beforeTaxCents * settings.vatRate / 100)
  const depositCents = Number(order.depositCents) || 0
  // Pfand ist nicht steuerbar und kommt zusätzlich zum Preis.
  const totalPriceCents = (settings.pricesIncludeVat ? beforeTaxCents : beforeTaxCents + vatCents) + depositCents

  return {
    ...order,
    items: discountedItems,
    originalSubtotalCents,
    subtotalCents,
    discountCode: String(discount.code || ''),
    discountCents,
    shippingPriceCents,
    shippingWeightGrams,
    shippingBillableWeightKg,
    shippingPalletCount,
    shippingMethod,
    vatRate: settings.vatRate,
    vatCents,
    totalPriceCents,
    pricesIncludeVat: settings.pricesIncludeVat,
  }
}

module.exports = { calculateOrderPricing }