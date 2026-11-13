import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateContractJob,
  contractMaterialNeeds,
  createContractJobForm,
  nextContractJobNumber,
  recipeCostPerDrinkLiter,
  validateContractJob,
} from './contract-manufacturing.js'

const rawMaterials = [
  { id: 'z', name: 'Zucker', unit: 'kg', pricePerUnit: '1' },
  { id: 'w', name: 'Wasser', unit: 'l', pricePerUnit: '0' },
]
// 10 l Getränk: 1 kg Zucker (1 €) + Wasser → 0,10 €/l
const drinkRecipe = {
  batchSize: '10 l',
  kind: 'Fertiges Getränk',
  items: [
    { rawMaterialId: 'z', name: 'Zucker', amount: '1000', unit: 'g' },
    { rawMaterialId: 'w', name: 'Wasser', amount: '9000', unit: 'ml' },
  ],
}
// 1 l Konzentrat (1 + 4): 0,5 kg Zucker → 0,50 €/l Konzentrat → 0,10 €/l Getränk
const concentrate = {
  batchSize: '1 l',
  kind: 'Konzentrat',
  dilution: '4',
  items: [
    { rawMaterialId: 'z', name: 'Zucker', amount: '500', unit: 'g' },
    { rawMaterialId: 'w', name: 'Wasser', amount: '500', unit: 'ml' },
  ],
}

test('Rohstoffkosten je Liter Getränk – auch aus Konzentrat', () => {
  assert.equal(Math.round(recipeCostPerDrinkLiter(drinkRecipe, rawMaterials).costPerLiter * 1000) / 1000, 0.1)
  assert.equal(Math.round(recipeCostPerDrinkLiter(concentrate, rawMaterials).costPerLiter * 1000) / 1000, 0.1)
  assert.equal(recipeCostPerDrinkLiter({ ...concentrate, dilution: '' }, rawMaterials), null)
})

test('kalkuliert Auftrag mit Verpackung, Lohn, Fixkosten und Aufschlag', () => {
  const job = {
    ...createContractJobForm(),
    quantity: '1000', containerSize: '330',
    packagingPerUnit: '0,10', labelPerUnit: '0', fillingPerUnit: '0,10', palletPerUnit: '0',
    setupCost: '100', labCost: '0', marginPercent: '20', vatRate: '19', recipeSource: 'eigen',
  }
  const calc = calculateContractJob(job, drinkRecipe, rawMaterials)
  assert.equal(calc.drinkLiters, 330)
  assert.equal(Math.round(calc.rawMaterialsCost * 100) / 100, 33)
  assert.equal(calc.packagingCost, 100)
  assert.equal(Math.round(calc.fillingCost * 100) / 100, 100)
  assert.equal(Math.round(calc.costTotal * 100) / 100, 333)
  assert.equal(Math.round(calc.netTotal * 100) / 100, 399.6)
  assert.equal(Math.round(calc.pricePerUnit * 10000) / 10000, 0.3996)
  assert.deepEqual(calc.warnings, [])
})

test('Beistellung durch den Auftraggeber und manuelle Kosten je Liter', () => {
  const base = { ...createContractJobForm(), quantity: '100', containerSize: '500', setupCost: '0', labCost: '0', marginPercent: '0', recipeSource: 'eigen' }
  const supplied = calculateContractJob({ ...base, rawMaterialsBy: 'kunde', packagingBy: 'kunde' }, drinkRecipe, rawMaterials)
  assert.equal(supplied.rawMaterialsCost, 0)
  assert.equal(supplied.packagingCost, 0)
  assert.deepEqual(supplied.materialNeeds, [])
  const manual = calculateContractJob({ ...base, rawMaterialCostPerLiter: '0,5' }, null, [])
  assert.equal(manual.rawMaterialsCost, 25)
  assert.equal(manual.rawCostSource, 'manuell')
})

test('Warnungen: fehlende Kosten und fehlende NDA bei Kundenrezeptur', () => {
  const calc = calculateContractJob({ ...createContractJobForm(), quantity: '10', recipeSource: 'kunde' }, null, [])
  assert.ok(calc.warnings.some((text) => text.includes('Keine Rohstoffkosten')))
  assert.ok(calc.warnings.some((text) => text.includes('NDA')))
})

test('Rohstoffbedarf wird auf die Auftragsmenge hochgerechnet', () => {
  // 1000 × 0,33 l = 330 l Getränk aus Konzentrat 1+4 → 66 l Konzentrat → 66 × 500 g Zucker = 33 kg
  const needs = contractMaterialNeeds(concentrate, 330)
  assert.deepEqual(needs[0], { name: 'Zucker', amount: 33, unit: 'kg' })
  assert.deepEqual(needs[1], { name: 'Wasser', amount: 33, unit: 'l' })
})

test('Auftragsnummern und Pflichtfelder', () => {
  const date = new Date('2026-11-13')
  assert.equal(nextContractJobNumber([], date), 'LH-2026-001')
  assert.equal(nextContractJobNumber([{ number: 'LH-2026-007' }, { number: 'LH-2025-020' }], date), 'LH-2026-008')
  assert.match(validateContractJob(createContractJobForm()), /Auftraggeber/)
  assert.equal(validateContractJob({ ...createContractJobForm(), clientName: 'X', productName: 'Y', quantity: '5' }), '')
})

test('Bemusterung: Musterkosten optional in der Kalkulation, Freigabe und Checkliste', async () => {
  const { createSample, approvedSample, checklistProgress, contractChecklist } = await import('./contract-manufacturing.js')
  const first = { ...createSample([]), cost: '40', status: 'Abgelehnt' }
  const second = { ...createSample([first]), cost: '35', status: 'Freigegeben', variant: 'V2 weniger süß' }
  assert.equal(second.round, 2)
  assert.equal(approvedSample([first, second]).variant, 'V2 weniger süß')
  const base = { ...createContractJobForm(), quantity: '100', setupCost: '0', labCost: '0', marginPercent: '0', recipeSource: 'eigen', rawMaterialCostPerLiter: '0', packagingPerUnit: '0', labelPerUnit: '0', fillingPerUnit: '0', palletPerUnit: '0', samples: [first, second] }
  assert.equal(calculateContractJob(base).costTotal, 75)
  assert.equal(calculateContractJob({ ...base, billSamples: false }).costTotal, 0)
  assert.ok(calculateContractJob({ ...base, status: 'Angebot erstellt', samples: [first] }).warnings.some((text) => text.includes('Muster')))
  assert.deepEqual(checklistProgress({ nda: true, spec: true }), { done: 2, total: contractChecklist.length })
})
