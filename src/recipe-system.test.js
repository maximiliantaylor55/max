import assert from 'node:assert/strict'
import test from 'node:test'
import { rawMaterialCatalog } from './raw-material-catalog.js'
import {
  catalogEntryToRawMaterial,
  matchedAlias,
  missingCatalogEntries,
  rawMaterialLabel,
  searchCatalog,
  calculateRecipe,
  convertAmount,
  parseAmount,
  parseBatchLiters,
  parseIngredientText,
  recipeItemsToText,
  searchRawMaterials,
  validateRawMaterial,
} from './recipe-system.js'

const rawMaterials = [
  { id: 'rm-1', name: 'Zucker', articleNumber: 'Z-100', supplier: 'Südzucker', unit: 'kg', pricePerUnit: '1,20' },
  { id: 'rm-2', name: 'Zitronensaftkonzentrat', supplier: 'Döhler', unit: 'l', pricePerUnit: '4' },
  { id: 'rm-3', name: 'Wasser', unit: 'l', pricePerUnit: '0' },
  { id: 'rm-4', name: 'Koffein', unit: 'kg' },
]

test('liest deutsche Zahlen und Batchgrößen', () => {
  assert.equal(parseAmount('12.500'), 12500)
  assert.equal(parseAmount('2,1'), 2.1)
  assert.equal(parseAmount('1.234,5'), 1234.5)
  assert.ok(Number.isNaN(parseAmount('abc')))
  assert.equal(parseBatchLiters('12.500ml'), 12.5)
  assert.equal(parseBatchLiters('10 l'), 10)
  assert.equal(parseBatchLiters('ca. viel'), null)
})

test('rechnet Einheiten nur innerhalb derselben Dimension um', () => {
  assert.equal(convertAmount('320', 'g', 'kg'), 0.32)
  assert.equal(convertAmount('2,1', 'l', 'ml'), 2100)
  assert.equal(convertAmount('5', 'g', 'l'), null)
  assert.equal(convertAmount('3', 'Stück', 'Stück'), 3)
})

test('berechnet Anteil und Kosten je Charge', () => {
  const result = calculateRecipe([
    { rawMaterialId: 'rm-3', amount: '7.400', unit: 'ml' },
    { rawMaterialId: 'rm-2', amount: '2.100', unit: 'ml' },
    { rawMaterialId: 'rm-1', amount: '500', unit: 'g' },
  ], rawMaterials, '10.000ml')
  assert.equal(result.totalBase, 10000)
  assert.equal(result.rows[0].share, 74)
  assert.equal(result.rows[2].share, 5)
  assert.equal(result.rows[1].cost, 8.4)
  assert.equal(result.rows[2].cost, 0.6)
  assert.ok(Math.abs(result.totalCost - 9) < 1e-9)
  assert.equal(result.costComplete, true)
  assert.ok(Math.abs(result.costPerLiter - 0.9) < 1e-9)
})

test('meldet fehlende Preise statt falsche Kosten', () => {
  const result = calculateRecipe([{ rawMaterialId: 'rm-4', name: 'Koffein', amount: '180', unit: 'mg' }], rawMaterials)
  assert.equal(result.costComplete, false)
  assert.deepEqual(result.missingPrices, ['Koffein'])
  assert.equal(result.rows[0].share, 100)
})

test('sucht Rohstoffe nach Name, Artikelnummer und Lieferant', () => {
  assert.deepEqual(searchRawMaterials(rawMaterials, 'zit').map((entry) => entry.id), ['rm-2'])
  assert.deepEqual(searchRawMaterials(rawMaterials, 'z-100').map((entry) => entry.id), ['rm-1'])
  assert.deepEqual(searchRawMaterials(rawMaterials, 'döhler').map((entry) => entry.id), ['rm-2'])
})

test('wandelt alte Freitext-Zutaten um und zurück', () => {
  const items = parseIngredientText('Wasser: 7.400ml\nZucker: 320g\nNaturfarben: 40ml', rawMaterials)
  assert.equal(items[0].rawMaterialId, 'rm-3')
  assert.equal(items[1].amount, '320')
  assert.equal(items[1].unit, 'g')
  assert.equal(items[2].rawMaterialId, '')
  assert.equal(recipeItemsToText([{ name: 'Zucker', amount: '320', unit: 'g', note: 'zuletzt' }]), 'Zucker: 320 g (zuletzt)')
})

test('Katalog: findet E-Nummern in jeder Schreibweise und blendet vorhandene Rohstoffe aus', () => {
  assert.equal(searchCatalog([], 'e330')[0].name, 'Citronensäure')
  assert.equal(searchCatalog([], 'E 330')[0].eNumber, 'E 330')
  assert.equal(searchCatalog([], 'citronen')[0].eNumber, 'E 330')
  assert.ok(searchCatalog([], 'koffein').some((entry) => entry.name === 'Koffein'))
  assert.equal(rawMaterialCatalog.some((entry) => entry.eNumber === 'E 171'), false)
  const own = [{ id: 'x', name: 'Zitronensäure', eNumber: 'E330' }]
  assert.equal(searchCatalog(own, 'e330').length, 0)
  const created = catalogEntryToRawMaterial(searchCatalog([], 'e211')[0], 'rm-9', 'jetzt')
  assert.equal(created.eNumber, 'E 211')
  assert.equal(created.category, 'Konservierungsstoff')
  assert.equal(rawMaterialLabel(created), 'Natriumbenzoat (E 211)')
  assert.equal(searchRawMaterials([created], 'e 211')[0].id, 'rm-9')
  assert.ok(missingCatalogEntries(own).length > 300)
})

test('Katalog: findet Alltagsnamen wie Zitronensäure, Vitamin C, Natron, Stevia', () => {
  assert.equal(searchCatalog([], 'zitronensäure')[0].eNumber, 'E 330')
  assert.ok(searchCatalog([], 'Vitamin C').some((entry) => entry.eNumber === 'E 300'))
  assert.equal(searchCatalog([], 'natron')[0].eNumber, 'E 500')
  assert.equal(searchCatalog([], 'kohlensäure')[0].eNumber, 'E 290')
  assert.ok(searchCatalog([], 'stevia').every((entry) => entry.eNumber.startsWith('E 960')))
  assert.equal(matchedAlias(searchCatalog([], 'zitronensäure')[0], 'zitronensäure'), 'Zitronensäure')
  // Früher übernommener Rohstoff wird über den Alltagsnamen gefunden und im Katalog ausgeblendet.
  const own = [catalogEntryToRawMaterial(searchCatalog([], 'e330')[0], 'rm-1', 'jetzt')]
  assert.equal(searchRawMaterials(own, 'zitronensäure')[0].id, 'rm-1')
  assert.equal(searchCatalog(own, 'zitronensäure').length, 0)
  assert.equal(searchCatalog([{ id: 'x', name: 'Zitronensäure' }], 'e330').length, 0)
})

test('prüft Rohstoff-Eingaben', () => {
  assert.match(validateRawMaterial({ name: '' }), /Namen/)
  assert.match(validateRawMaterial({ name: 'zucker' }, rawMaterials), /bereits/)
  assert.equal(validateRawMaterial({ name: 'zucker' }, rawMaterials, 'rm-1'), '')
  assert.match(validateRawMaterial({ name: 'Neu', pricePerUnit: 'x' }), /Preis/)
})

test('füllt Wasser automatisch auf die Batchgröße auf', async () => {
  const { applyFillUp, resolveFillUp } = await import('./recipe-system.js')
  const items = [
    { id: 'a', rawMaterialId: 'rm-1', name: 'Zucker', amount: '5', unit: 'g' },
    { id: 'b', rawMaterialId: 'rm-3', name: 'Wasser', amount: '', unit: 'ml', fillUp: true },
    { id: 'c', rawMaterialId: 'rm-2', name: 'Zitronensaftkonzentrat', amount: '1,5', unit: 'ml' },
  ]
  const fill = resolveFillUp(items, '100ml')
  assert.equal(fill.amount, 93.5)
  assert.equal(fill.error, '')
  const calc = calculateRecipe(items, rawMaterials, '100ml')
  assert.equal(calc.totalBase, 100)
  assert.equal(calc.rows[1].resolvedAmount, 93.5)
  assert.equal(applyFillUp(items, '100ml')[1].amount, '93,5')
  assert.equal(resolveFillUp(items, '1 l').amount, 993.5)
  assert.match(resolveFillUp(items, '').error, /Batchgröße fehlt/)
  assert.match(resolveFillUp(items, '5ml').error, /größer/)
  assert.match(recipeItemsToText(applyFillUp(items, '100ml')), /Wasser: 93,5 ml \(auffüllen auf Batchgröße\)/)
})

test('trägt Richtpreise nur bei fehlenden Preisen ein und rechnet die Einheit um', async () => {
  const { fillReferencePrices, referencePriceFor } = await import('./recipe-system.js')
  const list = [
    { id: 'x1', name: 'Citronensäure', eNumber: 'E 330', unit: 'kg', pricePerUnit: '' },
    { id: 'x2', name: 'Sucralose', eNumber: 'E 955', unit: 'g', pricePerUnit: '' },
    { id: 'x3', name: 'Zucker (Saccharose)', unit: 'kg', pricePerUnit: '1,05' },
    { id: 'x4', name: 'Geheimzutat', unit: 'kg', pricePerUnit: '' },
  ]
  assert.equal(referencePriceFor(list[0]), 2)
  assert.equal(referencePriceFor(list[1]), 0.06)
  const { list: next, updated } = fillReferencePrices(list, 'now')
  assert.deepEqual(updated, ['Citronensäure', 'Sucralose'])
  assert.equal(next[0].pricePerUnit, '2')
  assert.equal(next[0].priceSource, 'Richtwert')
  assert.equal(next[2].pricePerUnit, '1,05')
  assert.equal(next[3].pricePerUnit, '')
  assert.deepEqual(fillReferencePrices(list, 'now', ['x2']).updated, ['Sucralose'])
})

test('Batchgröße mit Einheit und Konzentrat-Verdünnung', async () => {
  const { splitBatchSize, joinBatchSize, dilutionFactor } = await import('./recipe-system.js')
  assert.deepEqual(splitBatchSize('12.500ml'), { amount: '12.500', unit: 'ml' })
  assert.deepEqual(splitBatchSize('10 l'), { amount: '10', unit: 'l' })
  assert.equal(joinBatchSize('1,5', 'l'), '1,5 l')
  assert.equal(parseBatchLiters(joinBatchSize('1,5', 'l')), 1.5)
  assert.equal(joinBatchSize('', 'ml'), '')
  assert.equal(dilutionFactor('Fertiges Getränk', '4'), 1)
  assert.equal(dilutionFactor('Konzentrat', '4'), 5)
  assert.equal(dilutionFactor('Konzentrat', ''), null)
})

test('Katalog: Aromasorten sind mit Richtpreis auffindbar', () => {
  for (const [query, expected] of [['Pfirsich', 'Natürliches Pfirsicharoma'], ['Yuzu', 'Natürliches Yuzuaroma'], ['Maracuja aroma', 'Natürliches Maracujaaroma'], ['Peach', 'Natürliches Pfirsicharoma']]) {
    const hit = searchCatalog([], query, 10).find((entry) => entry.name === expected)
    assert.ok(hit, `${query} → ${expected}`)
    assert.ok(hit.referencePrice > 0)
  }
})
