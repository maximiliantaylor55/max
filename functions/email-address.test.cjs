const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeEmailAddress, canonicalEmailAddress } = require('./email-address.cjs')

test('normalizes internationalized domains to their SMTP-compatible ASCII form', () => {
  assert.equal(normalizeEmailAddress('  Müller@bücher.de  '), 'Müller@xn--bcher-kva.de')
})

test('supports umlauts and common punctuation in internationalized local parts', () => {
  assert.equal(normalizeEmailAddress('jörg.müller+shop@example.de'), 'jörg.müller+shop@example.de')
})

test('canonicalizes email addresses for case-insensitive customer lookups', () => {
  assert.equal(canonicalEmailAddress('MÜLLER@BÜCHER.DE'), 'müller@xn--bcher-kva.de')
})

test('rejects malformed, oversized, or invalid internationalized email addresses', () => {
  for (const address of ['no-address', 'a@@example.de', '.a@example.de', 'a..b@example.de', 'a@-example.de', 'a@exa_mple.de', 'a@.de', `${'a'.repeat(65)}@example.de`]) {
    assert.throws(() => normalizeEmailAddress(address), /E-Mail-Adresse ungültig/)
  }
})
