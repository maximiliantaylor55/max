const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createScheduleRequest,
  filterScheduleRequestsForEmployee,
  filterShiftsForEmployee,
  respondToScheduleRequest,
  validateScheduleRequestUpdate,
  validateShiftSchedule,
} = require('./shift-schedule.cjs')

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

test('creates absence requests and limits employee request reads to involved employees', () => {
  const requester = { id: 'employee-1', name: 'Mitarbeiter Eins', role: 'employee' }
  const request = createScheduleRequest({
    id: 'request-1',
    type: 'vacation',
    startDate: '2026-12-01',
    endDate: '2026-12-05',
    note: 'Urlaub',
  }, requester, [], '2026-11-01T10:00:00.000Z')

  assert.equal(request.status, 'pending_admin')
  assert.deepEqual(filterScheduleRequestsForEmployee([request], 'employee-1'), [request])
  assert.deepEqual(filterScheduleRequestsForEmployee([request], 'employee-2'), [])
  assert.deepEqual(validateScheduleRequestUpdate([], [request], requester, true), [request])
})

test('requires a coworker to choose one of their own future shifts before a swap reaches admin', () => {
  const requester = { id: 'employee-1', name: 'Mitarbeiter Eins', role: 'employee' }
  const coworker = { id: 'employee-2', name: 'Mitarbeiter Zwei', role: 'employee' }
  const request = createScheduleRequest({
    id: 'request-swap',
    type: 'shift_swap',
    shiftId: 'shift-1',
    targetEmployee: coworker,
    note: '',
  }, requester, shifts, '2026-11-01T10:00:00.000Z')

  assert.throws(() => respondToScheduleRequest(request, {
    action: 'accept',
    targetShiftId: 'shift-1',
  }, coworker, shifts, '2026-11-01T10:00:00.000Z'), /eigene/)
  const accepted = respondToScheduleRequest(request, {
    action: 'accept',
    targetShiftId: 'shift-2',
  }, coworker, shifts, '2026-11-01T10:00:00.000Z')
  assert.equal(accepted.status, 'pending_admin')
  assert.equal(accepted.coworkerResponse, 'accepted')
  assert.deepEqual(filterScheduleRequestsForEmployee([accepted], 'employee-2'), [accepted])
  assert.deepEqual(validateScheduleRequestUpdate([request], [accepted], coworker, true), [accepted])
})

test('rejects employee edits to somebody else’s request', () => {
  const requester = { id: 'employee-1', name: 'Mitarbeiter Eins', role: 'employee' }
  const coworker = { id: 'employee-2', name: 'Mitarbeiter Zwei', role: 'employee' }
  const request = createScheduleRequest({
    id: 'request-1',
    type: 'vacation',
    startDate: '2026-12-01',
    endDate: '2026-12-05',
  }, requester, [], '2026-11-01T10:00:00.000Z')
  assert.throws(() => validateScheduleRequestUpdate([request], [{
    ...request,
    status: 'approved',
    adminDecidedAt: '2026-11-01T10:05:00.000Z',
    adminDecidedBy: coworker.name,
    decisionNote: '',
    updatedAt: '2026-11-01T10:05:00.000Z',
  }], coworker, true), /offenen Schichttausch/)
})
