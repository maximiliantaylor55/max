const apiUrl = 'https://api.sipgate.com/v2/sessions/calls'
const extensionPattern = /^[epxy]\d{1,6}$/i

const normalizeExtension = (value) => {
  const extension = String(value || '').trim()
  if (!extensionPattern.test(extension)) {
    throw new Error('Bitte eine gültige sipgate-Erweiterung wie e14 oder p0 eintragen.')
  }
  return extension
}

const normalizePhoneNumber = (value) => {
  const number = String(value || '').trim().replace(/[\s()./-]/g, '')
  if (!/^\+?\d{6,20}$/.test(number)) {
    throw new Error('Bitte eine gültige Festnetz- oder Mobilnummer mit Vorwahl eingeben.')
  }
  return number
}

const normalizeCredentials = (value = {}) => {
  const tokenId = String(value.tokenId || '').trim()
  const token = String(value.token || '').trim()
  if (!tokenId || tokenId.length > 200 || !token || token.length > 500) {
    throw new Error('Bitte eine gültige sipgate Token-ID und ein persönliches Zugriffstoken eintragen.')
  }
  return { tokenId, token, extension: normalizeExtension(value.extension) }
}

const initiateCall = async (credentials, destination, fetchImpl = fetch) => {
  const config = normalizeCredentials(credentials)
  const to = normalizePhoneNumber(destination)
  let response
  try {
    response = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.tokenId}:${config.token}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: config.extension, to }),
      signal: AbortSignal.timeout(15000),
    })
  } catch (error) {
    throw new Error(`sipgate ist nicht erreichbar: ${error.message}`)
  }

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('sipgate hat die Anmeldung abgelehnt. Token prüfen und sipgate.io im Konto aktivieren.')
    }
    const providerMessage = [result.message, result.error].find((message) => typeof message === 'string' && message.trim())
    throw new Error(providerMessage || `sipgate-Anruf fehlgeschlagen (${response.status}).`)
  }
  if (!result.sessionId) throw new Error('sipgate hat keine Anruf-ID zurückgegeben.')
  return { sessionId: String(result.sessionId) }
}

module.exports = { initiateCall, normalizeCredentials, normalizeExtension, normalizePhoneNumber }
