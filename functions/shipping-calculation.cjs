const calculateShipping = (items, catalog, settings, { businessCustomer = false } = {}) => {
  const largeCartonTareGrams = Number(settings.largeCartonTareGrams)
  const smallCartonTareGrams = Number(settings.smallCartonTareGrams)
  if (!Number.isSafeInteger(largeCartonTareGrams) || largeCartonTareGrams < 0 || !Number.isSafeInteger(smallCartonTareGrams) || smallCartonTareGrams < 0) {
    throw new Error('Kartongewichte sind im Shop-Admin nicht korrekt eingerichtet.')
  }

  const shippingWeightGrams = items.reduce((total, item) => {
    const product = catalog.get(item.productId)
    const unitWeightGrams = Number(product?.unitWeightGrams)
    if (!Number.isSafeInteger(unitWeightGrams) || unitWeightGrams <= 0) {
      throw new Error(`Bitte zuerst das Dosengewicht für „${product?.name || item.productName}“ im Shop-Admin eintragen.`)
    }
    return total + item.quantity * unitWeightGrams
      + item.largeCartonCount * largeCartonTareGrams
      + item.smallCartonCount * smallCartonTareGrams
  }, 0)

  let shippingPriceCents
  let shippingPalletCount = 0
  let shippingMethod = 'DHL Paket (bis 31,5 kg)'
  if (businessCustomer) {
    const shippingPricePerPalletCents = Number(settings.shippingPricePerPalletCents)
    const shippingTraysPerPallet = Number(settings.shippingTraysPerPallet)
    if (!Number.isSafeInteger(shippingPricePerPalletCents) || shippingPricePerPalletCents < 0
      || !Number.isSafeInteger(shippingTraysPerPallet) || shippingTraysPerPallet < 1) {
      throw new Error('Speditionskosten sind im Shop-Admin nicht korrekt eingerichtet.')
    }
    const trayCount = items.reduce((total, item) => total + Math.ceil(item.quantity / 24), 0)
    shippingPalletCount = Math.max(1, Math.ceil(trayCount / shippingTraysPerPallet))
    shippingPriceCents = shippingPricePerPalletCents * shippingPalletCount
    shippingMethod = 'Spedition'
  } else if (Array.isArray(settings.shippingTiers) && settings.shippingTiers.length > 0) {
    const tier = settings.shippingTiers.find((entry) => shippingWeightGrams <= entry.maxWeightGrams)
      || settings.shippingTiers[settings.shippingTiers.length - 1]
    const parcelCount = Math.max(1, Math.ceil(shippingWeightGrams / settings.shippingTiers[settings.shippingTiers.length - 1].maxWeightGrams))
    shippingPriceCents = tier.priceCents * (shippingWeightGrams > tier.maxWeightGrams ? parcelCount : 1)
  } else {
    const basePriceCents = Number(settings.shippingPriceCents)
    const pricePerKgCents = Number(settings.shippingPricePerKgCents)
    if (!Number.isSafeInteger(basePriceCents) || basePriceCents < 0 || !Number.isSafeInteger(pricePerKgCents) || pricePerKgCents < 0) {
      throw new Error('Gewichtsversand ist im Shop-Admin nicht korrekt eingerichtet.')
    }
    shippingPriceCents = basePriceCents + Math.ceil(shippingWeightGrams / 1000) * pricePerKgCents
  }
  if (!Number.isSafeInteger(shippingPriceCents)) throw new Error('Versandkosten sind ungültig.')

  return {
    shippingWeightGrams,
    shippingBillableWeightKg: Math.ceil(shippingWeightGrams / 1000),
    shippingPriceCents,
    shippingPalletCount,
    shippingMethod,
  }
}

module.exports = { calculateShipping }