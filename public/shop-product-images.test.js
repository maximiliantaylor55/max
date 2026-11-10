import assert from 'node:assert/strict'
import test from 'node:test'
import { getShopProductImages } from './shop-product-images.js'

test('shows uploaded images for the original product SKU', () => {
  const images = ['data:image/jpeg;base64,Zmlyc3Q=', 'data:image/jpeg;base64,c2Vjb25k']
  assert.deepEqual(getShopProductImages({ id: 'zyr-pm-1', images }), images)
})

test('falls back to the legacy single image field', () => {
  const image = 'data:image/jpeg;base64,Zmlyc3Q='
  assert.deepEqual(getShopProductImages({ id: 'zyr-pm-1', image }), [image])
})

test('returns no images when a product has no uploaded image', () => {
  assert.deepEqual(getShopProductImages({ id: 'zyr-pm-1' }), [])
})
