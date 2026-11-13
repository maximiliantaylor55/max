const test = require('node:test')
const assert = require('node:assert/strict')
const { describeShipmentPhase } = require('./shipment-phase.cjs')

test('maps carrier states to customer-facing phases', () => {
  assert.equal(describeShipmentPhase({ shipped: false }).phaseLabel, 'Bestellt')
  assert.equal(describeShipmentPhase({ shipped: true }).phaseLabel, 'Versendet')
  assert.equal(describeShipmentPhase({ shipped: true, status: 'ON_THE_ROAD' }).phaseLabel, 'Unterwegs')
  assert.equal(describeShipmentPhase({ shipped: true, status: 'AT_DELIVERY_DEPOT' }).phaseLabel, 'Im Zustelldepot')
  assert.equal(describeShipmentPhase({ shipped: true, status: 'AT_DELIVERY_DEPOT', description: 'In Zustellung' }).phaseLabel, 'In Zustellung')
  assert.equal(describeShipmentPhase({ shipped: true, status: 'DELIVERED' }).phaseLabel, 'Zugestellt')
  assert.equal(describeShipmentPhase({ shipped: true, delivered: true }).phase, 5)
})
