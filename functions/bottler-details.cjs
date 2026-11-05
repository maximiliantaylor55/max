const defaultBottlerDetails = {
  id: 'global',
  name: 'Nanotrade GmbH',
  street: 'Paul-Joseph-Str. 12',
  city: '64658 Fürth',
}

const fieldLimits = {
  name: 120,
  street: 180,
  city: 100,
}

const normalizeBottlerDetails = (input = {}) => ({
  id: 'global',
  ...Object.fromEntries(Object.entries(fieldLimits).map(([field, maxLength]) => [
    field,
    String(input[field] ?? defaultBottlerDetails[field]).trim().slice(0, maxLength),
  ])),
})

const validateBottlerDetailsEntries = (entries, actor) => {
  if (actor?.role !== 'admin') throw new Error('Lohnabfüller-Daten dürfen nur von einem Admin verwaltet werden.')
  if (!Array.isArray(entries) || entries.length !== 1 || entries[0]?.id !== 'global') {
    throw new Error('Es muss genau ein Lohnabfüller-Datensatz mit der ID „global“ gespeichert werden.')
  }
  for (const [field, maxLength] of Object.entries(fieldLimits)) {
    const value = entries[0][field]
    if (typeof value !== 'string' || value.length > maxLength) {
      throw new Error(`Das Lohnabfüller-Feld „${field}“ ist ungültig.`)
    }
  }
  const details = normalizeBottlerDetails(entries[0])
  if (!details.name || !details.street || !details.city) {
    throw new Error('Name, Straße und PLZ/Ort des Lohnabfüllers sind erforderlich.')
  }
  return details
}

module.exports = { defaultBottlerDetails, normalizeBottlerDetails, validateBottlerDetailsEntries }
