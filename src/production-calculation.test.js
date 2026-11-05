import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateProductionCost } from './production-calculation.js'

const calculation = {
  batchBottles: '1000',
  ingredients: [
    { name: 'Zucker', amount: '10', unit: 'kg', unitPrice: '1.50' },
    { name: 'Saftkonzentrat', amount: '2', unit: 'kg', unitPrice: '8.25' },
  ],
  packaging: [{ name: 'Dose', amount: '1000', unit: 'Stück', unitPrice: '0.12' }],
  laborCost: '80',
  overheadCost: '20',
  targetMarginPercent: '40',
  vatRate: '19',
}

test('berechnet Chargenkosten, Dosen-/Traykosten, Verkaufspreis, Marge und Break-even', () => {
  const result = calculateProductionCost(calculation)
  assert.equal(result.ingredientCostCents, 3150)
  assert.equal(result.packagingCostCents, 12000)
  assert.equal(result.totalCostCents, 25150)
  assert.equal(result.unitCostCents, 25)
  assert.equal(result.crateCostCents, 604)
  assert.equal(result.targetSellingPriceNetCents, 42)
  assert.equal(result.targetSellingPriceGrossCents, 50)
  assert.equal(result.crateSellingPriceGrossCents, 1200)
  assert.equal(result.batchSellingPriceNetCents, 42000)
  assert.equal(result.batchSellingPriceGrossCents, 50000)
  assert.equal(result.batchVatCents, 8000)
  assert.equal(result.marginPercent, 40.11904761904762)
  assert.equal(result.batchProfitCents, 16850)
  assert.equal(result.breakEvenBottles, 373)
})

test('bezieht variable Kosten und Fixkosten in die Break-even-Menge ein', () => {
  const result = calculateProductionCost({
    batchBottles: '1',
    ingredients: [{ name: 'Zutat', amount: '1', unit: 'kg', unitPrice: '10' }],
    packaging: [],
    laborCost: '10',
    overheadCost: '0',
    targetMarginPercent: '0',
    vatRate: '0',
  })
  assert.equal(result.breakEvenBottles, 1)
})

test('akzeptiert Dezimalkommas und lässt leere Kostenpositionen aus', () => {
  const result = calculateProductionCost({
    batchBottles: '10',
    ingredients: [{ name: 'Aroma', amount: '0,5', unit: 'l', unitPrice: '2,00' }],
    packaging: [],
    laborCost: '',
    overheadCost: '',
    targetMarginPercent: '25',
    vatRate: '7',
  })
  assert.equal(result.ingredientCostCents, 100)
  assert.equal(result.totalCostCents, 100)
  assert.equal(result.targetSellingPriceGrossCents, 15)
})

test('rundet den Nettoverkaufspreis nicht unter die exakten Chargenkosten', () => {
  const result = calculateProductionCost({
    batchBottles: '3',
    ingredients: [{ name: 'Konzentrat', amount: '5', unit: 'g', unitPrice: '0.01' }],
    packaging: [],
    laborCost: '0',
    overheadCost: '0',
    targetMarginPercent: '0',
    vatRate: '0',
  })
  assert.equal(result.unitCostCents, 2)
  assert.equal(result.targetSellingPriceNetCents, 2)
  assert.ok(result.targetSellingPriceNetCents * result.batchBottles >= result.totalCostCents)
})

test('berechnet Traywerte mit der eingestellten Dosenanzahl', () => {
  const result = calculateProductionCost({ ...calculation, bottlesPerCrate: '12' })
  assert.equal(result.bottlesPerCrate, 12)
  assert.equal(result.crateCostCents, 302)
  assert.equal(result.crateSellingPriceNetCents, 504)
})

test('weist unvollständige, ungültige und kostenfreie Kalkulationen zurück', () => {
  assert.throws(() => calculateProductionCost({ ...calculation, batchBottles: '1.5' }), /ganze Zahl/)
  assert.throws(() => calculateProductionCost({ ...calculation, bottlesPerCrate: '1.5' }), /Traygröße/)
  assert.throws(() => calculateProductionCost({ ...calculation, targetMarginPercent: '100' }), /unter 100/)
  assert.throws(() => calculateProductionCost({ ...calculation, vatRate: '12' }), /Mehrwertsteuersatz/)
  assert.throws(() => calculateProductionCost({ ...calculation, ingredients: [{ name: '', amount: '1', unitPrice: '1' }] }), /Namen eintragen/)
  assert.throws(() => calculateProductionCost({
    batchBottles: '100',
    ingredients: [],
    packaging: [],
    laborCost: '0',
    overheadCost: '0',
    targetMarginPercent: '30',
    vatRate: '19',
  }), /mindestens eine Kostenposition/)
})
