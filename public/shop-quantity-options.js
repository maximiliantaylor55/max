export const getShopQuantityOptions = (product, cartQuantity = 0) => {
  const quantities = [...new Set([1, 24, ...(product.tiers || []).map((tier) => Number(tier.minQuantity))])]
    .filter((quantity) => Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 9999)
    .sort((left, right) => left - right)
  const preorder = product.stock === 0 && product.preorderEnabled
  const remainingStock = Number.isSafeInteger(product.stock) && !preorder
    ? Math.max(0, product.stock - cartQuantity)
    : Infinity

  return quantities.filter((quantity) => quantity <= remainingStock)
}
