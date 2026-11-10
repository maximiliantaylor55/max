const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildPaypalOrderRequest,
  formatPaypalAmount,
  getPaypalApiBaseUrl,
  validateCompletedPaypalOrder,
} = require('./paypal-helpers.cjs')

test('PayPal uses the selected sandbox or live API', () => {
  assert.equal(getPaypalApiBaseUrl('sandbox'), 'https://api-m.sandbox.paypal.com')
  assert.equal(getPaypalApiBaseUrl('live'), 'https://api-m.paypal.com')
})

test('PayPal order amount and return URLs are generated from server-calculated values', () => {
  const request = buildPaypalOrderRequest({
    orderId: 'internal-order-id',
    orderNumber: 'ZY-WEB-123',
    amountCents: 864,
    returnUrl: 'https://shop.example/brand.html?paypal=approved',
    cancelUrl: 'https://shop.example/brand.html?paypal=cancelled',
  })
  assert.equal(request.intent, 'CAPTURE')
  assert.equal(request.purchase_units[0].amount.value, '8.64')
  assert.equal(request.purchase_units[0].amount.currency_code, 'EUR')
  assert.equal(request.purchase_units[0].custom_id, 'internal-order-id')
  assert.equal(request.payment_source.paypal.experience_context.return_url, 'https://shop.example/brand.html?paypal=approved')
  assert.equal(request.payment_source.paypal.experience_context.payment_method_preference, 'IMMEDIATE_PAYMENT_REQUIRED')
  assert.equal(formatPaypalAmount(149), '1.49')
  assert.throws(() => formatPaypalAmount(0), /Zahlbetrag/)
})

test('completed capture must match the order and exact EUR amount', () => {
  const response = {
    status: 'COMPLETED',
    purchase_units: [{
      reference_id: 'order-1',
      custom_id: 'order-1',
      amount: { currency_code: 'EUR', value: '8.64' },
      payments: { captures: [{ id: 'capture-1', status: 'COMPLETED', amount: { currency_code: 'EUR', value: '8.64' } }] },
    }],
  }
  assert.deepEqual(validateCompletedPaypalOrder(response, { orderId: 'order-1', amountCents: 864 }), {
    captureId: 'capture-1',
    capturedCents: 864,
  })
  assert.throws(() => validateCompletedPaypalOrder(response, { orderId: 'other-order', amountCents: 864 }), /stimmt nicht/)
  assert.throws(() => validateCompletedPaypalOrder(response, { orderId: 'order-1', amountCents: 863 }), /Bestellbetrag|Zahlbetrag/)
  assert.throws(() => validateCompletedPaypalOrder({
    ...response,
    purchase_units: [{ ...response.purchase_units[0], amount: { currency_code: 'EUR', value: '8.63' } }],
  }, { orderId: 'order-1', amountCents: 864 }), /Bestellbetrag/)
  assert.throws(() => validateCompletedPaypalOrder({ ...response, status: 'APPROVED' }, { orderId: 'order-1', amountCents: 864 }), /nicht abgeschlossen/)
})
