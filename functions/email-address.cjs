const { domainToASCII } = require('node:url')

const normalizeEmailAddress = (input) => {
  if (typeof input !== 'string') throw new Error('E-Mail-Adresse ungültig.')
  const value = input.trim().normalize('NFC')
  const at = value.indexOf('@')
  if (at < 1 || at !== value.lastIndexOf('@')) throw new Error('E-Mail-Adresse ungültig.')

  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  const localBytes = Buffer.byteLength(local, 'utf8')
  const asciiDomain = domainToASCII(domain).toLowerCase()
  const labels = asciiDomain.split('.')

  if (!local
    || localBytes > 64
    || !/^[\p{L}\p{N}!#$%&'*+/=?^_`{|}~.-]+$/u.test(local)
    || local.startsWith('.')
    || local.endsWith('.')
    || local.includes('..')
    || !asciiDomain
    || Buffer.byteLength(asciiDomain, 'ascii') > 253
    || labels.length < 2
    || labels.some((label) => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
    || Buffer.byteLength(`${local}@${asciiDomain}`, 'utf8') > 254) {
    throw new Error('E-Mail-Adresse ungültig.')
  }

  return `${local}@${asciiDomain}`
}

const canonicalEmailAddress = (input) => normalizeEmailAddress(input).toLowerCase()

module.exports = { normalizeEmailAddress, canonicalEmailAddress }
