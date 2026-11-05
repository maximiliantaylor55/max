const normalizeMailboxLink = (value) => {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('E-Mail-Link ist ungültig.')

  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('E-Mail-Link ist ungültig.')
  }

  if (!['http:', 'https:', 'mailto:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Dieser Linktyp darf nicht geöffnet werden.')
  }
  if (url.protocol !== 'mailto:' && !url.hostname) throw new Error('E-Mail-Link ist ungültig.')
  return url.href
}

module.exports = { normalizeMailboxLink }
