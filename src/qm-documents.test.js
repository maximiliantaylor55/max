import assert from 'node:assert/strict'
import test from 'node:test'
import { companyForQm, makeQmDocuments, qmGroups, renderQmSheet } from './qm-documents.js'

const company = companyForQm({
  name: 'Liberty Street Food GmbH',
  street: 'Birlenbacherstr 59',
  postalCode: '57078',
  city: 'Siegen',
  managingDirectors: 'Maximilian Brenner',
  registeredOffice: 'Offenbach am Main',
  registrationCourt: 'Amtsgericht Offenbach am Main',
  commercialRegister: 'HRB 58431',
  vatId: 'DE458399062',
  taxNumber: '044/238/25255',
}, { name: 'The Stillery', street: 'Herwijk 12', city: '1046 BC Amsterdam' })

test('builds all Behördenmappe templates with unique numbers in known groups', () => {
  const documents = makeQmDocuments(company)
  assert.equal(documents.length, 30)
  assert.equal(new Set(documents.map((doc) => doc.no)).size, documents.length)
  for (const doc of documents) assert.ok(qmGroups[doc.no[0]], doc.no)
})

test('maps company and bottler details into the form header data', () => {
  assert.equal(company.adresse, 'Birlenbacherstr 59, 57078 Siegen')
  assert.equal(company.register, 'Amtsgericht Offenbach am Main, HRB 58431')
  assert.equal(company.la, 'The Stillery, Herwijk 12, 1046 BC Amsterdam')
})

test('escapes company values in rendered sheets', () => {
  const unsafe = companyForQm({ name: '<img src=x onerror=alert(1)>' }, {})
  const [first] = makeQmDocuments(unsafe)
  const html = renderQmSheet(first, unsafe)
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('&lt;img'))
})
