const isSafeText = (value, maxLength) => typeof value === 'string'
  && value.length <= maxLength
  && !Array.from(value).some((character) => {
    const code = character.codePointAt(0)
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31)
  })

const labTestFields = new Set([
  'id', 'sampleCode', 'recipeId', 'recipeName', 'peachFlavorGrams', 'passionFruitFlavorGrams',
  'phValue', 'fruitiness', 'naturalness', 'aftertaste', 'sweetness', 'observations',
  'createdAt', 'createdById', 'createdByName',
])

const validateLabTestEntry = (entry) => {
  if (!entry || typeof entry !== 'object'
    || typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.id)
    || !['A', 'B', 'C'].includes(entry.sampleCode)
    || typeof entry.recipeId !== 'string' || entry.recipeId.length > 100
    || !isSafeText(entry.recipeName, 120)
    || !Number.isFinite(entry.peachFlavorGrams) || entry.peachFlavorGrams < 0 || entry.peachFlavorGrams > 1000
    || !Number.isFinite(entry.passionFruitFlavorGrams) || entry.passionFruitFlavorGrams < 0 || entry.passionFruitFlavorGrams > 1000
    || (entry.phValue !== null && (!Number.isFinite(entry.phValue) || entry.phValue < 0 || entry.phValue > 14))
    || !Number.isInteger(entry.fruitiness) || entry.fruitiness < 1 || entry.fruitiness > 10
    || !Number.isInteger(entry.naturalness) || entry.naturalness < 1 || entry.naturalness > 10
    || !['poor', 'medium', 'very-good', 'not-tested'].includes(entry.aftertaste)
    || !['too-little', 'balanced', 'too-sweet', 'not-tested'].includes(entry.sweetness)
    || !isSafeText(entry.observations, 2000)
    || typeof entry.createdById !== 'string' || !entry.createdById.trim() || entry.createdById.length > 100
    || !isSafeText(entry.createdByName, 100)
    || !Number.isFinite(Date.parse(entry.createdAt))
    || Object.keys(entry).some((key) => !labTestFields.has(key))) {
    throw new Error('Versuchsprotokoll ungültig. Bitte Probenummer und Messwerte prüfen.')
  }
}

const validateLabTestsUpdate = (currentValue, nextValue, actor) => {
  if (!Array.isArray(nextValue) || nextValue.length > 10000 || !actor?.id || !actor.name) {
    throw new Error('Versuchsprotokolle benötigen eine gültige Anmeldung und Liste.')
  }
  const current = Array.isArray(currentValue) ? currentValue : []
  const currentById = new Map(current.map((entry) => [String(entry.id), entry]))
  const nextById = new Map()
  for (const entry of nextValue) {
    validateLabTestEntry(entry)
    if (nextById.has(entry.id)) throw new Error('Versuchsprotokoll ist doppelt vorhanden.')
    nextById.set(entry.id, entry)
  }
  if (current.some((entry) => !nextById.has(String(entry.id)))) {
    throw new Error('Gespeicherte Versuchsprotokolle dürfen nicht gelöscht werden.')
  }
  for (const entry of nextValue) {
    const previous = currentById.get(entry.id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) {
      throw new Error('Abgeschlossene Versuchsprotokolle dürfen nicht verändert werden.')
    }
    if (!previous && (entry.createdById !== String(actor.id) || entry.createdByName !== actor.name)) {
      throw new Error('Neue Versuchsprotokolle müssen vom angemeldeten Benutzer erstellt werden.')
    }
  }
  return nextValue
}

module.exports = {
  validateLabTestEntry,
  validateLabTestsUpdate,
}
