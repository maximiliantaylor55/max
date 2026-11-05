const iterations = 310000
const envelopeId = 'hr-employees'
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const employeeStatuses = ['Aktiv', 'Abwesend', 'Ausgeschieden']

const encodeBase64 = (bytes) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const decodeBase64 = (value) => {
  if (typeof value !== 'string' || value.length > 200000) throw new Error('Verschlüsselte HR-Daten sind ungültig.')
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const getCrypto = () => {
  if (!globalThis.crypto?.subtle) throw new Error('Sichere Verschlüsselung ist auf diesem Gerät nicht verfügbar.')
  return globalThis.crypto
}

const deriveKey = async (passphrase, salt) => {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 256) {
    throw new Error('Das Schutzpasswort muss zwischen 12 und 256 Zeichen lang sein.')
  }
  const cryptoProvider = getCrypto()
  const material = await cryptoProvider.subtle.importKey('raw', textEncoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return cryptoProvider.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export const normalizeSocialSecurityNumber = (value) => {
  const normalized = String(value || '').toUpperCase().replace(/[\s-]/g, '')
  if (!/^\d{8}[A-Z]\d{3}$/.test(normalized)) {
    throw new Error('Die SV-Nummer muss dem deutschen Format entsprechen (12 Zeichen, z. B. 15 070649 C 103).')
  }
  const letter = normalized[8]
  const digits = `${normalized.slice(0, 8)}${String(letter.charCodeAt(0) - 64).padStart(2, '0')}${normalized.slice(9, 11)}`
  const weights = [2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1]
  const checksum = [...digits].reduce((sum, character, index) => {
    const product = Number(character) * weights[index]
    return sum + Math.floor(product / 10) + product % 10
  }, 0) % 10
  if (checksum !== Number(normalized[11])) throw new Error('Die Prüfziffer der SV-Nummer ist ungültig.')
  return normalized
}

const normalizeEmployeeEntries = (employees) => {
  if (!Array.isArray(employees) || employees.length > 1000) throw new Error('Mitarbeiterdaten sind ungültig.')
  const ids = new Set()
  return employees.map((employee) => {
    if (!employee || typeof employee !== 'object' || Array.isArray(employee)) throw new Error('Mitarbeiterdaten sind ungültig.')
    const id = String(employee.id || '')
    const name = String(employee.name || '').trim()
    const reference = String(employee.reference || '').trim()
    const department = String(employee.department || '').trim()
    const position = String(employee.position || '').trim()
    const startDate = String(employee.startDate || '')
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || ids.has(id)) throw new Error('Mitarbeiterzuordnung ist ungültig oder doppelt.')
    if (!name || name.length > 120 || reference.length > 60 || department.length > 100 || position.length > 120) {
      throw new Error('Bitte prüfe Name, Personalnummer, Abteilung und Tätigkeit.')
    }
    if (!employeeStatuses.includes(employee.status)) throw new Error('Mitarbeiterstatus ist ungültig.')
    if (startDate && !isValidDate(startDate)) {
      throw new Error('Das Eintrittsdatum ist ungültig.')
    }
    ids.add(id)
    return {
      id,
      name,
      reference,
      department,
      position,
      startDate,
      status: employee.status,
      createdAt: String(employee.createdAt || ''),
      updatedAt: String(employee.updatedAt || ''),
    }
  })
}

const normalizeHrEntries = (entries) => {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('HR-Daten sind ungültig.')
  const employees = normalizeEmployeeEntries(entries.employees || [])
  if (!entries.svNumbers || typeof entries.svNumbers !== 'object' || Array.isArray(entries.svNumbers)) throw new Error('SV-Daten sind ungültig.')
  const pairs = Object.entries(entries.svNumbers)
  if (pairs.length > 1000) throw new Error('Es können höchstens 1.000 SV-Datensätze geschützt werden.')
  const employeeIds = new Set(employees.map((employee) => employee.id))
  const svNumbers = Object.fromEntries(pairs.map(([employeeId, number]) => {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(employeeId)) throw new Error('Mitarbeiterzuordnung der SV-Daten ist ungültig.')
    if (!employeeIds.has(employeeId)) throw new Error('Die SV-Nummer gehört zu keinem gespeicherten Mitarbeiter.')
    return [employeeId, normalizeSocialSecurityNumber(number)]
  }))
  return { employees, svNumbers }
}

export const encryptHrSensitiveData = async (entries, passphrase) => {
  const cryptoProvider = getCrypto()
  const salt = cryptoProvider.getRandomValues(new Uint8Array(16))
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const plaintext = textEncoder.encode(JSON.stringify(normalizeHrEntries(entries)))
  const ciphertext = await cryptoProvider.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return {
    id: envelopeId,
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations,
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
    updatedAt: new Date().toISOString(),
  }
}

export const decryptHrSensitiveData = async (envelope, passphrase) => {
  if (!envelope || envelope.id !== envelopeId || envelope.version !== 1
    || envelope.algorithm !== 'AES-GCM' || envelope.kdf !== 'PBKDF2-SHA-256'
    || envelope.iterations !== iterations) {
    throw new Error('Verschlüsselter HR-Datensatz ist ungültig oder wird nicht unterstützt.')
  }
  const salt = decodeBase64(envelope.salt)
  const iv = decodeBase64(envelope.iv)
  const ciphertext = decodeBase64(envelope.ciphertext)
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) {
    throw new Error('Verschlüsselter HR-Datensatz ist beschädigt.')
  }
  const key = await deriveKey(passphrase, salt)
  let plaintext
  try {
    plaintext = await getCrypto().subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  } catch {
    throw new Error('Passwort falsch oder verschlüsselte HR-Daten beschädigt.')
  }
  let parsed
  try {
    parsed = JSON.parse(textDecoder.decode(plaintext))
    return normalizeHrEntries(parsed)
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Verschlüsselte HR-Daten sind beschädigt.')
    throw error
  }
}

export const createHrEmployee = (draft, existingEmployees = [], editingId = '') => {
  const name = String(draft?.name || '').trim()
  const reference = String(draft?.reference || '').trim()
  const department = String(draft?.department || '').trim()
  const position = String(draft?.position || '').trim()
  const status = String(draft?.status || '')
  const startDate = String(draft?.startDate || '')
  if (!name || name.length > 120 || reference.length > 60 || department.length > 100 || position.length > 120) {
    throw new Error('Name ist erforderlich. Personalnummer, Abteilung und Tätigkeit dürfen ihre Höchstlänge nicht überschreiten.')
  }
  if (!employeeStatuses.includes(status)) throw new Error('Bitte wähle einen gültigen Mitarbeiterstatus.')
  if (startDate && !isValidDate(startDate)) {
    throw new Error('Das Eintrittsdatum ist ungültig.')
  }
  const previous = existingEmployees.find((employee) => String(employee.id) === String(editingId))
  if (reference && existingEmployees.some((employee) => String(employee.id) !== String(editingId)
    && String(employee.reference || '').trim().toLocaleLowerCase() === reference.toLocaleLowerCase())) {
    throw new Error('Diese Personalnummer ist bereits einem anderen Mitarbeiter zugeordnet.')
  }
  const timestamp = new Date().toISOString()
  return {
    id: previous?.id || crypto.randomUUID(),
    name,
    reference,
    department,
    position,
    startDate,
    status,
    createdAt: previous?.createdAt || timestamp,
    updatedAt: timestamp,
  }
}
