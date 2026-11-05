const { normalizeEmailAddress } = require('./email-address.cjs')

const defaultCompanyDetails = {
  id: 'global',
  name: 'Liberty Street Food GmbH',
  street: 'Birlenbacherstr 59',
  postalCode: '57078',
  city: 'Siegen',
  country: 'Deutschland',
  taxNumber: '044/238/25255',
  vatId: 'DE458399062',
  iban: 'DE42460500010030988323',
  email: 'info@zyro-getränke.de',
  phone: '',
  website: 'https://www.zyro-getränke.de',
  managingDirectors: '',
  legalForm: '',
  registeredOffice: '',
  commercialRegister: '',
  registrationCourt: '',
  documentLayout: 'zyro',
}

const fieldLimits = {
  name: 120,
  street: 180,
  postalCode: 20,
  city: 100,
  country: 80,
  taxNumber: 40,
  vatId: 40,
  iban: 34,
  email: 254,
  phone: 40,
  website: 200,
  managingDirectors: 300,
  legalForm: 80,
  registeredOffice: 100,
  commercialRegister: 80,
  registrationCourt: 100,
  documentLayout: 20,
}
const documentLayouts = new Set(['zyro', 'modern', 'classic'])
const optionalLegalFields = new Set([
  'managingDirectors',
  'legalForm',
  'registeredOffice',
  'commercialRegister',
  'registrationCourt',
])

const normalizeCompanyDetails = (input = {}) => Object.fromEntries([
  ['id', 'global'],
  ...Object.entries(fieldLimits).map(([field, maxLength]) => [
    field,
    String(input[field] ?? defaultCompanyDetails[field] ?? '').trim().slice(0, maxLength),
  ]),
])

const validateCompanyDetailsEntries = (entries, actor) => {
  if (actor?.role !== 'admin') throw new Error('Firmendaten dürfen nur von einem Admin verwaltet werden.')
  if (!Array.isArray(entries) || entries.length !== 1 || entries[0]?.id !== 'global') {
    throw new Error('Es muss genau ein Firmendatensatz mit der ID „global“ gespeichert werden.')
  }
  for (const [field, maxLength] of Object.entries(fieldLimits)) {
    const value = entries[0][field]
    if ((typeof value !== 'string' && !((optionalLegalFields.has(field) || field === 'documentLayout') && value === undefined)) || value?.length > maxLength) {
      throw new Error(`Das Firmenfeld „${field}“ ist ungültig.`)
    }
    if (field === 'documentLayout' && value !== undefined && !documentLayouts.has(value)) {
      throw new Error('Das Dokumentlayout ist ungültig.')
    }
  }
  const details = normalizeCompanyDetails(entries[0])
  if (!details.name || !details.street || !details.postalCode || !details.city || !details.country) {
    throw new Error('Firmenname, Straße, PLZ, Ort und Land sind erforderlich.')
  }
  if (details.email) {
    try {
      normalizeEmailAddress(details.email)
    } catch {
      throw new Error('Die Firmen-E-Mail-Adresse ist ungültig.')
    }
  }
  if (details.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(details.iban.replace(/\s/g, '').toUpperCase())) {
    throw new Error('Die IBAN ist ungültig.')
  }
  return details
}

module.exports = { defaultCompanyDetails, normalizeCompanyDetails, validateCompanyDetailsEntries }
