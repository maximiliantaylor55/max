const test = require('node:test')
const assert = require('node:assert/strict')
const { validateElsterSetupEntries } = require('./elster-validation.cjs')

const setup = {
  id: 'setup',
  businessName: 'ZYRO GmbH',
  taxNumber: '123/456/78901',
  taxOffice: 'Finanzamt Berlin',
  federalState: 'Berlin',
  filingPeriod: 'monthly',
  developerStatus: 'not-started',
  manufacturerId: '',
  ericVersion: '',
}

test('accepts ELSTER preparation data for an admin', () => {
  assert.doesNotThrow(() => validateElsterSetupEntries([], [setup], { role: 'admin' }))
})

test('restricts ELSTER preparation data to admins', () => {
  assert.throws(() => validateElsterSetupEntries([], [setup], { role: 'mitarbeiter', permissions: ['finanzen'] }), /nur von einem Admin/)
})

test('rejects invalid ELSTER fields, unexpected values, and extra credentials', () => {
  assert.throws(() => validateElsterSetupEntries([], [{ ...setup, taxNumber: 'x'.repeat(41) }], { role: 'admin' }), /ungültig/)
  assert.throws(() => validateElsterSetupEntries([], [{ ...setup, filingPeriod: 'yearly' }], { role: 'admin' }), /ungültig/)
  assert.throws(() => validateElsterSetupEntries([], [{ ...setup, password: 'secret' }], { role: 'admin' }), /ungültig/)
  assert.throws(() => validateElsterSetupEntries([], [setup, setup], { role: 'admin' }), /einzelne Konfiguration/)
})

test('allows an admin to clear ELSTER preparation data', () => {
  assert.doesNotThrow(() => validateElsterSetupEntries([setup], [], { role: 'admin' }))
})
