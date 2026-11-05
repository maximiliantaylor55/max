import assert from 'node:assert/strict'
import test from 'node:test'
import { createMachinebauDraft, createMachinebauRecord } from './machinebau.js'

test('creates a machine record and retains its creation metadata when edited', () => {
  const draft = { ...createMachinebauDraft('anlage'), title: 'CNC-Fräse', status: 'In Betrieb' }
  const created = createMachinebauRecord(draft, [], 'Alex')
  const edited = createMachinebauRecord({ ...draft, title: 'CNC-Fräse 2' }, [created], 'Sam', created.id)

  assert.equal(created.title, 'CNC-Fräse')
  assert.equal(created.author, 'Alex')
  assert.equal(edited.id, created.id)
  assert.equal(edited.createdAt, created.createdAt)
  assert.equal(edited.title, 'CNC-Fräse 2')
})

test('requires a valid machinebau type, title, status, date, and linked records', () => {
  const base = { ...createMachinebauDraft('projekt'), title: 'Projekt A' }
  assert.throws(() => createMachinebauRecord({ ...base, type: 'unbekannt' }, [], 'Alex'), /gültigen Maschinenbau-Bereich/)
  assert.throws(() => createMachinebauRecord({ ...base, title: ' ' }, [], 'Alex'), /Titel/)
  assert.throws(() => createMachinebauRecord({ ...base, status: 'Unbekannt' }, [], 'Alex'), /gültigen Status/)
  assert.throws(() => createMachinebauRecord({ ...base, dueDate: '2026-02-30' }, [], 'Alex'), /gültiges Datum/)
  assert.throws(() => createMachinebauRecord({ ...base, projectId: 'missing' }, [], 'Alex'), /Projekt wurde nicht gefunden/)
})

test('allows only existing project and machine links', () => {
  const project = { id: 'p1', type: 'projekt' }
  const asset = { id: 'a1', type: 'anlage' }
  const draft = {
    ...createMachinebauDraft('wartung'),
    title: 'Jahreswartung',
    projectId: 'p1',
    assetId: 'a1',
  }
  const record = createMachinebauRecord(draft, [project, asset], 'Alex')
  assert.equal(record.projectId, 'p1')
  assert.equal(record.assetId, 'a1')
  assert.throws(() => createMachinebauRecord(draft, [project, asset], 'Alex', 'a1'), /nicht mit sich selbst/)
})
