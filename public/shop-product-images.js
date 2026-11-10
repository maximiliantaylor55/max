export const getShopProductImages = (product) => (
  Array.isArray(product.images) && product.images.length
    ? product.images
    : (product.image ? [product.image] : [])
)
