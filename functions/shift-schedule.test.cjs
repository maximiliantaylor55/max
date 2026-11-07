const test = require('node:test')
const assert = require('node:assert/strict')
const { filterShiftsForEmployee, validateShiftSchedule } = require('./shift-schedule.cjs')

const shifts = [
  {
    id: 'shift-1',
    employeeId: 'employee-1',
    employeeName: 'Mitarbeiter Eins',
    date: '2026-11-09',
    startTime: '08:00',
    endTime: '16:00',
    breakMinutes: 30,
    location: 'Standort A',
    notes: '',
  },
  {
    id: 'shift-2',
    employeeId: 'employee-2',
    employeeName: 'Mitarbeiter Zwei',
    date: '2026-11-09',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    location: '',
    notes: '',
  },
]

test('validates schedule shifts and permits different employees to work at the same time', () => {
  assert.deepEqual(validateShiftSchedule(shifts), shifts)
})

test('rejects invalid dates, reversed times, duplicate ids, and overlapping shifts', () => {
  assert.throws(() => validateShiftSchedule([{ ...shifts[0], date: '2026-02-30' }]), /ungültige Angaben/)
  assert.throws(() => validateShiftSchedule([{ ...shifts[0], endTime: '07:00' }]), /Schichtende/)
  assert.throws(() => validateShiftSchedule([shifts[0], { ...shifts[0], employeeId: 'employee-2' }]), /ungültige Angaben/)
  assert.throws(() => validateShiftSchedule([shifts[0], { ...shifts[0], id: 'shift-2', startTime: '15:30' }]), /überschneiden/)
})

test('filters schedule entries to the authenticated employee only', () => {
  assert.deepEqual(filterShiftsForEmployee(shifts, 'employee-2'), [shifts[1]])
  assert.deepEqual(filterShiftsForEmployee(shifts, ''), [])
  assert.deepEqual(filterShiftsForEmployee(null, 'employee-1'), [])
})
