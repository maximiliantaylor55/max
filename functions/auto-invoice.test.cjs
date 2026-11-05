const assert = require('node:assert/strict')
const test = require('node:test')
const zlib = require('node:zlib')
const { buildInvoicePdf, calculateInvoiceTotals, createInvoiceFromOrder } = require('./auto-invoice.cjs')
const { buildDesktopCatalog } = require('./shop-catalog.cjs')

const order = {
  id: 'order-1',
  kind: 'kundenauftrag',
  number: 'KA-2026-0001',
  recipient: 'Test GmbH',
  recipientEmail: 'kunde@example.com',
  recipientAddress: 'Weg 1\n12345 Stadt',
  items: [{ productId: 'p1', productName: 'ZYRO Cola', quantity: 24, unitPrice: 1 }],
  vatRate: 19,
}

test('Rechnung wird einmal pro Auftrag erzeugt und fortlaufend nummeriert', () => {
  const documents = [{ id: 'old', kind: 'rechnung', number: 'RE-2026-0004' }]
  const first = createInvoiceFromOrder({ order, documents, today: new Date('2026-05-01') })
  assert.equal(first.created, true)
  assert.equal(first.invoice.number, 'RE-2026-0005')
  const again = createInvoiceFromOrder({
    order: { ...order, invoiceDocumentId: first.invoice.id },
    documents: [first.invoice, ...documents],
  })

  test('Rechnung verwendet abweichende Rechnungsdaten und die Kunden-USt-IdNr.', () => {
    const { invoice } = createInvoiceFromOrder({
      order: {
        ...order,
        billingRecipient: 'Rechnungs GmbH',
        billingEmail: 'buchhaltung@example.com',
        billingAddress: 'Rechnungsweg 9\n54321 Rechnungsort',
        customerVatId: 'DE123456789',
      },
      documents: [],
    })
    assert.equal(invoice.recipient, 'Rechnungs GmbH')
    assert.equal(invoice.recipientEmail, 'buchhaltung@example.com')
    assert.equal(invoice.recipientAddress, 'Rechnungsweg 9\n54321 Rechnungsort')
    assert.equal(invoice.recipientVatId, 'DE123456789')
  })
  assert.equal(again.created, false)
  assert.equal(again.invoice.id, first.invoice.id)
})

test('Summen berücksichtigen Pfand und Webshop-Beträge', () => {
  const totals = calculateInvoiceTotals(order, [{ id: 'p1', depositPerUnit: 0.25 }])
  assert.equal(totals.netTotal, 24)
  assert.equal(totals.grossTotal, 28.56)
  assert.equal(totals.depositTotal, 6)
  const web = calculateInvoiceTotals({ ...order, websiteInvoiceTotals: { netTotal: 30, taxTotal: 5.7, grossTotal: 35.7 } })
  assert.equal(web.extraNet, 6)
})

test('PDF wird erzeugt', async () => {
  const { invoice } = createInvoiceFromOrder({ order, documents: [] })
  const pdf = await buildInvoicePdf(invoice, [], {
    name: 'Neue Rechnungsfirma GmbH',
    street: 'Neue Straße 8',
    postalCode: '54321',
    city: 'Neustadt',
    country: 'Deutschland',
    email: 'rechnung@example.com',
    phone: '+49 123 456',
    website: 'https://example.com',
    taxNumber: '123/456/78901',
    vatId: 'DE123456789',
    iban: 'DE89370400440532013000',
    managingDirectors: 'Max Mustermann und Erika Musterfrau',
    legalForm: 'GmbH',
    registeredOffice: 'Siegen',
    commercialRegister: 'HRB 12345',
    registrationCourt: 'Amtsgericht Siegen',
  })
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
  const pdfStreams = [...pdf.toString('latin1').matchAll(/\/Filter \/FlateDecode[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/g)]
  const invoiceText = pdfStreams
    .map(([, stream]) => zlib.inflateSync(Buffer.from(stream, 'latin1')).toString('latin1'))
    .join('\n')
  const readableInvoiceText = invoiceText
    .replace(/<([0-9a-f]+)>/gi, (_match, hex) => Buffer.from(hex, 'hex').toString('latin1'))
    .replace(/\s-?\d+\s/g, ' ')
  const compactInvoiceText = readableInvoiceText.replace(/([a-z]) (?=[a-z])/g, '$1')
  assert.match(readableInvoiceText, /Neue Rechnungsfirma GmbH/i)
  assert.match(readableInvoiceText, /Geschäftsführer/)
  assert.match(compactInvoiceText, /Max Mustermann/)
  assert.match(compactInvoiceText, /Erika Musterfrau/)
})

test('Manueller Traypreis hat Vorrang, sonst Einzelpreis netto', () => {
  const base = { name: 'ZYRO Cola', sku: 'cola', shopActive: true, unitPrice: 1.9, weightKg: '0,75', bottlesPerCase: 24 }
  assert.equal(buildDesktopCatalog([{ ...base, shopCratePrice: '29,95' }])[0].cratePriceCents, 2995)
  assert.equal(buildDesktopCatalog([base])[0].cratePriceCents, 5426)
})

test('Shop-Katalog akzeptiert Zahlen mit Komma und Textwerte', () => {
  const catalog = buildDesktopCatalog([{
    name: 'ZYRO Cola', sku: 'cola', shopActive: true, shopCratePrice: '28,56', weightKg: '0,75', availableBottles: '48',
  }])
  assert.equal(catalog.length, 1)
  assert.equal(catalog[0].cratePriceCents, 2856)
  assert.equal(catalog[0].unitWeightGrams, 750)
  assert.equal(catalog[0].stock, 48)
})
