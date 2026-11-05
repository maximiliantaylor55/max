import assert from 'node:assert/strict'
import test from 'node:test'
import { getNextDiscountTarget } from './shop-discount-progress.js'

const product = (overrides = {}) => ({
  id: 'drink',
  name: 'ZYRO Drink',
  tiers: [
    { minQuantity: 48, percent: 5 },
    { minQuantity: 240, percent: 10 },
  ],
  ...overrides,
})

test('finds the closest next tier and computes progress since the previous tier', () => {
  const target = getNextDiscountTarget([product()], { drink: 24 })
  assert.equal(target.remaining, 24)
  assert.equal(target.tier.percent, 5)
  assert.equal(target.progress, 0.5)
})

test('skips reached tiers and selects the next available volume discount', () => {
  const target = getNextDiscountTarget([product()], { drink: 48 })
  assert.equal(target.remaining, 192)
  assert.equal(target.tier.percent, 10)
  assert.equal(target.progress, 0)
})

test('only suggests quantities that can be fulfilled from available stock', () => {
  assert.equal(getNextDiscountTarget([product({ stock: 60 })], {}).remaining, 48)
  assert.equal(getNextDiscountTarget([product({ stock: 12 })], {}), null)
  assert.equal(getNextDiscountTarget([product({ stock: 0 })], {}), null)
  assert.equal(getNextDiscountTarget([product({ stock: 0, preorderEnabled: true })], {}).remaining, 48)
})

test('picks the nearest next tier across products', () => {
  const other = product({ id: 'other', name: 'ZYRO Other', tiers: [{ minQuantity: 12, percent: 2 }] })
  assert.equal(getNextDiscountTarget([product(), other], {}).product.id, 'other')
})
