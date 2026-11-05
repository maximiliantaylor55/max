const test = require('node:test')
const assert = require('node:assert/strict')
const { validatePublicOrder } = require('./order-validation.cjs')
const { buildOrderConfirmationEmail } = require('./email-templates.cjs')
const { calculateShipping } = require('./shipping-calculation.cjs')
const { calculateOrderPricing } = require('./order-pricing.cjs')
const { validateContactMessage } = require('./contact-validation.cjs')

const validOrder = {
  company: 'ZYRO Test GmbH',
  name: 'Max Mustermann',
  email: ' MAX@EXAMPLE.COM ',
  address: 'Musterstrasse 1',
  postalCode: '57078',
  city: 'Siegen',
  note: 'Bitte Liefertermin bestaetigen.',
  privacyNoticeAcknowledged: true,
  paymentMethod: 'vorkasse',
  items: [{ productId: 'pfirsich-maracuja', quantity: 12 }],
}

test('normalizes and canonicalizes a valid website order', () => {
  const result = validatePublicOrder(validOrder, undefined, ['vorkasse'])
  assert.equal(result.email, 'max@example.com')
  assert.equal(result.items[0].productName, 'Pfrisch Maracuja')
  assert.equal(result.items[0].quantity, 12)
  assert.equal(result.privacyNoticeAcknowledged, true)
})

test('accepts umlauts in customer addresses and converts internationalized domains for SMTP', () => {
  const result = validatePublicOrder({ ...validOrder, email: 'MÜLLER@BÜCHER.DE' }, undefined, ['vorkasse'])
  assert.equal(result.email, 'müller@xn--bcher-kva.de')
})

test('validates and retains optional phone and billing details', () => {
  const result = validatePublicOrder({
    ...validOrder,
    phone: '+49 123 456',
    billingEmail: ' RECHNUNG@EXAMPLE.COM ',
    billingCompany: 'Rechnungs GmbH',
    billingAddress: 'Rechnungsweg 9',
    billingPostalCode: '54321',
    billingCity: 'Rechnungsort',
    vatId: 'de123456789',
  }, undefined, ['vorkasse'])

  assert.equal(result.phone, '+49 123 456')
  assert.equal(result.billingEmail, 'rechnung@example.com')
  assert.equal(result.billingCompany, 'Rechnungs GmbH')
  assert.equal(result.billingAddress, 'Rechnungsweg 9')
  assert.equal(result.vatId, 'DE123456789')
})

test('rejects incomplete or invalid optional billing details', () => {
  assert.throws(() => validatePublicOrder({
    ...validOrder,
    billingAddress: 'Rechnungsweg 9',
  }, undefined, ['vorkasse']), /Rechnungsadresse vollständig/)
  assert.throws(() => validatePublicOrder({
    ...validOrder,
    billingEmail: 'ungültig',
  }, undefined, ['vorkasse']), /Rechnungs-E-Mail-Adresse ungültig/)
  assert.throws(() => validatePublicOrder({
    ...validOrder,
    vatId: '123456',
  }, undefined, ['vorkasse']), /USt-IdNr. ungültig/)
})

test('uses the supplied catalog to calculate trusted crate prices', () => {
  const catalog = new Map([
    ['pfirsich-maracuja', { name: 'ZYRO Pfirsich Maracuja', cratePriceCents: 2400, active: true }],
  ])
  const result = validatePublicOrder({
    ...validOrder,
    items: [{ productId: 'pfirsich-maracuja', quantity: 25 }],
  }, catalog, ['vorkasse'])

  assert.equal(result.items[0].productName, 'ZYRO Pfirsich Maracuja')
  assert.equal(result.items[0].cratePriceCents, 2400)
  assert.equal(result.items[0].largeCartonCount, 1)
  assert.equal(result.items[0].smallCartonCount, 1)
  assert.equal(result.items[0].lineTotalCents, 2500)
  assert.equal(result.totalPriceCents, 2500)
})

test('accepts and correctly prices an order for one bottle', () => {
  const catalog = new Map([
    ['pfirsich-maracuja', {
      name: 'ZYRO Pfirsich Maracuja',
      cratePriceCents: 2856,
      depositCents: 25,
      active: true,
      stock: 1,
    }],
  ])
  const result = validatePublicOrder({
    ...validOrder,
    items: [{ productId: 'pfirsich-maracuja', quantity: 1 }],
  }, catalog, ['vorkasse'])

  assert.equal(result.bottleCount, 1)
  assert.equal(result.items[0].lineTotalCents, 119)
  assert.equal(result.items[0].depositCents, 25)
  assert.equal(result.items[0].largeCartonCount, 0)
  assert.equal(result.items[0].smallCartonCount, 1)
})

test('allows an out-of-stock item only as an enabled preorder and trusts its delivery date', () => {
  const expectedDeliveryDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const catalog = new Map([
    ['zyro-test', {
      name: 'ZYRO Test',
      cratePriceCents: 2400,
      active: true,
      stock: 0,
      preorderEnabled: true,
      expectedDeliveryDate,
    }],
  ])
  const result = validatePublicOrder({
    ...validOrder,
    items: [{ productId: 'zyro-test', quantity: 12, isPreorder: false, expectedDeliveryDate: '2000-01-01' }],
  }, catalog, ['vorkasse'])

  assert.equal(result.hasPreorderItems, true)
  assert.equal(result.items[0].isPreorder, true)
  assert.equal(result.items[0].expectedDeliveryDate, expectedDeliveryDate)
})

test('rejects preorder requests for disabled items or quantities above positive stock', () => {
  const disabled = new Map([
    ['zyro-test', { name: 'ZYRO Test', cratePriceCents: 2400, active: true, stock: 0, preorderEnabled: false }],
  ])
  const available = new Map([
    ['zyro-test', { name: 'ZYRO Test', cratePriceCents: 2400, active: true, stock: 2, preorderEnabled: true }],
  ])

  assert.throws(() => validatePublicOrder({ ...validOrder, items: [{ productId: 'zyro-test', quantity: 1 }] }, disabled, ['vorkasse']), /nur noch 0/)
  assert.throws(() => validatePublicOrder({ ...validOrder, items: [{ productId: 'zyro-test', quantity: 3 }] }, available, ['vorkasse']), /nur noch 2/)
})

test('rejects an unacknowledged privacy notice', () => {
  assert.throws(() => validatePublicOrder({ ...validOrder, privacyNoticeAcknowledged: false }, undefined, ['vorkasse']))
})

test('rejects an unknown product', () => {
  assert.throws(() => validatePublicOrder({ ...validOrder, items: [{ productId: 'admin', quantity: 1 }] }, undefined, ['vorkasse']))
})

test('rejects duplicate product entries', () => {
  assert.throws(() => validatePublicOrder({
    ...validOrder,
    items: [{ productId: 'pfirsich-maracuja', quantity: 1 }, { productId: 'pfirsich-maracuja', quantity: 2 }],
  }, undefined, ['vorkasse']))
})

test('rejects malformed email addresses', () => {
  assert.throws(() => validatePublicOrder({ ...validOrder, email: 'no-address' }, undefined, ['vorkasse']))
})

test('rejects quantities beyond the defined limit', () => {
  assert.throws(() => validatePublicOrder({ ...validOrder, items: [{ productId: 'pfirsich-maracuja', quantity: 10000 }] }, undefined, ['vorkasse']))
})

test('splits full 24-bottle cartons from loose bottles', () => {
  for (const [quantity, expectedLarge, expectedSmall] of [[1, 0, 1], [23, 0, 23], [24, 1, 0], [25, 1, 1], [48, 2, 0], [49, 2, 1]]) {
    const result = validatePublicOrder({ ...validOrder, items: [{ productId: 'pfirsich-maracuja', quantity }] }, undefined, ['vorkasse'])
    assert.equal(result.crateCount, expectedLarge)
    assert.equal(result.largeCartonCount, expectedLarge)
    assert.equal(result.smallCartonCount, expectedSmall)
    assert.equal(result.items[0].largeCartonCount, expectedLarge)
    assert.equal(result.items[0].smallCartonCount, expectedSmall)
  }
})

test('rejects a payment method that is not configured', () => {
  assert.throws(() => validatePublicOrder({ ...validOrder, paymentMethod: 'paypal' }, undefined, ['vorkasse']))
})

test('calculates shipping from bottle and carton weight, rounding up each started kilogram', () => {
  const catalog = new Map([
    ['pfirsich-maracuja', { name: 'ZYRO Pfirsich Maracuja', cratePriceCents: 2400, unitWeightGrams: 500 }],
  ])
  const order = validatePublicOrder({
    ...validOrder,
    items: [{ productId: 'pfirsich-maracuja', quantity: 25 }],
  }, catalog, ['vorkasse'])
  const shipping = calculateShipping(order.items, catalog, {
    shippingPriceCents: 500,
    shippingPricePerKgCents: 200,
    largeCartonTareGrams: 500,
    smallCartonTareGrams: 50,
  })

  assert.equal(shipping.shippingWeightGrams, 13050)
  assert.equal(shipping.shippingBillableWeightKg, 14)
  assert.equal(shipping.shippingPriceCents, 3300)
})

test('uses DHL price tiers and charges another package above 31.5 kg', () => {
  const catalog = new Map([
    ['pfirsich-maracuja', { name: 'ZYRO Pfirsich Maracuja', cratePriceCents: 2400, unitWeightGrams: 500 }],
  ])
  const settings = {
    largeCartonTareGrams: 0,
    smallCartonTareGrams: 0,
    shippingTiers: [
      { maxWeightGrams: 2000, priceCents: 619 },
      { maxWeightGrams: 5000, priceCents: 769 },
      { maxWeightGrams: 10000, priceCents: 1049 },
      { maxWeightGrams: 20000, priceCents: 1899 },
      { maxWeightGrams: 31500, priceCents: 2399 },
    ],
  }
  const fiveKg = calculateShipping([{ productId: 'pfirsich-maracuja', quantity: 10, largeCartonCount: 0, smallCartonCount: 0 }], catalog, settings)
  const overMax = calculateShipping([{ productId: 'pfirsich-maracuja', quantity: 64, largeCartonCount: 0, smallCartonCount: 0 }], catalog, settings)

  assert.equal(fiveKg.shippingPriceCents, 769)
  assert.equal(overMax.shippingPriceCents, 4798)
})

test('charges business customers 85 euros per started pallet of 64 trays', () => {
  const catalog = new Map([
    ['pfirsich-maracuja', { name: 'ZYRO Pfirsich Maracuja', cratePriceCents: 2400, unitWeightGrams: 500 }],
  ])
  const settings = {
    largeCartonTareGrams: 0,
    smallCartonTareGrams: 0,
    shippingPricePerPalletCents: 8500,
    shippingTraysPerPallet: 64,
    shippingTiers: [{ maxWeightGrams: 31500, priceCents: 2399 }],
  }
  const onePallet = calculateShipping([
    { productId: 'pfirsich-maracuja', quantity: 64 * 24, largeCartonCount: 64, smallCartonCount: 0 },
  ], catalog, settings, { businessCustomer: true })
  const twoPallets = calculateShipping([
    { productId: 'pfirsich-maracuja', quantity: 64 * 24 + 1, largeCartonCount: 64, smallCartonCount: 1 },
  ], catalog, settings, { businessCustomer: true })
  const privateParcel = calculateShipping([
    { productId: 'pfirsich-maracuja', quantity: 24, largeCartonCount: 1, smallCartonCount: 0 },
  ], catalog, settings)

  assert.equal(onePallet.shippingPalletCount, 1)
  assert.equal(onePallet.shippingPriceCents, 8500)
  assert.equal(onePallet.shippingMethod, 'Spedition')
  assert.equal(twoPallets.shippingPalletCount, 2)
  assert.equal(twoPallets.shippingPriceCents, 17000)
  assert.equal(privateParcel.shippingPriceCents, 2399)
  assert.equal(privateParcel.shippingMethod, 'DHL Paket (bis 31,5 kg)')
})

test('uses DPD for business orders up to two trays and freight above that threshold', () => {
  const catalog = new Map([
    ['pfirsich-maracuja', { name: 'ZYRO Pfirsich Maracuja', cratePriceCents: 2400, unitWeightGrams: 500 }],
  ])
  const settings = {
    largeCartonTareGrams: 500,
    smallCartonTareGrams: 50,
    businessDpdMaxTrays: 2,
    businessDpdShippingTiers: [
      { maxWeightGrams: 2000, priceCents: 699 },
      { maxWeightGrams: 5000, priceCents: 899 },
      { maxWeightGrams: 10000, priceCents: 1199 },
      { maxWeightGrams: 20000, priceCents: 1999 },
      { maxWeightGrams: 31500, priceCents: 2799 },
    ],
    shippingPricePerPalletCents: 8500,
    shippingTraysPerPallet: 64,
  }
  const oneTray = calculateShipping([
    { productId: 'pfirsich-maracuja', quantity: 24, largeCartonCount: 1, smallCartonCount: 0 },
  ], catalog, settings, { businessCustomer: true })
  const twoTrays = calculateShipping([
    { productId: 'pfirsich-maracuja', quantity: 48, largeCartonCount: 2, smallCartonCount: 0 },
  ], catalog, settings, { businessCustomer: true })
  const threeTrays = calculateShipping([
    { productId: 'pfirsich-maracuja', quantity: 72, largeCartonCount: 3, smallCartonCount: 0 },
  ], catalog, settings, { businessCustomer: true })

  assert.equal(oneTray.shippingMethod, 'DPD Paket (bis 31,5 kg)')
  assert.equal(oneTray.shippingPriceCents, 1999)
  assert.equal(oneTray.shippingPalletCount, 0)
  assert.equal(twoTrays.shippingMethod, 'DPD Paket (bis 31,5 kg)')
  assert.equal(twoTrays.shippingPriceCents, 2799)
  assert.equal(threeTrays.shippingMethod, 'Spedition')
  assert.equal(threeTrays.shippingPriceCents, 8500)
  assert.equal(threeTrays.shippingPalletCount, 1)
})

test('uses freight for business orders over 31.5 kg even below the tray limit', () => {
  const catalog = new Map([
    ['heavy-product', { name: 'Schwerer Artikel', cratePriceCents: 2400, unitWeightGrams: 1400 }],
  ])
  const shipping = calculateShipping([
    { productId: 'heavy-product', quantity: 24, largeCartonCount: 1, smallCartonCount: 0 },
  ], catalog, {
    largeCartonTareGrams: 500,
    smallCartonTareGrams: 50,
    businessDpdMaxTrays: 2,
    businessDpdShippingTiers: [{ maxWeightGrams: 31500, priceCents: 2799 }],
    shippingPricePerPalletCents: 8500,
    shippingTraysPerPallet: 64,
  }, { businessCustomer: true })

  assert.equal(shipping.shippingWeightGrams, 34100)
  assert.equal(shipping.shippingMethod, 'Spedition')
  assert.equal(shipping.shippingPriceCents, 8500)
})

test('calculates trusted order totals with VAT included in prices', () => {
  const order = validatePublicOrder({ ...validOrder, items: [{ productId: 'pfirsich-maracuja', quantity: 25 }] }, new Map([
    ['pfirsich-maracuja', { name: 'ZYRO Pfirsich Maracuja', cratePriceCents: 2400, unitWeightGrams: 500, active: true }],
  ]), ['vorkasse'])
  const priced = calculateOrderPricing(order, new Map([
    ['pfirsich-maracuja', { name: 'ZYRO Pfirsich Maracuja', unitWeightGrams: 500 }],
  ]), {
    shippingPriceCents: 500,
    shippingPricePerKgCents: 200,
    largeCartonTareGrams: 500,
    smallCartonTareGrams: 50,
    vatRate: 19,
    pricesIncludeVat: true,
  })

  assert.equal(priced.subtotalCents, 2500)
  assert.equal(priced.shippingPriceCents, 3300)
  assert.equal(priced.totalPriceCents, 5800)
  assert.equal(priced.vatCents, 926)
})

test('calculates trusted order totals with VAT added to prices', () => {
  const priced = calculateOrderPricing({ totalPriceCents: 2500, items: [] }, new Map(), {
    shippingPriceCents: 500,
    shippingPricePerKgCents: 0,
    largeCartonTareGrams: 0,
    smallCartonTareGrams: 0,
    vatRate: 19,
    pricesIncludeVat: false,
  })

  assert.equal(priced.subtotalCents, 2500)
  assert.equal(priced.shippingPriceCents, 500)
  assert.equal(priced.vatCents, 570)
  assert.equal(priced.totalPriceCents, 3570)
})

test('validates and normalizes brand contact messages', () => {
  const contact = validateContactMessage({ name: ' Ada ', email: 'ADA@example.org', subject: ' Anfrage ', message: 'Hallo, ich habe eine Frage.' })
  assert.deepEqual(contact, { name: 'Ada', email: 'ada@example.org', subject: 'Anfrage', message: 'Hallo, ich habe eine Frage.' })
  assert.throws(() => validateContactMessage({ ...contact, email: 'ungültig' }))
  assert.throws(() => validateContactMessage({ ...contact, message: 'zu kurz' }))
  assert.throws(() => validateContactMessage({ ...contact, name: 'x'.repeat(101) }))
})

test('accepts internationalized addresses in contact messages', () => {
  const contact = validateContactMessage({ name: 'Jörg Müller', email: 'JÖRG@BÜCHER.DE', subject: 'Frage', message: 'Grüße aus Köln, eine Frage.' })
  assert.equal(contact.email, 'jörg@xn--bcher-kva.de')
})

test('builds a branded confirmation email with packaging details and escaped customer data', () => {
  const email = buildOrderConfirmationEmail({
    order: {
      name: '<Max & Co>',
      paymentMethod: 'vorkasse',
      subtotalCents: 2856,
      shippingPriceCents: 690,
      vatRate: 19,
      vatCents: 566,
      totalPriceCents: 3546,
      pricesIncludeVat: true,
      items: [{
        productName: '<ZYRO & Citrus>',
        quantity: 25,
        largeCartonCount: 1,
        smallCartonCount: 1,
        lineTotalCents: 2856,
      }],
    },
    orderNumber: 'ZY-WEB-20261019-ABC123',
    paymentInfo: { accountHolder: 'ZYRO GmbH', iban: 'DE1234567890', reference: 'ZY-WEB-20261019-ABC123' },
  })

  assert.match(email.html, /BESTELLBESTÄTIGUNG/)
  assert.match(email.html, /ZY-WEB-20261019-ABC123/)
  assert.doesNotMatch(email.html, /Rechnung.*PDF|Rechnungsnummer/)
  assert.match(email.html, /1 24er-Trays · 1 Einzeldosen/)
  assert.match(email.html, /&lt;Max &amp; Co&gt;/)
  assert.match(email.html, /&lt;ZYRO &amp; Citrus&gt;/)
  assert.doesNotMatch(email.html, /<Max & Co>/)
  assert.match(email.text, /1 24er-Trays · 1 Einzeldosen/)
  assert.match(email.text, /DE1234567890/)
})

test('shows preorder and expected delivery date in the confirmation email', () => {
  const expectedDeliveryDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const email = buildOrderConfirmationEmail({
    order: {
      name: 'Max Mustermann',
      hasPreorderItems: true,
      paymentMethod: 'vorkasse',
      subtotalCents: 1200,
      shippingPriceCents: 690,
      vatRate: 19,
      vatCents: 302,
      totalPriceCents: 1890,
      pricesIncludeVat: true,
      items: [{
        productName: 'ZYRO Test',
        quantity: 12,
        largeCartonCount: 0,
        smallCartonCount: 12,
        lineTotalCents: 1200,
        isPreorder: true,
        expectedDeliveryDate,
      }],
    },
    orderNumber: 'ZY-WEB-20261019-ABC123',
    paymentInfo: { accountHolder: 'ZYRO GmbH', iban: 'DE1234567890', reference: 'ZY-WEB-20261019-ABC123' },
  })

  assert.match(email.text, /VORBESTELLUNG/)
  assert.match(email.html, /VORBESTELLUNG/)
  assert.match(email.text, /voraussichtliche Lieferung/)
  assert.match(email.html, /voraussichtliche Lieferung/)
})
