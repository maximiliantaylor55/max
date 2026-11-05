const assert = require('node:assert/strict')
const test = require('node:test')
const { hashReviewToken, getReviewPersistenceState, isDhlDelivered, getReviewProducts, validateReviewSubmission } = require('./review-workflow.cjs')

test('makes review persistence retries idempotent without accepting a conflicting product', () => {
  const review = { productId: 'drink-a', rating: 5, comment: 'Schmeckt super.' }
  assert.equal(getReviewPersistenceState(null, review), 'new')
  assert.equal(getReviewPersistenceState(review, review), 'existing')
  assert.equal(getReviewPersistenceState({ ...review, productId: 'drink-b' }, review), 'conflict')
  assert.equal(getReviewPersistenceState({ ...review, rating: 4 }, review), 'conflict')
})

test('recognizes delivered DHL status without treating failed delivery as delivered', () => {
  assert.equal(isDhlDelivered({ status: 'Zugestellt' }), true)
  assert.equal(isDhlDelivered({ status: 'Delivered to recipient' }), true)
  assert.equal(isDhlDelivered({ status: 'Nicht zugestellt' }), false)
  assert.equal(isDhlDelivered({ status: 'In Zustellung' }), false)
  assert.equal(isDhlDelivered(null), false)
})

test('maps purchased items to public shop products and removes duplicates', () => {
  const products = [
    { id: 'drink-a', sku: 'A-1', name: 'ZYRO A' },
    { id: 'drink-b', sku: 'B-1', name: 'ZYRO B' },
  ]
  assert.deepEqual(getReviewProducts({
    items: [
      { productSku: 'A-1', productName: 'ZYRO A' },
      { productSku: 'B-1', productName: 'ZYRO B' },
      { reviewProductId: 'drink-a', productName: 'ZYRO A' },
    ],
  }, products), [
    { id: 'drink-a', name: 'ZYRO A' },
    { id: 'drink-b', name: 'ZYRO B' },
  ])
})

test('validates a verified-purchase review and requires explicit publication consent', () => {
  const products = [{ id: 'drink-a', name: 'ZYRO A' }]
  assert.deepEqual(validateReviewSubmission({
    productId: 'drink-a',
    rating: 5,
    comment: 'Schmeckt super.',
    consent: true,
    products,
  }), { productId: 'drink-a', rating: 5, comment: 'Schmeckt super.' })
  assert.throws(() => validateReviewSubmission({ productId: 'other', rating: 5, consent: true, products }), /Produkt aus deiner Bestellung/)
  assert.throws(() => validateReviewSubmission({ productId: 'drink-a', rating: 6, consent: true, products }), /1 bis 5 Sternen/)
  assert.throws(() => validateReviewSubmission({ productId: 'drink-a', rating: 4, comment: 'x'.repeat(1001), consent: true, products }), /1.000 Zeichen/)
  assert.throws(() => validateReviewSubmission({ productId: 'drink-a', rating: 4, consent: false, products }), /Veröffentlichung/)
})

test('stores only a SHA-256 digest for review-link tokens', () => {
  const token = 'a'.repeat(64)
  assert.match(hashReviewToken(token), /^[a-f0-9]{64}$/)
  assert.notEqual(hashReviewToken(token), token)
  assert.equal(hashReviewToken(token), hashReviewToken(token))
})
