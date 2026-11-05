import assert from 'node:assert/strict'
import test from 'node:test'
import { getShopIssues, getShopStock } from './shop-status.js'

test('vollständiger Artikel hat keine Shop-Probleme', () => {
  const product = { id: '1', name: 'Cola', sku: 'cola', shopActive: true, shopCratePrice: '28,56', weightKg: '0,75' }
  assert.deepEqual(getShopIssues(product, [product]), [])
})

test('fehlende Pflichtfelder werden benannt', () => {
  const product = { id: '1', name: 'Cola', sku: 'cola', shopActive: true }
  assert.deepEqual(getShopIssues(product, [product]), ['Einzelpreis netto fehlt', 'Gewicht pro Dose fehlt'])
})

test('nicht freigegebene Artikel melden nichts, doppelte SKU und Bestand', () => {
  assert.deepEqual(getShopIssues({ name: 'Cola', shopActive: false }), [])
  const first = { id: '1', name: 'A', sku: 'x1', shopActive: true, shopCratePrice: 5, weightKg: 1 }
  const second = { id: '2', name: 'B', sku: 'x1', shopActive: true, shopCratePrice: 5, weightKg: 1 }
  assert.deepEqual(getShopIssues(second, [first, second]), ['Artikelnummer ist doppelt vergeben'])
  assert.equal(getShopStock({ availableBottles: '12' }), 12)
  assert.equal(getShopStock({ availableBottles: '' }), null)
})
