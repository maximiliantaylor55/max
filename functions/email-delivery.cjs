const { canonicalEmailAddress } = require('./email-address.cjs')

const retryableNetworkCodes = new Set(['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKET', 'EAI_AGAIN', 'EHOSTDOWN', 'EHOSTUNREACH'])

const isRetryableSmtpFailure = (error) => {
  const command = String(error?.command || '').toUpperCase()
  const responseCode = Number(error?.responseCode)
  if (command === 'DATA' && !(responseCode >= 400 && responseCode < 500)) return false
  return retryableNetworkCodes.has(String(error?.code || ''))
    || (responseCode >= 400 && responseCode < 500)
}

const sendWithTransientRetry = async (send, { attempts = 2, delayMs = 300 } = {}) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await send()
    } catch (error) {
      if (attempt >= attempts || !isRetryableSmtpFailure(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt))
    }
  }
}

const ensureRecipientsAccepted = (info, recipients) => {
  const accepted = new Set((info?.accepted || []).map((address) => {
    const value = typeof address === 'string' ? address : address?.address
    try {
      return canonicalEmailAddress(value)
    } catch {
      return ''
    }
  }))
  const missing = recipients.filter((recipient) => !accepted.has(canonicalEmailAddress(recipient)))
  if (missing.length) {
    const error = new Error(`SMTP hat ${missing.length} Empfängeradresse(n) nicht angenommen.`)
    error.code = 'EENVELOPE'
    error.responseCode = info?.responseCode
    throw error
  }
  return info
}

const describeSmtpFailure = (error, context = 'E-Mail-Versand') => {
  const code = String(error?.code || '')
  let reason = 'SMTP-Einstellungen prüfen und erneut versuchen.'
  if (error?.message === 'SMTP-Mailversand ist noch nicht eingerichtet.') {
    reason = 'SMTP-Einstellungen sind noch nicht eingerichtet. Bitte SMTP-Zugangsdaten speichern.'
  } else if (code === 'EAUTH') {
    reason = 'SMTP-Anmeldung abgelehnt. Benutzername und SMTP-Passwort prüfen.'
  } else if (code === 'ENOTFOUND') {
    reason = 'SMTP-Server nicht gefunden. Serveradresse prüfen.'
  } else if (retryableNetworkCodes.has(code)) {
    reason = 'SMTP-Server nicht erreichbar. Server, Port und TLS-Einstellung prüfen.'
  } else if (/SMTPUTF8/i.test(String(error?.response || error?.message || ''))) {
    reason = 'Mailserver akzeptiert diese Empfängeradresse nicht. Domain und Adresse prüfen.'
  } else if (code === 'EENVELOPE') {
    reason = 'Absender- oder Empfängeradresse wurde vom SMTP-Server abgelehnt.'
  }
  return `${context} fehlgeschlagen: ${reason}`
}

module.exports = { describeSmtpFailure, ensureRecipientsAccepted, isRetryableSmtpFailure, sendWithTransientRetry }
