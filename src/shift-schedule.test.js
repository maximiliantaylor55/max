import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getScheduleAssignees,
  getScheduleToday,
  getScheduleWeekDates,
  getScheduleWeekStart,
  sortScheduleShifts,
  validateShiftDraft,
} from './shift-schedule.js'

test('allows admins and employees to be assigned to shifts', () => {
  const users = [
    { id: 'employee-1', name: 'Birgit', role: 'mitarbeiter' },
    { id: 'admin-1', name: 'Anna', role: 'admin' },
    { id: 'other-1', name: 'Ignored', role: 'external' },
  ]
  assert.deepEqual(getScheduleAssignees(users).map((user) => user.id), ['admin-1', 'employee-1'])
})

test('formats a schedule date using the local calendar day', () => {
  assert.equal(getScheduleToday(new Date(2026, 10, 9)), '2026-11-09')
})

test('finds the Monday and seven local dates for a schedule week', () => {
  assert.equal(getScheduleWeekStart('2026-11-07'), '2026-11-02')
  assert.deepEqual(getScheduleWeekDates('2026-11-02').map((day) => day.date), [
    '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
  ])
})

test('sorts schedule shifts by date then start time', () => {
  const sorted = sortScheduleShifts([
    { date: '2026-11-03', startTime: '08:00', employeeName: 'A' },
    { date: '2026-11-02', startTime: '12:00', employeeName: 'B' },
    { date: '2026-11-02', startTime: '08:00', employeeName: 'C' },
  ])
  assert.deepEqual(sorted.map((shift) => shift.startTime), ['08:00', '12:00', '08:00'])
})

test('validates shift times and rejects employee schedule conflicts', () => {
  const draft = {
    employeeId: 'employee-1',
    employeeName: 'Mitarbeiter Eins',
    date: '2026-11-09',
    startTime: '08:00',
    endTime: '16:00',
    breakMinutes: 30,
    location: '',
    notes: '',
  }
  assert.equal(validateShiftDraft(draft, []), '')
  assert.match(validateShiftDraft({ ...draft, startTime: '16:00' }, []), /Endzeit/)
  assert.match(validateShiftDraft(draft, [{ ...draft, id: 'existing' }]), /überschneidet/)
  assert.equal(validateShiftDraft(draft, [{ ...draft, id: 'existing' }], 'existing'), '')
})
