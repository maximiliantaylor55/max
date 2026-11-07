import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getScheduleWeekDates,
  getScheduleWeekStart,
  sortScheduleShifts,
  validateShiftDraft,
} from './shift-schedule.js'

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
