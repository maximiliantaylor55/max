const getPaypalApiBaseUrl = (mode) => (
  mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
)

const formatPaypalAmount = (amountCents) => {
  if (!Number.isSafeInteger(amountCents) || amountCents < 1) throw new Error('PayPal-Zahlbetrag ungültig.')
  return (amountCents / 100).toFixed(2)
}

const buildPaypalOrderRequest = ({ orderId, orderNumber, amountCents, returnUrl, cancelUrl }) => ({
  intent: 'CAPTURE',
  purchase_units: [{
    reference_id: orderId,
    custom_id: orderId,
    invoice_id: orderNumber,
    description: `ZYRO Bestellung ${orderNumber}`.slice(0, 127),
    amount: {
      currency_code: 'EUR',
      value: formatPaypalAmount(amountCents),
    },
  }],
  payment_source: {
    paypal: {
      experience_context: {
        brand_name: 'ZYRO',
        locale: 'de-DE',
        payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    },
  },
})

const validateCompletedPaypalOrder = (paypalOrder, { orderId, amountCents }) => {
  if (paypalOrder?.status !== 'COMPLETED' || !Array.isArray(paypalOrder.purchase_units) || paypalOrder.purchase_units.length !== 1) {
    throw new Error('PayPal-Zahlung ist noch nicht abgeschlossen.')
  }
  const unit = paypalOrder.purchase_units[0]
  if (unit?.reference_id !== orderId || unit?.custom_id !== orderId) {
    throw new Error('PayPal-Bestellung stimmt nicht mit der Shop-Bestellung überein.')
  }
  const expectedAmount = formatPaypalAmount(amountCents)
  if (unit.amount?.currency_code !== 'EUR' || unit.amount?.value !== expectedAmount) {
    throw new Error('Der PayPal-Bestellbetrag stimmt nicht mit dem Shop überein.')
  }
  const captures = unit?.payments?.captures
  const capture = Array.isArray(captures) ? captures.find((entry) => entry?.status === 'COMPLETED') : null
  const capturedValue = String(capture?.amount?.value || '')
  const capturedCents = Math.round(Number(capturedValue) * 100)
  if (!capture?.id
    || capture.amount?.currency_code !== 'EUR'
    || !/^\d+(?:\.\d{1,2})?$/.test(capturedValue)
    || !Number.isSafeInteger(capturedCents)
    || capturedCents !== amountCents) {
    throw new Error('Der bestätigte PayPal-Zahlbetrag stimmt nicht mit der Bestellung überein.')
  }
  return { captureId: String(capture.id), capturedCents }
}

module.exports = {
  buildPaypalOrderRequest,
  formatPaypalAmount,
  getPaypalApiBaseUrl,
  validateCompletedPaypalOrder,
}
