const crypto = require('node:crypto')

const verifyStripeSignature = (rawBody, header, secret, toleranceSeconds = 300, now = Date.now()) => {
  if (!rawBody || !header || !secret) return false
  const parts = String(header).split(',').map((part) => part.split('='))
  const timestamp = parts.find(([key]) => key === 't')?.[1]
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value)
  if (!timestamp || signatures.length === 0 || Math.abs(now / 1000 - Number(timestamp)) > toleranceSeconds) return false
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  return signatures.some((signature) => {
    const provided = Buffer.from(signature, 'hex')
    const wanted = Buffer.from(expected, 'hex')
    return provided.length === wanted.length && crypto.timingSafeEqual(provided, wanted)
  })
}

// Stripe erwartet application/x-www-form-urlencoded mit verschachtelten Schlüsseln.
const buildCheckoutParams = ({ order, orderNumber, orderId, successUrl, cancelUrl, shippingPriceCents }) => {
  const params = new URLSearchParams()
  params.set('mode', 'payment')
  params.set('success_url', successUrl)
  params.set('cancel_url', cancelUrl)
  params.set('customer_email', order.email)
  params.set('client_reference_id', orderId)
  params.set('metadata[orderId]', orderId)
  params.set('metadata[orderNumber]', orderNumber)
  params.set('payment_intent_data[description]', `ZYRO Bestellung ${orderNumber}`)
  params.set('payment_intent_data[metadata][orderId]', orderId)
  let index = 0
  const addLine = (name, amountCents) => {
    params.set(`line_items[${index}][quantity]`, '1')
    params.set(`line_items[${index}][price_data][currency]`, 'eur')
    params.set(`line_items[${index}][price_data][unit_amount]`, String(amountCents))
    params.set(`line_items[${index}][price_data][product_data][name]`, name.slice(0, 250))
    index += 1
  }
  for (const item of order.items) addLine(`${item.quantity} × ${item.productName}`, item.lineTotalCents)
  if (shippingPriceCents > 0) addLine('Versand', shippingPriceCents)
  if (order.depositCents > 0) addLine('Pfand (zzgl.)', order.depositCents)
  if (index === 0) throw new Error('Keine Positionen für die Zahlung.')
  return params
}

const getCheckoutAmountCents = (order, shippingPriceCents) => order.items.reduce(
  (total, item) => total + item.lineTotalCents,
  shippingPriceCents + (Number(order.depositCents) || 0),
)

module.exports = { verifyStripeSignature, buildCheckoutParams, getCheckoutAmountCents }
