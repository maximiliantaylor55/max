const assert = require('node:assert/strict')
const test = require('node:test')
const { normalizeMailboxLink } = require('./mailbox-links.cjs')

test('allows web and email links from email bodies', () => {
  assert.equal(normalizeMailboxLink('https://example.com/path'), 'https://example.com/path')
  assert.equal(normalizeMailboxLink('http://example.com'), 'http://example.com/')
  assert.equal(normalizeMailboxLink('mailto:team@example.com'), 'mailto:team@example.com')
})

test('rejects unsafe and malformed email links', () => {
  for (const value of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'https://user:pass@example.com', 'not a URL']) {
    assert.throws(() => normalizeMailboxLink(value))
  }
  assert.throws(() => normalizeMailboxLink(`https://example.com/${'x'.repeat(2048)}`))
})
