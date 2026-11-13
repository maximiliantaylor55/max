const test = require('node:test')
const assert = require('node:assert/strict')
const { validatePublicOrder } = require('./order-validation.cjs')

const order = (quantity) => ({
  name: 'Max Mustermann',
  email: 'max@example.com',
  address: 'Musterstrasse 1',
  postalCode: '57078',
  city: 'Siegen',
  privacyNoticeAcknowledged: true,
  paymentMethod: 'vorkasse',
  items: [{ productId: 'mix-tray', quantity }],
})
const catalog = new Map([['mix-tray', { id: 'mix-tray', name: 'ZYRO Mix-Tray', cratePriceCents: 4599, tiers: [], stock: 240, trayOnly: true, depositCents: 25 }]])

test('mix trays can only be ordered in whole 24er trays', () => {
  assert.throws(() => validatePublicOrder(order(12), catalog, ['vorkasse']), /nur als ganzes 24er-Tray/)
  const result = validatePublicOrder(order(48), catalog, ['vorkasse'])
  assert.equal(result.items[0].largeCartonCount, 2)
  assert.equal(result.items[0].lineTotalCents, 9198)
})
