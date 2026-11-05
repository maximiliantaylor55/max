const test = require('node:test')
const assert = require('node:assert/strict')
const {
  hashCustomerActionToken,
  isCustomerVerificationTokenValid,
} = require('./customer-verification.cjs')

test('accepts a matching, unexpired verification token', () => {
  const token = 'customer-verification-token'
  const credentials = {
    verificationTokenHash: hashCustomerActionToken(token),
    verificationExpiresAt: { toMillis: () => 2000 },
  }

  assert.equal(isCustomerVerificationTokenValid(credentials, token, 1000), true)
})

test('rejects invalid and expired verification tokens', () => {
  const token = 'customer-verification-token'
  const credentials = {
    verificationTokenHash: hashCustomerActionToken(token),
    verificationExpiresAt: { toMillis: () => 1000 },
  }

  assert.equal(isCustomerVerificationTokenValid(credentials, 'different-token', 500), false)
  assert.equal(isCustomerVerificationTokenValid(credentials, token, 1000), false)
})

test('accepts only the original token when the account is already verified', () => {
  const token = 'customer-verification-token'
  const credentials = {
    verifiedAt: { seconds: 1 },
    verifiedTokenHash: hashCustomerActionToken(token),
  }

  assert.equal(isCustomerVerificationTokenValid(credentials, token), true)
  assert.equal(isCustomerVerificationTokenValid(credentials, 'different-token'), false)
  assert.equal(isCustomerVerificationTokenValid({ verifiedAt: credentials.verifiedAt }, token), false)
})
