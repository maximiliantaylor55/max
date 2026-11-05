const test = require('node:test')
const assert = require('node:assert/strict')
const { initiateCall, normalizeCredentials, normalizeExtension, normalizePhoneNumber } = require('../functions/sipgate.cjs')

test('validates and normalizes sipgate extensions and phone numbers', () => {
  assert.equal(normalizeExtension('e14'), 'e14')
  assert.equal(normalizePhoneNumber('+49 (211) 123-4567'), '+492111234567')
  assert.deepEqual(normalizeCredentials({ tokenId: 'token-id', token: 'secret-token', extension: 'p0' }), {
    tokenId: 'token-id',
    token: 'secret-token',
    extension: 'p0',
  })
})

test('rejects invalid sipgate credentials, extensions, and destinations', () => {
  assert.throws(() => normalizeCredentials({ tokenId: '', token: 'secret-token', extension: 'e14' }), /Token-ID/)
  assert.throws(() => normalizeExtension('invalid'), /Erweiterung/)
  assert.throws(() => normalizePhoneNumber('not a phone number'), /Mobilnummer/)
})

test('starts an external call from the configured sipgate extension', async () => {
  let request
  const result = await initiateCall(
    { tokenId: 'token-id', token: 'secret-token', extension: 'e14' },
    '+49 211 1234567',
    async (url, options) => {
      request = { url, options }
      return { ok: true, json: async () => ({ sessionId: 'call-session-1' }) }
    },
  )

  assert.equal(result.sessionId, 'call-session-1')
  assert.equal(request.url, 'https://api.sipgate.com/v2/sessions/calls')
  assert.equal(request.options.method, 'POST')
  assert.equal(request.options.headers.Authorization, `Basic ${Buffer.from('token-id:secret-token').toString('base64')}`)
  assert.deepEqual(JSON.parse(request.options.body), { from: 'e14', to: '+492111234567' })
})

test('reports rejected sipgate credentials and missing call session IDs', async () => {
  await assert.rejects(
    initiateCall({ tokenId: 'id', token: 'secret', extension: 'e14' }, '+492111234567', async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })),
    /Token prüfen und sipgate.io/,
  )
  await assert.rejects(
    initiateCall({ tokenId: 'id', token: 'secret', extension: 'e14' }, '+492111234567', async () => ({
      ok: true,
      json: async () => ({}),
    })),
    /keine Anruf-ID/,
  )
})
