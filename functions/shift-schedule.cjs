const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const shiftFields = new Set([
  'id', 'employeeId', 'employeeName', 'date', 'startTime', 'endTime',
  'breakMinutes', 'location', 'notes',
])

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

module.exports = { filterShiftsForEmployee, validateShiftSchedule }
