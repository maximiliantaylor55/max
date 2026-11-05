const assert = require('node:assert/strict')
const test = require('node:test')
const { defaultCompanyDetails, validateCompanyDetailsEntries } = require('./company-details.cjs')

test('validates administrator invoice company details', () => {
  const updated = {
    ...defaultCompanyDetails,
    name: 'Neue Firma GmbH',
    street: 'Musterstraße 1',
    postalCode: '12345',
    city: 'Musterstadt',
    iban: 'DE89370400440532013000',
    managingDirectors: 'Max Mustermann und Erika Musterfrau',
    legalForm: 'GmbH',
    registeredOffice: 'Siegen',
    commercialRegister: 'HRB 12345',
    registrationCourt: 'Amtsgericht Siegen',
  }
  assert.deepEqual(validateCompanyDetailsEntries([updated], { role: 'admin' }), updated)
})

test('preserves the Unicode company email for display on invoices', () => {
  const details = validateCompanyDetailsEntries([{
    ...defaultCompanyDetails,
    email: 'info@zyro-getränke.de',
  }], { role: 'admin' })
  assert.equal(details.email, 'info@zyro-getränke.de')
})

test('fills optional legal fields when older app versions save company details', () => {
  const legacy = { ...defaultCompanyDetails }
  delete legacy.managingDirectors
  delete legacy.legalForm
  delete legacy.registeredOffice
  delete legacy.commercialRegister
  delete legacy.registrationCourt
  delete legacy.documentLayout

  const normalized = validateCompanyDetailsEntries([legacy], { role: 'admin' })
  assert.equal(normalized.managingDirectors, '')
  assert.equal(normalized.commercialRegister, '')
  assert.equal(normalized.documentLayout, 'zyro')
})

test('accepts supported document layouts and rejects unknown layouts', () => {
  for (const documentLayout of ['zyro', 'modern', 'classic']) {
    assert.equal(
      validateCompanyDetailsEntries([{ ...defaultCompanyDetails, documentLayout }], { role: 'admin' }).documentLayout,
      documentLayout,
    )
  }
  assert.throws(
    () => validateCompanyDetailsEntries([{ ...defaultCompanyDetails, documentLayout: 'unknown' }], { role: 'admin' }),
    /Dokumentlayout ist ungültig/,
  )
})

test('rejects invalid roles, incomplete company addresses, and malformed invoice details', () => {
  assert.throws(() => validateCompanyDetailsEntries([defaultCompanyDetails], { role: 'mitarbeiter' }), /nur von einem Admin/)
  assert.throws(() => validateCompanyDetailsEntries([{ ...defaultCompanyDetails, street: '' }], { role: 'admin' }), /Firmenname, Straße, PLZ, Ort und Land/)
  assert.throws(() => validateCompanyDetailsEntries([{ ...defaultCompanyDetails, email: 'ungueltig' }], { role: 'admin' }), /E-Mail-Adresse ist ungültig/)
  assert.throws(() => validateCompanyDetailsEntries([{ ...defaultCompanyDetails, iban: 'DE12' }], { role: 'admin' }), /IBAN ist ungültig/)
  assert.throws(() => validateCompanyDetailsEntries([{ ...defaultCompanyDetails, name: 'x'.repeat(121) }], { role: 'admin' }), /Firmenfeld/)
  assert.throws(() => validateCompanyDetailsEntries([{ ...defaultCompanyDetails, managingDirectors: 'x'.repeat(301) }], { role: 'admin' }), /Firmenfeld/)
  assert.throws(() => validateCompanyDetailsEntries([defaultCompanyDetails, defaultCompanyDetails], { role: 'admin' }), /genau ein Firmendatensatz/)
})
