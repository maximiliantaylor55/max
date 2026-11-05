const test = require('node:test')
const assert = require('node:assert/strict')
const { hashCustomerPassword, validateCustomerPassword, verifyCustomerPassword } = require('./customer-password.cjs')

test('requires a long customer password and verifies it with a salted hash', async () => {
  assert.throws(() => validateCustomerPassword('short'), /zwischen 12 und 128/)
  assert.throws(() => validateCustomerPassword('x'.repeat(129)), /zwischen 12 und 128/)
  const credentials = await hashCustomerPassword('sicheres passwort 123')
  assert.notEqual(credentials.passwordSalt, credentials.passwordHash)
  assert.equal(await verifyCustomerPassword('sicheres passwort 123', credentials), true)
  assert.equal(await verifyCustomerPassword('falsches passwort 123', credentials), false)
  assert.equal(await verifyCustomerPassword('sicheres passwort 123', {}), false)
})
