const assert = require('node:assert/strict')
const test = require('node:test')
const { validateLabTestEntry, validateLabTestsUpdate } = require('./lab-tests.cjs')

const employee = { id: 'employee-1', name: 'Max Mitarbeiter', role: 'mitarbeiter' }
const entry = {
  id: 'lab-test-1',
  sampleCode: 'B',
  recipeId: 'recipe-1',
  recipeName: 'ZYRO Pfirsich Maracuja',
  peachFlavorGrams: 0.3,
  passionFruitFlavorGrams: 0.35,
  phValue: null,
  fruitiness: 5,
  naturalness: 6,
  aftertaste: 'medium',
  sweetness: 'balanced',
  observations: 'Leicht tropisch.',
  createdAt: '2026-10-29T10:00:00.000Z',
  createdById: employee.id,
  createdByName: employee.name,
}

test('validates a test protocol with optional pH measurement', () => {
  assert.doesNotThrow(() => validateLabTestEntry(entry))
  assert.doesNotThrow(() => validateLabTestEntry({ ...entry, phValue: 3.42 }))
})

test('rejects invalid sensory ratings, flavor quantities, and unexpected fields', () => {
  assert.throws(() => validateLabTestEntry({ ...entry, fruitiness: 11 }), /ungültig/)
  assert.throws(() => validateLabTestEntry({ ...entry, peachFlavorGrams: -0.1 }), /ungültig/)
  assert.throws(() => validateLabTestEntry({ ...entry, phValue: 14.1 }), /ungültig/)
  assert.throws(() => validateLabTestEntry({ ...entry, unexpected: true }), /ungültig/)
})

test('employees can append protocols but cannot edit, delete, or impersonate another user', () => {
  assert.deepEqual(validateLabTestsUpdate([], [entry], employee), [entry])
  assert.throws(() => validateLabTestsUpdate([entry], [], employee), /nicht gelöscht/)
  assert.throws(() => validateLabTestsUpdate([entry], [{ ...entry, observations: 'geändert' }], employee), /nicht verändert/)
  assert.throws(() => validateLabTestsUpdate([], [{ ...entry, createdById: 'someone-else' }], employee), /angemeldeten Benutzer/)
})
