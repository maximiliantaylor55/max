import assert from 'node:assert/strict'
import test from 'node:test'
import { getShopQuantityOptions } from './shop-quantity-options.js'

const product = (overrides = {}) => ({
  tiers: [
    { minQuantity: 48, percent: 5 },
    { minQuantity: 240, percent: 10 },
  ],
  ...overrides,
})

test('offers one can, a tray, and each eligible discount quantity', () => {
  assert.deepEqual(getShopQuantityOptions(product()), [1, 24, 48, 240])
})

test('never suggests a quantity above remaining stock', () => {
  assert.deepEqual(getShopQuantityOptions(product({ stock: 50 }), 3), [1, 24])
  assert.deepEqual(getShopQuantityOptions(product({ stock: 1 })), [1])
})

test('allows preorder quantities while excluding sold-out products without preorder', () => {
  assert.deepEqual(getShopQuantityOptions(product({ stock: 0, preorderEnabled: true })), [1, 24, 48, 240])
  assert.deepEqual(getShopQuantityOptions(product({ stock: 0 })), [])
})

test('ignores malformed and excessive tier quantities', () => {
  assert.deepEqual(getShopQuantityOptions(product({
    tiers: [{ minQuantity: 0 }, { minQuantity: 12.5 }, { minQuantity: 10000 }, { minQuantity: 12, percent: 2 }],
  })), [1, 12, 24])
})
