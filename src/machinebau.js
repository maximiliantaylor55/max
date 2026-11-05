export const machinebauTypes = [
  { value: 'anlage', label: 'Anlage / Maschine', statuses: ['In Planung', 'In Betrieb', 'Außer Betrieb', 'Ausgemustert'] },
  { value: 'projekt', label: 'Projekt', statuses: ['Geplant', 'In Bearbeitung', 'Wartet', 'Pausiert', 'Abgeschlossen'] },
  { value: 'stueckliste', label: 'Stückliste / Material', statuses: ['Entwurf', 'In Prüfung', 'Freigegeben', 'Archiviert'] },
  { value: 'fertigungsauftrag', label: 'Fertigungsauftrag', statuses: ['Geplant', 'Freigegeben', 'In Fertigung', 'Wartet auf Material', 'Abgeschlossen', 'Storniert'] },
  { value: 'wartung', label: 'Wartung', statuses: ['Geplant', 'Fällig', 'In Bearbeitung', 'Erledigt', 'Überfällig'] },
  { value: 'service', label: 'Serviceauftrag', statuses: ['Offen', 'In Bearbeitung', 'Wartet auf Ersatzteil', 'Erledigt'] },
  { value: 'qualitaet', label: 'Qualität', statuses: ['Offen', 'In Prüfung', 'Freigegeben', 'Nacharbeit'] },
  { value: 'sicherheit', label: 'Sicherheit', statuses: ['Offen', 'Maßnahme geplant', 'In Umsetzung', 'Erledigt'] },
  { value: 'bericht', label: 'Technischer Bericht', statuses: ['Entwurf', 'In Prüfung', 'Freigegeben'] },
]

export const createMachinebauDraft = (type = 'projekt') => {
  const definition = machinebauTypes.find((entry) => entry.value === type) || machinebauTypes[1]
  return {
    type: definition.value,
    title: '',
    reference: '',
    status: definition.statuses[0],
    projectId: '',
    assetId: '',
    dueDate: '',
    responsible: '',
    summary: '',
    details: '',
  }
}

const isValidDate = (value) => {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export const createMachinebauRecord = (draft, existingRecords, userName, editingId = '') => {
  const definition = machinebauTypes.find((entry) => entry.value === draft?.type)
  if (!definition) throw new Error('Bitte wähle einen gültigen Maschinenbau-Bereich.')

  const title = String(draft.title || '').trim()
  if (!title || title.length > 140) throw new Error('Der Titel muss zwischen 1 und 140 Zeichen lang sein.')
  if (!definition.statuses.includes(draft.status)) throw new Error('Bitte wähle einen gültigen Status.')
  if (!isValidDate(draft.dueDate)) throw new Error('Bitte gib ein gültiges Datum ein.')

  const reference = String(draft.reference || '').trim()
  const responsible = String(draft.responsible || '').trim()
  const summary = String(draft.summary || '').trim()
  const details = String(draft.details || '').trim()
  if (reference.length > 100 || responsible.length > 100 || summary.length > 500) {
    throw new Error('Referenz, Verantwortliche und Zusammenfassung sind zu lang.')
  }
  if (details.length > (draft.type === 'bericht' ? 30000 : 15000)) {
    throw new Error('Die Details überschreiten die zulässige Länge.')
  }

  const records = Array.isArray(existingRecords) ? existingRecords : []
  const projectId = String(draft.projectId || '')
  const assetId = String(draft.assetId || '')
  if (projectId && !records.some((entry) => entry.type === 'projekt' && String(entry.id) === projectId)) {
    throw new Error('Das verknüpfte Projekt wurde nicht gefunden.')
  }
  if (projectId && String(editingId) === projectId) throw new Error('Ein Projekt kann nicht mit sich selbst verknüpft werden.')
  if (assetId && !records.some((entry) => entry.type === 'anlage' && String(entry.id) === assetId)) {
    throw new Error('Die verknüpfte Anlage wurde nicht gefunden.')
  }
  if (assetId && String(editingId) === assetId) throw new Error('Eine Anlage kann nicht mit sich selbst verknüpft werden.')

  const previous = records.find((entry) => String(entry.id) === String(editingId))
  const timestamp = new Date().toISOString()
  return {
    type: definition.value,
    title,
    reference,
    status: draft.status,
    projectId,
    assetId,
    dueDate: String(draft.dueDate || ''),
    responsible,
    summary,
    details,
    id: previous?.id || crypto.randomUUID(),
    createdAt: previous?.createdAt || timestamp,
    updatedAt: timestamp,
    author: previous?.author || String(userName || 'Unbekannt').slice(0, 100),
  }
}
