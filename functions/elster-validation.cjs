const textLimits = {
  businessName: 160,
  taxNumber: 40,
  taxOffice: 120,
  federalState: 80,
  manufacturerId: 80,
  ericVersion: 40,
}

const validateElsterSetupEntries = (_currentValue, nextValue, actor) => {
  if (actor?.role !== 'admin') throw new Error('ELSTER-Einstellungen dürfen nur von einem Admin verwaltet werden.')
  if (!Array.isArray(nextValue) || nextValue.length > 1) {
    throw new Error('ELSTER-Einstellungen müssen als einzelne Konfiguration gespeichert werden.')
  }
  if (nextValue.length === 0) return

  const [setup] = nextValue
  const allowedFields = new Set(['id', ...Object.keys(textLimits), 'filingPeriod', 'developerStatus'])
  if (!setup || typeof setup !== 'object' || Array.isArray(setup)
    || setup.id !== 'setup'
    || Object.keys(setup).some((field) => !allowedFields.has(field))
    || Object.entries(textLimits).some(([field, maxLength]) => (
      typeof setup[field] !== 'string' || setup[field].length > maxLength
    ))
    || !['monthly', 'quarterly'].includes(setup.filingPeriod)
    || !['not-started', 'applied', 'approved'].includes(setup.developerStatus)) {
    throw new Error('ELSTER-Einstellungen ungültig. Bitte Angaben und Feldlängen prüfen.')
  }
}

module.exports = { validateElsterSetupEntries }
