const test = require('node:test')
const assert = require('node:assert/strict')
const { applyBusinessPricing, cleanBusinessPrices, getCatalogBusinessPrices } = require('./business-pricing.cjs')

const products = [
  { id: 'drink-a', cratePriceCents: 2856, tiers: [{ minQuantity: 48, percent: 10 }] },
  { id: 'drink-b', cratePriceCents: 3200, tiers: [] },
]

test('uses exact business sales prices per product and disables public quantity discounts', () => {
  const prices = cleanBusinessPrices(products, { 'drink-a': 2499 })
  assert.deepEqual(applyBusinessPricing(products, prices), [
    { ...products[0], cratePriceCents: 2499, tiers: [] },
    { ...products[1], tiers: [] },
  ])
  assert.equal(products[0].cratePriceCents, 2856)
})

test('allows an empty override list and validates ids and cent values', () => {
  assert.deepEqual(cleanBusinessPrices(products, {}), {})
  assert.throws(() => cleanBusinessPrices(products, { unknown: 1200 }), /Verkaufspreise/)
  assert.throws(() => cleanBusinessPrices(products, { 'drink-a': 0 }), /Verkaufspreise/)
  assert.throws(() => cleanBusinessPrices(products, { 'drink-a': 1200.5 }), /Verkaufspreise/)
  assert.throws(() => cleanBusinessPrices(products, { 'drink-a': 100_000_001 }), /Verkaufspreise/)
  assert.throws(() => cleanBusinessPrices(products, []), /Verkaufspreise/)
})

test('ignores saved prices for products that are no longer in the shop catalog', () => {
  assert.deepEqual(getCatalogBusinessPrices(products, { 'drink-a': 2200, removed: 1500 }), { 'drink-a': 2200 })
})
