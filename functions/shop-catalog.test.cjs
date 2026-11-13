const test = require('node:test')
const assert = require('node:assert/strict')
const { buildDesktopCatalog, cleanNutritionValues, parseNutritionText, tierPercent, discountedCratePrice } = require('./shop-catalog.cjs')
const { validatePublicOrder } = require('./order-validation.cjs')

const desktop = [
  { sku: 'ZYR-PM-001', name: 'Pfirsich Maracuja', shopActive: true, shopCratePrice: 28.56, weightKg: 0.55, availableBottles: 100, shopTiers: [{ minQuantity: 48, percent: 5 }, { minQuantity: 240, percent: 10 }] },
  { sku: 'ZYR-X', name: 'Nicht im Shop', shopActive: false, shopCratePrice: 10, weightKg: 1 },
  { sku: 'ZYR-NOW', name: 'Ohne Gewicht', shopActive: true, shopCratePrice: 10 },
]

test('nur freigegebene, vollständige Artikel kommen in den Shop', () => {
  const catalog = buildDesktopCatalog(desktop)
  assert.equal(catalog.length, 1)
  assert.equal(catalog[0].id, 'zyr-pm-001')
  assert.equal(catalog[0].cratePriceCents, 2856)
  assert.equal(catalog[0].unitWeightGrams, 550)
  assert.equal(catalog[0].stock, 100)
})

test('berechnet den Traypreis immer für 24 Dosen', () => {
  const [product] = buildDesktopCatalog([{
    ...desktop[0],
    shopCratePrice: 0,
    unitPrice: 1,
    bottlesPerCase: 12,
  }])
  assert.equal(product.cratePriceCents, 2856)
})

test('Shop-Beschreibung weist alte 330-ml-Angaben als 500-ml-Dose aus', () => {
  const [product] = buildDesktopCatalog([{ ...desktop[0], volume: '330ml' }])
  assert.match(product.description, /500ml Dose/)
  assert.match(product.description, /24er-Tray/)
})

test('Shop-Katalog übernimmt mehrere gültige Bilder und unterstützt alte Einzelbilder', () => {
  const first = 'data:image/jpeg;base64,Zmlyc3Q='
  const second = 'data:image/png;base64,c2Vjb25k'
  const [withGallery, legacy] = buildDesktopCatalog([
    { ...desktop[0], shopImages: [first, second, first, 'invalid'] },
    { ...desktop[0], sku: 'ZYR-LEGACY', shopImage: second },
  ])
  assert.deepEqual(withGallery.images, [first, second])
  assert.equal(withGallery.image, first)
  assert.deepEqual(legacy.images, [second])
  assert.equal(legacy.image, second)
})

test('Staffelpreise greifen ab der Mindestmenge', () => {
  const [product] = buildDesktopCatalog(desktop)
  assert.equal(tierPercent(product.tiers, 24), 0)
  assert.equal(tierPercent(product.tiers, 48), 5)
  assert.equal(tierPercent(product.tiers, 300), 10)
  assert.equal(discountedCratePrice(2000, product.tiers, 240), 1800)
})

test('Shop-Katalog übernimmt nur gültige strukturierte Nährwerte', () => {
  const [product] = buildDesktopCatalog([{
    ...desktop[0],
    shopNutritionValues: {
      energyKj: '42',
      energyKcal: '10,5',
      fat: '0.2',
      salt: '-1',
      unknown: '999',
    },
  }])
  assert.deepEqual(product.nutritionValues, { energyKj: '42', energyKcal: '10.5', fat: '0.2' })
  assert.deepEqual(cleanNutritionValues(['invalid']), {})
})

test('Shop-Katalog wandelt ältere Nährwerttexte in Tabellenwerte um', () => {
  const values = parseNutritionText(`Durchschnittliche Nährwerte
Je 100 ml

Energie
5 kJ / 1 kcal

Fett
0 g

davon gesättigte Fettsäuren
0 g

Kohlenhydrate
1,2 g

davon Zucker
1 g

Eiweiß
0 g

Salz
0 g`)
  assert.deepEqual(values, {
    energyKj: '5',
    energyKcal: '1',
    fat: '0',
    saturates: '0',
    carbohydrates: '1.2',
    sugars: '1',
    protein: '0',
    salt: '0',
  })
})

test('Bestellung nutzt Staffelpreis und prüft den Bestand', () => {
  const catalog = new Map(buildDesktopCatalog(desktop).map((product) => [product.id, product]))
  const base = { name: 'A', email: 'a@b.de', address: 'Weg 1', postalCode: '12345', city: 'Ort', paymentMethod: 'vorkasse', privacyNoticeAcknowledged: true }
  const order = validatePublicOrder({ ...base, items: [{ productId: 'zyr-pm-001', quantity: 48 }] }, catalog, ['vorkasse'])
  assert.equal(order.totalPriceCents, 2 * Math.round(2856 * 0.95))
  assert.throws(() => validatePublicOrder({ ...base, items: [{ productId: 'zyr-pm-001', quantity: 101 }] }, catalog, ['vorkasse']), /auf Lager/)
})

test('Shop-Katalog aktiviert Vorbestellungen nur mit gültigem zukünftigem Lieferdatum', () => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const [enabled, missingDate, pastDate] = buildDesktopCatalog([
    { ...desktop[0], availableBottles: 0, shopPreorderEnabled: true, shopExpectedDeliveryDate: tomorrow },
    { ...desktop[0], sku: 'ZYR-MISSING-DATE', availableBottles: 0, shopPreorderEnabled: true },
    { ...desktop[0], sku: 'ZYR-PAST-DATE', availableBottles: 0, shopPreorderEnabled: true, shopExpectedDeliveryDate: '2000-01-01' },
  ])
  assert.equal(enabled.preorderEnabled, true)
  assert.equal(enabled.expectedDeliveryDate, tomorrow)
  assert.equal(missingDate.preorderEnabled, false)
  assert.equal(pastDate.preorderEnabled, false)
})

test('marks mix trays as tray-only articles', () => {
  const [mix] = buildDesktopCatalog([{ name: 'ZYRO Mix-Tray', sku: 'ZYR-MIX-24', unitPrice: '1.60', weightKg: '0.54', shopActive: true, shopTrayOnly: true, category: 'Mix-Tray' }])
  assert.equal(mix.trayOnly, true)
  assert.equal(mix.category, 'Mix-Tray')
  const [single] = buildDesktopCatalog([{ name: 'ZYRO Pfirsich', sku: 'ZYR-PM', unitPrice: '1.60', weightKg: '0.54', shopActive: true }])
  assert.equal(single.trayOnly, false)
})

test('never sells shipping articles and ignores per-product shipping prices', () => {
  const catalog = buildDesktopCatalog([
    { name: 'Versand DPD', sku: 'VERSAND', unitPrice: '5.00', weightKg: '0.1', shopActive: true, category: 'Versand' },
    { name: 'ZYRO Pfirsich', sku: 'ZYR-PM', unitPrice: '1.60', weightKg: '0.54', shopActive: true, shopShippingUnit: '1.5', shopShippingTray: '6' },
  ])
  assert.equal(catalog.length, 1)
  assert.equal(catalog[0].shippingUnitCents, undefined)
  assert.equal(catalog[0].shippingTrayCents, undefined)
})
