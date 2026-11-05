const test = require('node:test')
const assert = require('node:assert/strict')
const { applyDiscountToItems, calculateDiscount, cleanDiscountCodes } = require('./shop-discounts.cjs')

const discounts = [
  { id: 'welcome', code: 'WELCOME10', type: 'percent', value: 10, active: true },
  { id: 'fixed', code: 'FIVE-EURO', type: 'fixed', value: 500, active: true },
  { id: 'paused', code: 'PAUSED', type: 'percent', value: 25, active: false },
]

test('Rabattcodes sind unabhängig von der Groß-/Kleinschreibung und werden korrekt berechnet', () => {
  assert.deepEqual(calculateDiscount('welcome10', discounts, 1250), { code: 'WELCOME10', amountCents: 125 })
  assert.deepEqual(calculateDiscount('FIVE-EURO', discounts, 300), { code: 'FIVE-EURO', amountCents: 300 })
  assert.deepEqual(calculateDiscount('', discounts, 300), { code: '', amountCents: 0 })
})

test('unbekannte, deaktivierte und ungültige Rabattcodes werden abgelehnt', () => {
  assert.throws(() => calculateDiscount('MISSING', discounts, 1000), /nicht mehr verfügbar/)
  assert.throws(() => calculateDiscount('PAUSED', discounts, 1000), /nicht mehr verfügbar/)
  assert.throws(() => cleanDiscountCodes([{ code: 'bad code', type: 'percent', value: 10, active: true }]), /Rabattcode ungültig/)
  assert.throws(() => cleanDiscountCodes([{ code: 'DUPLICATE', type: 'percent', value: 10, active: true }, { code: 'duplicate', type: 'fixed', value: 100, active: true }]), /Rabattcode ungültig/)
})

test('Rabatt wird centgenau auf die Positionen verteilt', () => {
  const result = applyDiscountToItems([
    { productId: 'a', lineTotalCents: 101 },
    { productId: 'b', lineTotalCents: 99 },
  ], 50)
  assert.deepEqual(result.map((item) => item.lineTotalCents), [76, 74])
  assert.equal(result.reduce((sum, item) => sum + item.lineTotalCents, 0), 150)
})
