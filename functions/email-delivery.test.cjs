const test = require('node:test')
const assert = require('node:assert/strict')
const { describeSmtpFailure, ensureRecipientsAccepted, isRetryableSmtpFailure, sendWithTransientRetry } = require('./email-delivery.cjs')

test('requires SMTP acceptance for every recipient', () => {
  const info = { accepted: ['müller@xn--bcher-kva.de'], rejected: [] }
  assert.equal(ensureRecipientsAccepted(info, ['müller@bücher.de']), info)
  assert.throws(() => ensureRecipientsAccepted({ accepted: [], rejected: ['user@example.de'] }, ['user@example.de']), {
    code: 'EENVELOPE',
    message: /nicht angenommen/,
  })
})

test('retries transient SMTP failures and returns the successful send result', async () => {
  let attempts = 0
  const result = await sendWithTransientRetry(async () => {
    attempts += 1
    if (attempts === 1) {
      const error = new Error('Temporary service failure')
      error.responseCode = 451
      throw error
    }
    return { accepted: ['user@example.de'] }
  }, { delayMs: 0 })

  assert.equal(attempts, 2)
  assert.deepEqual(result, { accepted: ['user@example.de'] })
})

test('does not retry permanent SMTP errors or uncertain failures after DATA', () => {
  assert.equal(isRetryableSmtpFailure({ code: 'EAUTH' }), false)
  assert.equal(isRetryableSmtpFailure({ code: 'ECONNRESET', command: 'DATA' }), false)
  assert.equal(isRetryableSmtpFailure({ responseCode: 451, command: 'DATA' }), true)
})

test('reports actionable SMTP failures without exposing server response details', () => {
  assert.match(describeSmtpFailure({ code: 'EAUTH' }), /Benutzername und SMTP-Passwort prüfen/)
  assert.match(describeSmtpFailure(new Error('SMTP-Mailversand ist noch nicht eingerichtet.')), /SMTP-Zugangsdaten speichern/)
  assert.match(describeSmtpFailure({ code: 'ECONNRESET' }, 'Dokumentversand'), /SMTP-Server nicht erreichbar/)
  assert.doesNotMatch(describeSmtpFailure({ code: 'EAUTH', response: 'private server response' }), /private server response/)
})
