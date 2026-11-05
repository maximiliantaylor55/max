import assert from 'node:assert/strict'
import test from 'node:test'
import { webcrypto } from 'node:crypto'
import {
  createHrEmployee,
  decryptHrSensitiveData,
  encryptHrSensitiveData,
  normalizeSocialSecurityNumber,
} from './hr-sensitive-data.js'

globalThis.crypto ||= webcrypto

test('normalizes and checks the German SV-number format', () => {
  assert.equal(normalizeSocialSecurityNumber('15 070649 c 103'), '15070649C103')
  assert.throws(() => normalizeSocialSecurityNumber('invalid'), /deutschen Format/)
  assert.throws(() => normalizeSocialSecurityNumber('15 070649 C 102'), /Prüfziffer/)
})

test('encrypts employee records and SV numbers, decrypting only with the matching passphrase', async () => {
  const entries = {
    employees: [{ id: 'employee_1', name: 'Alex Beispiel', status: 'Aktiv' }],
    svNumbers: { employee_1: '15 070649 C 103' },
  }
  const envelope = await encryptHrSensitiveData(entries, 'ein-starkes-schutzpasswort')

  assert.equal(envelope.algorithm, 'AES-GCM')
  assert.equal(envelope.kdf, 'PBKDF2-SHA-256')
  assert.equal(envelope.ciphertext.includes('15070649C103'), false)
  assert.equal(envelope.ciphertext.includes('Alex Beispiel'), false)
  assert.deepEqual(await decryptHrSensitiveData(envelope, 'ein-starkes-schutzpasswort'), {
    employees: [{ id: 'employee_1', name: 'Alex Beispiel', reference: '', department: '', position: '', startDate: '', status: 'Aktiv', createdAt: '', updatedAt: '' }],
    svNumbers: { employee_1: '15070649C103' },
  })
  await assert.rejects(decryptHrSensitiveData(envelope, 'falsches-passwort'), /Passwort falsch/)
  const secondEnvelope = await encryptHrSensitiveData(entries, 'ein-starkes-schutzpasswort')
  assert.notEqual(envelope.ciphertext, secondEnvelope.ciphertext)
})

test('requires a strong protection passphrase and valid employee identifiers', async () => {
  await assert.rejects(encryptHrSensitiveData({ employees: [], svNumbers: {} }, 'kurz'), /12 und 256/)
  await assert.rejects(encryptHrSensitiveData({
    employees: [{ id: 'bad id', name: 'Alex', status: 'Aktiv' }],
    svNumbers: {},
  }, 'ein-starkes-schutzpasswort'), /Mitarbeiterzuordnung/)
  await assert.rejects(encryptHrSensitiveData({
    employees: [],
    svNumbers: { employee_1: '15 070649 C 103' },
  }, 'ein-starkes-schutzpasswort'), /keinem gespeicherten Mitarbeiter/)
})

test('creates and edits HR employee records without including the SV number', () => {
  const employee = createHrEmployee({
    name: 'Alex Beispiel',
    reference: 'MA-001',
    department: 'Fertigung',
    position: 'Mechatroniker',
    startDate: '2026-03-15',
    status: 'Aktiv',
  })
  const updated = createHrEmployee({
    ...employee,
    position: 'Teamleitung',
  }, [employee], employee.id)

  assert.equal(employee.name, 'Alex Beispiel')
  assert.equal('socialSecurityNumber' in employee, false)
  assert.equal(updated.id, employee.id)
  assert.equal(updated.createdAt, employee.createdAt)
  assert.equal(updated.position, 'Teamleitung')
  assert.throws(() => createHrEmployee({
    name: 'Sam Beispiel',
    reference: 'ma-001',
    status: 'Aktiv',
  }, [employee]), /bereits einem anderen Mitarbeiter/)
  assert.throws(() => createHrEmployee({ name: 'Alex', status: 'Unbekannt' }), /gültigen Mitarbeiterstatus/)
  assert.throws(() => createHrEmployee({ name: 'Alex', startDate: '2026-02-30', status: 'Aktiv' }), /Eintrittsdatum/)
})
