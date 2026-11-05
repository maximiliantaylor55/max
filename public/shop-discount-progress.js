export const getNextDiscountTarget = (products, cart) => products.flatMap((product) => {
  const quantity = Number(cart[product.id]) || 0
  const tiers = Array.isArray(product.tiers) ? product.tiers : []
  const previousTier = tiers
    .filter((tier) => Number.isSafeInteger(tier.minQuantity) && tier.minQuantity <= quantity)
    .reduce((highest, tier) => Math.max(highest, tier.minQuantity), 0)

  return tiers
    .filter((tier) => Number.isSafeInteger(tier.minQuantity)
      && tier.minQuantity > quantity
      && Number.isFinite(tier.percent)
      && tier.percent > 0
      && tier.percent <= 100
      && (!Number.isSafeInteger(product.stock)
        || product.stock === 0 && product.preorderEnabled
        || tier.minQuantity <= product.stock))
    .map((tier) => ({
      product,
      quantity,
      tier,
      remaining: tier.minQuantity - quantity,
      progress: Math.max(0, Math.min(1, (quantity - previousTier) / (tier.minQuantity - previousTier))),
    }))
}).sort((left, right) => left.remaining - right.remaining
  || right.tier.percent - left.tier.percent
  || left.product.name.localeCompare(right.product.name, 'de'))[0] || null
