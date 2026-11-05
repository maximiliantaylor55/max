const test = require('node:test')
const assert = require('node:assert/strict')
const { acceptMdeOrder, getPublicShipment, recordMdeScan, validateMdePacking, validateShipment } = require('./mde-workflow.cjs')

const order = {
  id: 'order-1',
  kind: 'kundenauftrag',
  status: 'Kommissionierung',
  pickingUserId: 'user-1',
  recipientEmail: 'kunde@example.com',
  mdeScannedQuantities: { 'product-1': 3, 'product-2': 2 },
  items: [
    { productId: 'product-1', quantity: 2 },
    { productId: 'product-1', quantity: 1 },
    { productId: 'product-2', quantity: 2 },
  ],
}
const products = [
  { id: 'product-1', name: 'Citrus', sku: 'product-1', availableBottles: 10 },
  { id: 'product-2', name: 'Berry', sku: 'product-2', availableBottles: 5 },
]

test('aggregates order lines and accepts only the exact scanned quantities', () => {
  const lines = validateMdePacking({
    document: order,
    products,
    actorId: 'user-1',
  })
  assert.deepEqual(lines.map(({ product, quantity }) => [product.id, quantity]), [
    ['product-1', 3],
    ['product-2', 2],
  ])
})

test('rejects incomplete, excessive, and unexpected scans', () => {
  for (const scannedItems of [
    { 'product-1': 2, 'product-2': 2 },
    { 'product-1': 4, 'product-2': 2 },
    { 'product-1': 3, 'product-2': 2, extra: 1 },
  ]) {
    assert.throws(() => validateMdePacking({ document: { ...order, mdeScannedQuantities: scannedItems }, products, actorId: 'user-1' }), { statusCode: 409 })
  }
})

test('rejects unrecorded or insufficient stock before booking', () => {
  assert.throws(() => validateMdePacking({
    document: order,
    products: [{ ...products[0], availableBottles: undefined }, products[1]],
    actorId: 'user-1',
  }), { statusCode: 409 })
  assert.throws(() => validateMdePacking({
    document: order,
    products: [{ ...products[0], availableBottles: 2 }, products[1]],
    actorId: 'user-1',
  }), { statusCode: 409 })
})

test('requires an eligible order and customer email', () => {
  assert.throws(() => validateMdePacking({
    document: { ...order, status: 'Verpackt' },
    products,
    actorId: 'user-1',
  }), { statusCode: 409 })
  assert.throws(() => validateMdePacking({
    document: { ...order, recipientEmail: '' },
    products,
    actorId: 'user-1',
  }), { statusCode: 400 })
})

test('accepts an order for one operator and blocks a second operator', () => {
  const accepted = acceptMdeOrder({ document: { ...order, status: 'Bestätigt', pickingUserId: undefined }, actor: { id: 'user-1', name: 'Anna' } })
  assert.equal(accepted.status, 'Kommissionierung')
  assert.equal(accepted.pickingUserId, 'user-1')
  assert.equal(acceptMdeOrder({ document: accepted, actor: { id: 'user-1' } }), accepted)
  assert.throws(() => acceptMdeOrder({ document: accepted, actor: { id: 'user-2' } }), { statusCode: 409 })
})

test('records only assigned product barcodes up to the ordered quantity', () => {
  const accepted = { ...order, mdeScannedQuantities: { 'product-1': 2, 'product-2': 0 } }
  const scan = recordMdeScan({ document: accepted, products, barcode: 'product-1', actor: { id: 'user-1' } })
  assert.equal(scan.scannedQuantity, 3)
  assert.throws(() => recordMdeScan({ document: accepted, products, barcode: 'product-1', actor: { id: 'user-1' } }), { statusCode: 409 })
  assert.throws(() => recordMdeScan({ document: accepted, products, barcode: 'not-in-order', actor: { id: 'user-1' } }), { statusCode: 404 })
  assert.throws(() => recordMdeScan({ document: accepted, products, barcode: 'product-1', actor: { id: 'user-2' } }), { statusCode: 409 })
})

test('matches product-level EAN-13 values while preserving existing label EANs', () => {
  const accepted = { ...order, mdeScannedQuantities: { 'product-1': 0, 'product-2': 0 } }
  const productsWithEans = [
    { ...products[0], ean13: '4006381333931' },
    { ...products[1], bottleLabel: { ean13: '5901234123457' } },
  ]
  assert.equal(recordMdeScan({ document: accepted, products: productsWithEans, barcode: '4006381333931', actor: { id: 'user-1' } }).product.id, 'product-1')
  assert.equal(recordMdeScan({ document: accepted, products: productsWithEans, barcode: '5901234123457', actor: { id: 'user-1' } }).product.id, 'product-2')
})

test('validates DHL and freight shipment tracking before marking an order shipped', () => {
  const dhlOrder = { ...order, status: 'Verpackt' }
  validateShipment({ document: dhlOrder, carrier: 'DHL', trackingNumber: '00340434123456789012' })
  assert.equal(dhlOrder.status, 'Versendet')
  assert.equal(dhlOrder.carrierName, 'DHL')
  assert.match(dhlOrder.trackingToken, /^[a-f0-9]{64}$/)
  assert.equal(dhlOrder.shipmentNotificationStatus, 'pending')

  assert.throws(() => validateShipment({
    document: { ...order, status: 'Verpackt' },
    carrier: 'Spedition',
    trackingNumber: '12345',
  }), { statusCode: 400 })
  assert.throws(() => validateShipment({
    document: { ...order, status: 'Verpackt' },
    carrier: 'Spedition',
    carrierName: 'Muster Transport',
    trackingNumber: '12345',
    trackingUrl: 'http://example.com/track',
  }), { statusCode: 400 })
})

test('returns only a shipped order summary to the holder of its unguessable tracking token', () => {
  const shippedOrder = {
    ...order,
    status: 'Verpackt',
    recipient: 'Kundin',
    recipientAddress: 'Private Adresse',
  }
  validateShipment({
    document: shippedOrder,
    carrier: 'DHL',
    trackingNumber: '00340434123456789012',
  })
  const result = getPublicShipment({ documents: [shippedOrder], token: shippedOrder.trackingToken })
  assert.deepEqual(result, {
    orderNumber: shippedOrder.number || shippedOrder.id,
    status: 'Versendet',
    carrier: 'DHL',
    trackingNumber: '00340434123456789012',
    trackingUrl: '',
    shippedAt: shippedOrder.shippedAt,
  })
  assert.equal(JSON.stringify(result).includes('Private Adresse'), false)
  assert.equal(getPublicShipment({ documents: [shippedOrder], token: '0'.repeat(64) }), null)
  assert.equal(getPublicShipment({ documents: [{ ...shippedOrder, status: 'Verpackt' }], token: shippedOrder.trackingToken }), null)
  assert.equal(getPublicShipment({ documents: [shippedOrder], token: 'invalid' }), null)
})
