const assert = require('node:assert/strict')
const test = require('node:test')
const {
  buildInquiryLink,
  buildInquiryThread,
  buildReplySubject,
  buildTeamReplyEmail,
  createInquiryAccessToken,
  validateInquiryReply,
  verifyInquiryAccessToken,
} = require('./inquiry-helpers.cjs')

const timestamp = (iso) => ({ toDate: () => new Date(iso) })

test('creates unguessable tokens and verifies only the exact token', () => {
  const token = createInquiryAccessToken()
  assert.ok(token.length >= 32)
  assert.equal(verifyInquiryAccessToken(token, token), true)
  assert.equal(verifyInquiryAccessToken(token, `${token.slice(0, -1)}x`), false)
  assert.equal(verifyInquiryAccessToken('', ''), false)
})

test('builds a customer link without leaking unsafe characters', () => {
  const link = buildInquiryLink('abc123', 'a b&c')
  assert.match(link, /\/anfrage\.html\?id=abc123&t=a%20b%26c$/)
})

test('builds a thread from the new format and from legacy inquiries', () => {
  const modern = buildInquiryThread({ thread: [{ from: 'team', text: 'Hallo', at: timestamp('2026-10-21T10:00:00Z') }, { from: 'x', text: 'Danke', at: null }] })
  assert.deepEqual(modern.map((entry) => entry.from), ['team', 'customer'])

  const legacy = buildInquiryThread({
    message: 'Frage',
    createdAt: timestamp('2026-10-21T09:00:00Z'),
    replies: [{ text: 'Antwort', sentAt: timestamp('2026-10-21T10:00:00Z') }],
  })
  assert.deepEqual(legacy.map((entry) => [entry.from, entry.text]), [['customer', 'Frage'], ['team', 'Antwort']])
})

test('validates reply length and subject prefix', () => {
  assert.throws(() => validateInquiryReply(' '))
  assert.throws(() => validateInquiryReply('x'.repeat(4001)))
  assert.equal(validateInquiryReply('  Hallo  '), 'Hallo')
  assert.equal(buildReplySubject('Frage\r\nBcc: x@example.com'), 'Re: Frage Bcc: x@example.com')
  assert.equal(buildReplySubject('Re: Frage'), 'Re: Frage')
})

test('team reply email escapes content and contains signature and reply link', () => {
  const email = buildTeamReplyEmail({ reply: '<b>Hi</b>', link: 'https://example.com/anfrage.html?id=1&t=2' })
  assert.ok(!email.html.includes('<b>Hi</b>'))
  assert.ok(email.html.includes('&lt;b&gt;Hi&lt;/b&gt;'))
  assert.ok(email.text.includes('www.zyro-getränke.de'))
  assert.ok(email.text.includes('https://example.com/anfrage.html?id=1&t=2'))
})
