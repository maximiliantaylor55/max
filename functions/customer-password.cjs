const crypto = require('node:crypto')

const passwordMinLength = 12
const passwordMaxLength = 128

const validateCustomerPassword = (value) => {
  if (typeof value !== 'string' || value.length < passwordMinLength || value.length > passwordMaxLength) {
    throw new Error(`Das Passwort muss zwischen ${passwordMinLength} und ${passwordMaxLength} Zeichen lang sein.`)
  }
  return value
}

const derivePasswordHash = (password, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derivedKey) => {
    if (error) reject(error)
    else resolve(derivedKey)
  })
})

const hashCustomerPassword = async (passwordInput) => {
  const password = validateCustomerPassword(passwordInput)
  const salt = crypto.randomBytes(16)
  const hash = await derivePasswordHash(password, salt)
  return { passwordSalt: salt.toString('hex'), passwordHash: hash.toString('hex') }
}

const verifyCustomerPassword = async (passwordInput, credentials) => {
  if (typeof passwordInput !== 'string'
    || !/^[0-9a-f]{32}$/i.test(String(credentials?.passwordSalt || ''))
    || !/^[0-9a-f]{128}$/i.test(String(credentials?.passwordHash || ''))) return false
  const expected = Buffer.from(credentials.passwordHash, 'hex')
  const actual = await derivePasswordHash(passwordInput, Buffer.from(credentials.passwordSalt, 'hex'))
  return crypto.timingSafeEqual(expected, actual)
}

module.exports = {
  hashCustomerPassword,
  validateCustomerPassword,
  verifyCustomerPassword,
}
