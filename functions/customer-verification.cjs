const crypto = require('node:crypto')

const hashCustomerActionToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

const tokenHashMatches = (storedHash, token) => {
  const stored = Buffer.from(String(storedHash || ''), 'hex')
  const provided = Buffer.from(hashCustomerActionToken(token), 'hex')
  return stored.length === provided.length && stored.length > 0 && crypto.timingSafeEqual(stored, provided)
}

const isCustomerVerificationTokenValid = (credentials, token, now = Date.now()) => {
  if (credentials?.verifiedAt) return tokenHashMatches(credentials.verifiedTokenHash, token)
  return Boolean(credentials?.verificationExpiresAt
    && credentials.verificationExpiresAt.toMillis() > now
    && tokenHashMatches(credentials.verificationTokenHash, token))
}

module.exports = {
  hashCustomerActionToken,
  tokenHashMatches,
  isCustomerVerificationTokenValid,
}
