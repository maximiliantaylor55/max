const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/

const localDateString = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-')

export const getScheduleWeekStart = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return localDateString(new Date())
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return localDateString(date)
}

export const getScheduleWeekDates = (weekStart) => {
  const monday = new Date(`${weekStart}T12:00:00`)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return {
      date: localDateString(date),
      label: new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(date),
      dayLabel: new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(date),
    }
  })
}

export const sortScheduleShifts = (shifts) => [...shifts].sort((left, right) => (
  String(left.date || '').localeCompare(String(right.date || ''))
  || String(left.startTime || '').localeCompare(String(right.startTime || ''))
  || String(left.employeeName || '').localeCompare(String(right.employeeName || ''), 'de')
))

export const validateShiftDraft = (shift, shifts, editingId = '') => {
  if (!shift.employeeId || !shift.employeeName || !datePattern.test(shift.date)
    || Number.isNaN(Date.parse(`${shift.date}T00:00:00.000Z`))
    || new Date(`${shift.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== shift.date
    || !timePattern.test(shift.startTime) || !timePattern.test(shift.endTime)) {
    return 'Bitte Mitarbeiter, Datum und gültige Start- und Endzeiten angeben.'
  }
  const start = Number(shift.startTime.slice(0, 2)) * 60 + Number(shift.startTime.slice(3))
  const end = Number(shift.endTime.slice(0, 2)) * 60 + Number(shift.endTime.slice(3))
  const breakMinutes = Number(shift.breakMinutes)
  if (end <= start || !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > end - start) {
    return 'Endzeit und Pause müssen innerhalb der Schicht liegen.'
  }
  if ([...shift.location].length > 120 || [...shift.notes].length > 500) {
    return 'Einsatzort oder Hinweis ist zu lang.'
  }
  const overlaps = shifts.some((entry) => (
    String(entry.id) !== String(editingId)
    && String(entry.employeeId) === String(shift.employeeId)
    && entry.date === shift.date
    && shift.startTime < entry.endTime
    && shift.endTime > entry.startTime
  ))
  return overlaps ? 'Diese Schicht überschneidet sich mit einer anderen Schicht des Mitarbeiters.' : ''
}
