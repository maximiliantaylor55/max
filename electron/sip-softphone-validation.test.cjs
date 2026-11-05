const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeSipSoftphoneSettings } = require('../functions/sip-softphone-validation.cjs')

test('normalizes a secure SIP over WebSocket configuration', () => {
  assert.deepEqual(normalizeSipSoftphoneSettings({
    websocketServer: 'wss://sip.example.com/ws',
    sipUri: 'sip:zyro@example.com',
    username: 'zyro-user',
    password: 'secret',
    displayName: 'Zyro',
  }), {
    websocketServer: 'wss://sip.example.com/ws',
    sipUri: 'sip:zyro@example.com',
    username: 'zyro-user',
    password: 'secret',
    displayName: 'Zyro',
  })
})

test('retains a saved password when other SIP settings are changed', () => {
  const result = normalizeSipSoftphoneSettings({
    websocketServer: 'wss://sip.example.com',
    sipUri: 'sip:zyro@example.com',
    username: 'zyro-user',
  }, 'previous-secret')
  assert.equal(result.password, 'previous-secret')
})

test('rejects insecure signaling and malformed SIP settings', () => {
  const valid = {
    websocketServer: 'wss://sip.example.com',
    sipUri: 'sip:zyro@example.com',
    username: 'zyro-user',
    password: 'secret',
  }
  assert.throws(() => normalizeSipSoftphoneSettings({ ...valid, websocketServer: 'ws://sip.example.com' }), /sichere WSS/)
  assert.throws(() => normalizeSipSoftphoneSettings({ ...valid, sipUri: 'invalid' }), /SIP-Adresse/)
  assert.throws(() => normalizeSipSoftphoneSettings({ ...valid, password: '' }), /SIP-Passwort/)
})
