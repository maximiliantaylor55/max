const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { verifyStripeSignature, buildCheckoutParams, getCheckoutAmountCents } = require('./stripe-helpers.cjs')

const sign = (body, secret, timestamp) => `t=${timestamp},v1=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`

test('gültige Signatur wird akzeptiert, falsche oder alte abgelehnt', () => {
  const now = Date.now()
  const timestamp = Math.floor(now / 1000)
  const body = '{"type":"checkout.session.completed"}'
  assert.equal(verifyStripeSignature(body, sign(body, 'whsec_x', timestamp), 'whsec_x', 300, now), true)
  assert.equal(verifyStripeSignature(body, sign(body, 'andere', timestamp), 'whsec_x', 300, now), false)
  assert.equal(verifyStripeSignature(`${body} `, sign(body, 'whsec_x', timestamp), 'whsec_x', 300, now), false)
  assert.equal(verifyStripeSignature(body, sign(body, 'whsec_x', timestamp - 1000), 'whsec_x', 300, now), false)
  assert.equal(verifyStripeSignature(body, '', 'whsec_x', 300, now), false)
})

test('Checkout-Parameter enthalten Positionen und Versand', () => {
  const params = buildCheckoutParams({
    order: { email: 'a@b.de', items: [{ quantity: 24, productName: 'ZYRO', lineTotalCents: 2856 }] },
    orderNumber: 'ZY-1', orderId: 'abc', successUrl: 'https://x/ok', cancelUrl: 'https://x/no', shippingPriceCents: 690,
  })
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '2856')
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '690')
  assert.equal(params.get('metadata[orderId]'), 'abc')
})

test('berechnet den Stripe-Zahlbetrag inklusive Versand und Pfand für die Mindestbetragsprüfung', () => {
  const order = {
    items: [{ lineTotalCents: 20 }, { lineTotalCents: 15 }],
    depositCents: 10,
  }
  assert.equal(getCheckoutAmountCents(order, 4), 49)
  assert.equal(getCheckoutAmountCents(order, 5), 50)
})
