const crypto = require('node:crypto')

const hashReviewToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex')

const getReviewPersistenceState = (existingReview, review) => {
  if (!existingReview) return 'new'
  return existingReview.productId === review.productId
    && Number(existingReview.rating) === review.rating
    && String(existingReview.comment || '') === review.comment
    ? 'existing'
    : 'conflict'
}

const isDhlDelivered = (carrierStatus) => {
  const status = String(carrierStatus?.status || '').trim().toLocaleLowerCase('de-DE')
  if (!status || /\b(nicht|kein|fehlgeschlagen|failed|exception)\b/.test(status)) return false
  return /\b(zugestellt|delivered|abgeliefert)\b/.test(status)
}

const getReviewProducts = (document, shopProducts = []) => {
  const items = Array.isArray(document?.items) && document.items.length
    ? document.items
    : [{ productId: document?.productId, productSku: document?.productSku, productName: document?.productName }]
  const seen = new Set()
  return items.flatMap((item) => {
    const product = shopProducts.find((entry) => entry.id === item.reviewProductId)
      || shopProducts.find((entry) => entry.sku && entry.sku === item.productSku)
      || shopProducts.find((entry) => entry.name && entry.name === (item.productName || document.productName))
    const id = String(item.reviewProductId || product?.id || '')
    const name = String(product?.name || item.productName || document.productName || '').trim()
    if (!id || !name || seen.has(id)) return []
    seen.add(id)
    return [{ id, name }]
  })
}

const validateReviewSubmission = ({ productId, rating, comment, consent, products }) => {
  const normalizedProductId = String(productId || '').trim()
  const normalizedComment = String(comment || '').trim()
  const numericRating = Number(rating)
  if (!Array.isArray(products) || !products.some((product) => product.id === normalizedProductId)) {
    throw new Error('Bitte ein Produkt aus deiner Bestellung auswählen.')
  }
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new Error('Bitte eine Bewertung von 1 bis 5 Sternen auswählen.')
  }
  if (normalizedComment.length > 1000) throw new Error('Der Bewertungstext darf höchstens 1.000 Zeichen lang sein.')
  if (consent !== true) throw new Error('Bitte der Veröffentlichung nach Prüfung zustimmen.')
  return { productId: normalizedProductId, rating: numericRating, comment: normalizedComment }
}

module.exports = { hashReviewToken, getReviewPersistenceState, isDhlDelivered, getReviewProducts, validateReviewSubmission }
