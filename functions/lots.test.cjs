const test = require('node:test')
const assert = require('node:assert/strict')
const { addLot, allocateFefo, normalizeLotInput } = require('./lots.cjs')

test('Wareneingang legt Chargen an und fasst gleiche zusammen', () => {
  const product = { availableBottles: 0 }
  addLot(product, { lot: 'A1', bestBefore: '2027-05-01', quantity: 10 })
  addLot(product, { lot: 'A1', bestBefore: '2027-05-01', quantity: 5 })
  addLot(product, { lot: 'B1', bestBefore: '2027-01-01', quantity: 20 })
  assert.equal(product.lots.length, 2)
  assert.equal(product.lots.find((entry) => entry.lot === 'A1').quantity, 15)
  assert.equal(product.lotNumber, 'B1')
  assert.equal(product.bestBefore, '2027-01-01')
})

test('FEFO bucht die Charge mit dem frühesten MHD zuerst', () => {
  const product = { lots: [
    { lot: 'A1', bestBefore: '2027-05-01', quantity: 10 },
    { lot: 'B1', bestBefore: '2027-01-01', quantity: 6 },
    { lot: 'C1', bestBefore: '', quantity: 50 },
  ] }
  const picked = allocateFefo(product, 12)
  assert.deepEqual(picked.map((entry) => [entry.lot, entry.quantity]), [['B1', 6], ['A1', 6]])
  assert.equal(product.lots.find((entry) => entry.lot === 'A1').quantity, 4)
  assert.equal(product.lots.some((entry) => entry.lot === 'B1'), false)
})

test('Ungültiges MHD wird abgelehnt', () => {
  assert.throws(() => normalizeLotInput('A', '31.12.2027'))
  assert.deepEqual(normalizeLotInput(' A ', ''), { lot: 'A', bestBefore: '' })
})
