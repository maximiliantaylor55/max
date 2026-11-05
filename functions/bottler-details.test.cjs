const test = require('node:test')
const assert = require('node:assert/strict')
const { defaultBottlerDetails, normalizeBottlerDetails, validateBottlerDetailsEntries } = require('./bottler-details.cjs')

test('validates and normalizes administrator bottler details', () => {
  const details = validateBottlerDetailsEntries([{
    id: 'global',
    name: '  Abfüllbetrieb GmbH ',
    street: ' Musterstraße 1 ',
    city: ' 12345 Musterstadt ',
  }], { role: 'admin' })
  assert.deepEqual(details, {
    id: 'global',
    name: 'Abfüllbetrieb GmbH',
    street: 'Musterstraße 1',
    city: '12345 Musterstadt',
  })
})

test('rejects non-admin changes and incomplete or oversized bottler details', () => {
  assert.throws(() => validateBottlerDetailsEntries([defaultBottlerDetails], { role: 'employee' }), /nur von einem Admin/)
  assert.throws(() => validateBottlerDetailsEntries([], { role: 'admin' }), /genau ein Lohnabfüller-Datensatz/)
  assert.throws(() => validateBottlerDetailsEntries([{ ...defaultBottlerDetails, street: '' }], { role: 'admin' }), /erforderlich/)
  assert.throws(() => validateBottlerDetailsEntries([{ ...defaultBottlerDetails, city: 'x'.repeat(101) }], { role: 'admin' }), /ungültig/)
})

test('fills omitted legacy fields with defaults', () => {
  assert.deepEqual(normalizeBottlerDetails({ name: 'Neu GmbH' }), {
    id: 'global',
    name: 'Neu GmbH',
    street: defaultBottlerDetails.street,
    city: defaultBottlerDetails.city,
  })
})
