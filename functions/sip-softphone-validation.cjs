const normalizeSipSoftphoneSettings = (value = {}, existingPassword = '') => {
  const websocketServer = String(value.websocketServer || '').trim()
  const sipUri = String(value.sipUri || '').trim()
  const username = String(value.username || '').trim()
  const password = String(value.password || existingPassword || '')
  const displayName = String(value.displayName || '').trim()

  let serverUrl
  try {
    serverUrl = new URL(websocketServer)
  } catch {
    throw new Error('Bitte die WSS-Adresse des SIP-Providers eintragen.')
  }
  if (serverUrl.protocol !== 'wss:' || !serverUrl.hostname || serverUrl.username || serverUrl.password) {
    throw new Error('Der SIP-Server muss eine sichere WSS-Adresse ohne Zugangsdaten sein.')
  }
  if (websocketServer.length > 500) throw new Error('Die SIP-Server-Adresse ist zu lang.')
  if (!/^sips?:[^@\s]+@[^@\s]+$/i.test(sipUri) || sipUri.length > 255) {
    throw new Error('Bitte eine gültige SIP-Adresse wie sip:benutzer@anbieter.de eintragen.')
  }
  if (!username || username.length > 128 || /[\r\n]/.test(username)) {
    throw new Error('Bitte den SIP-Anmeldenamen eintragen.')
  }
  if (!password || password.length > 500) {
    throw new Error('Bitte das SIP-Passwort eintragen.')
  }
  if (displayName.length > 100 || /[\r\n]/.test(displayName)) {
    throw new Error('Der Anzeigename ist ungültig oder zu lang.')
  }

  return { websocketServer, sipUri, username, password, displayName }
}

module.exports = { normalizeSipSoftphoneSettings }
