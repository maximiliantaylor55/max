const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const shiftFields = new Set([
  'id', 'employeeId', 'employeeName', 'date', 'startTime', 'endTime',
  'breakMinutes', 'location', 'notes',
])
const requestTypes = new Set(['shift_swap', 'vacation', 'sick_leave', 'other_absence'])
const requestStatuses = new Set(['pending_coworker', 'pending_admin', 'approved', 'declined', 'declined_by_coworker'])
const requestFields = new Set([
  'id', 'type', 'requesterId', 'requesterName', 'createdAt', 'updatedAt', 'status', 'note',
  'shiftId', 'targetEmployeeId', 'targetEmployeeName', 'targetShiftId', 'coworkerRespondedAt', 'coworkerResponse',
  'startDate', 'endDate', 'adminDecidedAt', 'adminDecidedBy', 'decisionNote',
])
const isValidTimestamp = (value) => typeof value === 'string'
  && !Number.isNaN(Date.parse(value))

const isValidDate = (value) => datePattern.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value

const validateShiftSchedule = (shifts) => {
  if (!Array.isArray(shifts) || shifts.length > 5000) {
    throw new Error('Der Dienstplan muss eine Liste mit höchstens 5.000 Schichten sein.')
  }

  const ids = new Set()
  const shiftsByEmployee = new Map()
  for (const shift of shifts) {
    if (!shift || typeof shift !== 'object' || Array.isArray(shift)
      || Object.keys(shift).some((key) => !shiftFields.has(key))
      || typeof shift.id !== 'string' || !shift.id.trim() || shift.id.length > 100
      || ids.has(shift.id)
      || typeof shift.employeeId !== 'string' || !shift.employeeId.trim() || shift.employeeId.length > 100
      || typeof shift.employeeName !== 'string' || !shift.employeeName.trim() || shift.employeeName.length > 100
      || !isValidDate(shift.date)
      || !timePattern.test(shift.startTime) || !timePattern.test(shift.endTime)
      || typeof shift.breakMinutes !== 'number' || !Number.isInteger(shift.breakMinutes)
      || shift.breakMinutes < 0 || shift.breakMinutes > 360
      || typeof shift.location !== 'string' || shift.location.length > 120
      || typeof shift.notes !== 'string' || shift.notes.length > 500) {
      throw new Error('Eine Dienstplan-Schicht enthält ungültige Angaben.')
    }

    const startMinutes = Number(shift.startTime.slice(0, 2)) * 60 + Number(shift.startTime.slice(3))
    const endMinutes = Number(shift.endTime.slice(0, 2)) * 60 + Number(shift.endTime.slice(3))
    if (endMinutes <= startMinutes || shift.breakMinutes > endMinutes - startMinutes) {
      throw new Error('Schichtende und Pause müssen innerhalb der Schicht liegen.')
    }

    ids.add(shift.id)
    const employeeDay = `${shift.employeeId}:${shift.date}`
    const employeeShifts = shiftsByEmployee.get(employeeDay) || []
    if (employeeShifts.some((entry) => startMinutes < entry.end && endMinutes > entry.start)) {
      throw new Error('Schichten derselben Person dürfen sich zeitlich nicht überschneiden.')
    }
    employeeShifts.push({ start: startMinutes, end: endMinutes })
    shiftsByEmployee.set(employeeDay, employeeShifts)
  }

  return shifts
}

const filterShiftsForEmployee = (shifts, employeeId) => (
  Array.isArray(shifts) && employeeId
    ? shifts.filter((shift) => String(shift.employeeId) === String(employeeId)).map((shift) => (
      Object.fromEntries([...shiftFields].map((key) => [key, shift[key]]))
    ))
    : []
)

const validateScheduleRequest = (request) => {
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || Object.keys(request).some((key) => !requestFields.has(key))
    || typeof request.id !== 'string' || !request.id.trim() || request.id.length > 100
    || !requestTypes.has(request.type)
    || typeof request.requesterId !== 'string' || !request.requesterId.trim() || request.requesterId.length > 100
    || typeof request.requesterName !== 'string' || !request.requesterName.trim() || request.requesterName.length > 100
    || !isValidTimestamp(request.createdAt) || !isValidTimestamp(request.updatedAt)
    || !requestStatuses.has(request.status)
    || typeof request.note !== 'string' || request.note.length > 500) {
    throw new Error('Ein Dienstplan-Antrag enthält ungültige Angaben.')
  }

  if (request.type === 'shift_swap') {
    if (request.status === 'pending_admin' || request.status === 'approved' || request.status === 'declined') {
      if (typeof request.targetShiftId !== 'string' || !request.targetShiftId.trim() || !isValidTimestamp(request.coworkerRespondedAt)) {
        throw new Error('Der Schichttausch benötigt die Zustimmung des Tauschpartners.')
      }
      if (request.coworkerResponse !== 'accepted') throw new Error('Die Zustimmung des Tauschpartners ist ungültig.')
    } else if (request.status === 'declined_by_coworker') {
      if (request.targetShiftId !== undefined || !isValidTimestamp(request.coworkerRespondedAt)
        || request.coworkerResponse !== 'declined') {
        throw new Error('Die Ablehnung des Tauschpartners ist ungültig.')
      }
    } else if (request.targetShiftId !== undefined || request.coworkerRespondedAt !== undefined) {
      throw new Error('Der Schichttausch enthält eine ungültige Partnerentscheidung.')
    } else if (request.coworkerResponse !== undefined) {
      throw new Error('Der Schichttausch enthält eine unerwartete Partnerantwort.')
    }
    if (typeof request.shiftId !== 'string' || !request.shiftId.trim() || request.shiftId.length > 100
      || typeof request.targetEmployeeId !== 'string' || !request.targetEmployeeId.trim() || request.targetEmployeeId.length > 100
      || request.targetEmployeeId === request.requesterId
      || typeof request.targetEmployeeName !== 'string' || !request.targetEmployeeName.trim() || request.targetEmployeeName.length > 100) {
      throw new Error('Der Schichttausch enthält ungültige Mitarbeiter- oder Schichtangaben.')
    }
  } else {
    if (!isValidDate(request.startDate) || !isValidDate(request.endDate) || request.endDate < request.startDate) {
      throw new Error('Der beantragte Zeitraum ist ungültig.')
    }
    if (request.status === 'pending_coworker' || request.status === 'declined_by_coworker' || request.shiftId !== undefined
      || request.targetEmployeeId !== undefined || request.targetEmployeeName !== undefined
      || request.targetShiftId !== undefined || request.coworkerRespondedAt !== undefined || request.coworkerResponse !== undefined) {
      throw new Error('Der Abwesenheitsantrag enthält ungültige Angaben.')
    }
  }

  const decided = request.status === 'approved' || request.status === 'declined'
  if (decided) {
    if (!isValidTimestamp(request.adminDecidedAt)
      || typeof request.adminDecidedBy !== 'string' || !request.adminDecidedBy.trim() || request.adminDecidedBy.length > 100
      || typeof request.decisionNote !== 'string' || request.decisionNote.length > 500) {
      throw new Error('Die Admin-Entscheidung ist unvollständig.')
    }
  } else if (request.adminDecidedAt !== undefined || request.adminDecidedBy !== undefined || request.decisionNote !== undefined) {
    throw new Error('Der Antrag enthält eine unerwartete Admin-Entscheidung.')
  }
  return request
}

const validateScheduleRequests = (requests) => {
  if (!Array.isArray(requests) || requests.length > 2000) {
    throw new Error('Es dürfen höchstens 2.000 Dienstplan-Anträge gespeichert werden.')
  }
  const ids = new Set()
  for (const request of requests) {
    validateScheduleRequest(request)
    if (ids.has(request.id)) throw new Error('Dienstplan-Anträge müssen eindeutige Kennungen haben.')
    ids.add(request.id)
  }
  return requests
}

const filterScheduleRequestsForEmployee = (requests, employeeId) => (
  Array.isArray(requests) && employeeId
    ? requests.filter((request) => String(request.requesterId) === String(employeeId)
      || String(request.targetEmployeeId || '') === String(employeeId))
    : []
)

const createScheduleRequest = ({ id, type, shiftId, targetEmployee, startDate, endDate, note }, actor, shifts, now = new Date().toISOString()) => {
  if (!actor || actor.role === 'admin') throw new Error('Dienstplan-Anträge können nur Mitarbeiter stellen.')
  if (!requestTypes.has(type)) throw new Error('Bitte eine gültige Antragsart auswählen.')
  const cleanNote = String(note || '').trim()
  if (cleanNote.length > 500) throw new Error('Die Notiz darf höchstens 500 Zeichen enthalten.')

  const base = {
    id,
    type,
    requesterId: String(actor.id),
    requesterName: String(actor.name || '').trim(),
    createdAt: now,
    updatedAt: now,
    status: type === 'shift_swap' ? 'pending_coworker' : 'pending_admin',
    note: cleanNote,
  }
  if (!base.requesterId || !base.requesterName) throw new Error('Mitarbeiterkonto ungültig.')

  if (type === 'shift_swap') {
    const ownShift = (Array.isArray(shifts) ? shifts : []).find((shift) => (
      String(shift.id) === String(shiftId) && String(shift.employeeId) === base.requesterId
    ))
    if (!ownShift) throw new Error('Die ausgewählte Schicht gehört nicht zu deinem Dienstplan.')
    if (!targetEmployee || targetEmployee.role === 'admin'
      || String(targetEmployee.id) === base.requesterId
      || !String(targetEmployee.name || '').trim()) {
      throw new Error('Bitte einen anderen Mitarbeiter als Tauschpartner auswählen.')
    }
    if (ownShift.date < now.slice(0, 10)) throw new Error('Vergangene Schichten können nicht getauscht werden.')
    return validateScheduleRequest({
      ...base,
      shiftId: String(ownShift.id),
      targetEmployeeId: String(targetEmployee.id),
      targetEmployeeName: String(targetEmployee.name).trim(),
    })
  }

  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) {
    throw new Error('Bitte einen gültigen Abwesenheitszeitraum angeben.')
  }
  if ((new Date(`${endDate}T00:00:00.000Z`) - new Date(`${startDate}T00:00:00.000Z`)) / 86400000 > 366) {
    throw new Error('Der beantragte Zeitraum darf höchstens ein Jahr umfassen.')
  }
  return validateScheduleRequest({ ...base, startDate, endDate })
}

const respondToScheduleRequest = (request, { action, targetShiftId }, actor, shifts, now = new Date().toISOString()) => {
  if (!request || request.type !== 'shift_swap' || request.status !== 'pending_coworker'
    || String(request.targetEmployeeId) !== String(actor?.id || '')) {
    throw new Error('Dieser Tausch ist nicht mehr offen oder nicht für dich bestimmt.')
  }
  if (action === 'decline') {
    return validateScheduleRequest({
      ...request,
      status: 'declined_by_coworker',
      updatedAt: now,
      coworkerRespondedAt: now,
      coworkerResponse: 'declined',
    })
  }
  if (action !== 'accept') throw new Error('Antwort auf den Tausch ungültig.')
  const targetShift = (Array.isArray(shifts) ? shifts : []).find((shift) => (
    String(shift.id) === String(targetShiftId) && String(shift.employeeId) === String(actor.id)
  ))
  if (!targetShift || targetShift.date < now.slice(0, 10)) {
    throw new Error('Bitte eine eigene, noch nicht vergangene Schicht zum Tausch auswählen.')
  }
  if (String(targetShift.id) === String(request.shiftId)) throw new Error('Eine Schicht kann nicht mit sich selbst getauscht werden.')
  return validateScheduleRequest({
    ...request,
    status: 'pending_admin',
    targetShiftId: String(targetShift.id),
    coworkerRespondedAt: now,
    coworkerResponse: 'accepted',
    updatedAt: now,
  })
}

const validateScheduleRequestUpdate = (currentRequests, nextRequests, actor, allowEmployeeAction = false) => {
  validateScheduleRequests(nextRequests)
  const current = Array.isArray(currentRequests) ? currentRequests : []
  const currentById = new Map(current.map((request) => [String(request.id), request]))
  const nextById = new Map(nextRequests.map((request) => [String(request.id), request]))
  if (current.some((request) => !nextById.has(String(request.id)))) {
    throw new Error('Dienstplan-Anträge dürfen nicht gelöscht werden.')
  }

  const changed = nextRequests.filter((request) => {
    const previous = currentById.get(String(request.id))
    return !previous || JSON.stringify(previous) !== JSON.stringify(request)
  })
  if (changed.length !== 1) throw new Error('Pro Vorgang darf nur ein Dienstplan-Antrag geändert werden.')
  const request = changed[0]
  const previous = currentById.get(String(request.id))

  if (actor?.role === 'admin') {
    if (!previous || previous.status !== 'pending_admin'
      || !['approved', 'declined'].includes(request.status)
      || request.id !== previous.id || request.type !== previous.type
      || request.requesterId !== previous.requesterId || request.requesterName !== previous.requesterName
      || request.createdAt !== previous.createdAt || request.note !== previous.note
      || request.shiftId !== previous.shiftId || request.targetEmployeeId !== previous.targetEmployeeId
      || request.targetEmployeeName !== previous.targetEmployeeName || request.targetShiftId !== previous.targetShiftId
      || request.coworkerRespondedAt !== previous.coworkerRespondedAt
      || request.coworkerResponse !== previous.coworkerResponse
      || request.startDate !== previous.startDate || request.endDate !== previous.endDate
      || !isValidTimestamp(request.adminDecidedAt)
      || request.adminDecidedBy !== String(actor.name || '')
      || typeof request.decisionNote !== 'string' || request.decisionNote.length > 500) {
      throw new Error('Nur offene Anträge können vom Admin entschieden werden.')
    }
    return nextRequests
  }

  if (!allowEmployeeAction || !actor || actor.role === 'admin') {
    throw new Error('Anträge dürfen nur über die Antragsfunktion erstellt oder beantwortet werden.')
  }
  if (!previous) {
    if (request.requesterId !== String(actor.id) || request.status !== 'pending_admin' && request.status !== 'pending_coworker') {
      throw new Error('Du darfst nur eigene neue Anträge einreichen.')
    }
    return nextRequests
  }
  if (previous.type !== 'shift_swap' || previous.status !== 'pending_coworker'
    || String(previous.targetEmployeeId) !== String(actor.id)
    || request.id !== previous.id || request.type !== previous.type
    || request.requesterId !== previous.requesterId || request.requesterName !== previous.requesterName
    || request.createdAt !== previous.createdAt || request.note !== previous.note
    || request.shiftId !== previous.shiftId || request.targetEmployeeId !== previous.targetEmployeeId
    || request.targetEmployeeName !== previous.targetEmployeeName
    || request.startDate !== previous.startDate || request.endDate !== previous.endDate
    || !['pending_admin', 'declined_by_coworker'].includes(request.status)) {
    throw new Error('Du darfst nur einen an dich gerichteten offenen Schichttausch beantworten.')
  }
  return nextRequests
}

module.exports = {
  createScheduleRequest,
  filterScheduleRequestsForEmployee,
  filterShiftsForEmployee,
  respondToScheduleRequest,
  validateScheduleRequestUpdate,
  validateScheduleRequests,
  validateShiftSchedule,
}
