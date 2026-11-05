const packBusinessDpdTrays = (trayWeights, parcelCount) => {
  const parcelWeights = Array(parcelCount).fill(0)
  const parcelTrayCounts = Array(parcelCount).fill(0)
  const sortedWeights = [...trayWeights].sort((a, b) => b - a)

  const placeTray = (trayIndex) => {
    if (trayIndex === sortedWeights.length) return true
    const trayWeight = sortedWeights[trayIndex]
    const seenParcels = new Set()
    for (let parcelIndex = 0; parcelIndex < parcelCount; parcelIndex += 1) {
      const currentWeight = parcelWeights[parcelIndex]
      const currentTrayCount = parcelTrayCounts[parcelIndex]
      const parcelKey = `${currentWeight}:${currentTrayCount}`
      if (seenParcels.has(parcelKey) || currentTrayCount >= 2 || currentWeight + trayWeight > 31500) continue
      seenParcels.add(parcelKey)
      parcelWeights[parcelIndex] += trayWeight
      parcelTrayCounts[parcelIndex] += 1
      if (placeTray(trayIndex + 1)) return true
      parcelWeights[parcelIndex] -= trayWeight
      parcelTrayCounts[parcelIndex] -= 1
    }
    return false
  }

  return placeTray(0) ? parcelWeights : null
}

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
  let shippingParcelCount = 0
  let shippingMethod = 'DPD Paket (bis 31,5 kg)'
  if (businessCustomer) {
    const trayCount = items.reduce((total, item) => total + Math.ceil(item.quantity / 24), 0)
    const businessDpdMaxTrays = Number(settings.businessDpdMaxTrays ?? 6)
    if (!Number.isSafeInteger(businessDpdMaxTrays) || businessDpdMaxTrays < 1 || businessDpdMaxTrays > 6) {
      throw new Error('DPD-Traygrenze ist im Shop-Admin nicht korrekt eingerichtet.')
    }
    const trayWeights = items.flatMap((item) => {
      const product = catalog.get(item.productId)
      const trayWeightGrams = Number(product.unitWeightGrams) * 24 + largeCartonTareGrams
      return Array.from({ length: item.largeCartonCount }, () => trayWeightGrams)
    })
    const parcelCount = Math.ceil(trayCount / 2)
    const parcelWeights = trayCount <= businessDpdMaxTrays && trayWeights.length === trayCount
      ? packBusinessDpdTrays(trayWeights, parcelCount)
      : null
    if (parcelWeights) {
      const dpdTiers = Array.isArray(settings.businessDpdShippingTiers) && settings.businessDpdShippingTiers.length
        ? settings.businessDpdShippingTiers
        : settings.shippingTiers
      if (!Array.isArray(dpdTiers) || dpdTiers.length === 0) {
        throw new Error('DPD-Versandpreise sind im Shop-Admin nicht korrekt eingerichtet.')
      }
      shippingPriceCents = parcelWeights.reduce((total, parcelWeightGrams) => {
        const tier = dpdTiers.find((entry) => parcelWeightGrams <= entry.maxWeightGrams)
        if (!tier) throw new Error('Für das Paketgewicht ist kein gültiger DPD-Tarif eingerichtet.')
        return total + Number(tier.priceCents)
      }, 0)
      shippingParcelCount = parcelWeights.length
      const parcelLabel = shippingParcelCount === 1 ? 'Paket' : 'Pakete'
      shippingMethod = `DPD Paket (${shippingParcelCount} ${parcelLabel} bis 31,5 kg je Paket)`
    } else {
      const shippingPricePerPalletCents = Number(settings.shippingPricePerPalletCents)
      const shippingTraysPerPallet = Number(settings.shippingTraysPerPallet)
      if (!Number.isSafeInteger(shippingPricePerPalletCents) || shippingPricePerPalletCents < 0
        || !Number.isSafeInteger(shippingTraysPerPallet) || shippingTraysPerPallet < 1) {
        throw new Error('Speditionskosten sind im Shop-Admin nicht korrekt eingerichtet.')
      }
      shippingPalletCount = Math.max(1, Math.ceil(trayCount / shippingTraysPerPallet))
      shippingPriceCents = shippingPricePerPalletCents * shippingPalletCount
      shippingMethod = 'Spedition'
    }
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
    shippingParcelCount,
    shippingMethod,
  }
}

module.exports = { calculateShipping }