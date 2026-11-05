const crypto = require('node:crypto')

const publicBaseUrl = 'https://xn--zyro-getrnke-ocb.de'
const defaultNotifyEmail = 'info@libertystreetfood.de'
const inquiryStatuses = ['new', 'customer_replied', 'replied', 'closed']

const signatureText = '# ZYRO\nTASTE THE DIFFERENCE.\n\nZYRO Beverage Brand\n\nby Liberty Street Food GmbH\n\nLiberty Street Food GmbH\n\nBirlenbacherstr. 59, 57078 Siegen, Deutschland\n\nwww.zyro-getränke.de'
const signatureHtml = '<p><strong># ZYRO</strong><br>TASTE THE DIFFERENCE.</p><p>ZYRO Beverage Brand</p><p>by Liberty Street Food GmbH</p><p>Liberty Street Food GmbH<br>Birlenbacherstr. 59, 57078 Siegen, Deutschland</p><p><a href="https://www.xn--zyro-getrnke-ocb.de">www.zyro-getränke.de</a></p>'

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])

const toHtmlParagraph = (text) => `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`

const createInquiryAccessToken = () => crypto.randomBytes(24).toString('base64url')

const verifyInquiryAccessToken = (stored, provided) => {
  const expected = Buffer.from(String(stored || ''))
  const actual = Buffer.from(String(provided || ''))
  return expected.length >= 32 && expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

const buildInquiryLink = (inquiryId, accessToken) => `${publicBaseUrl}/anfrage.html?id=${encodeURIComponent(inquiryId)}&t=${encodeURIComponent(accessToken)}`

const toIsoString = (value) => value?.toDate?.().toISOString() || null

// Older inquiries stored the first message and the team replies in separate fields.
const buildInquiryThread = (data) => {
  if (Array.isArray(data.thread)) {
    return data.thread.map((entry) => ({
      from: entry.from === 'team' ? 'team' : 'customer',
      text: String(entry.text || ''),
      at: toIsoString(entry.at),
    }))
  }
  return [
    { from: 'customer', text: String(data.message || ''), at: toIsoString(data.createdAt) },
    ...(Array.isArray(data.replies) ? data.replies : []).map((reply) => ({
      from: 'team',
      text: String(reply.text || ''),
      at: toIsoString(reply.sentAt),
    })),
  ]
}

const validateInquiryReply = (input, label = 'Antwort') => {
  const text = String(input || '').trim()
  if (text.length < 2 || text.length > 4000) throw new Error(`${label} muss zwischen 2 und 4000 Zeichen lang sein.`)
  return text
}

const buildReplySubject = (subject) => {
  const clean = String(subject || '').replace(/[\r\n]+/g, ' ').slice(0, 200)
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`
}

const buildTeamReplyEmail = ({ reply, link }) => ({
  text: `${reply}\n\nDu kannst hier antworten und den Verlauf ansehen:\n${link}\n\n${signatureText}`,
  html: `${toHtmlParagraph(reply)}<p><a href="${escapeHtml(link)}">Hier antworten und den Verlauf ansehen</a></p>${signatureHtml}`,
})

const buildCustomerReceiptEmail = ({ name, link }) => ({
  text: `Hallo ${name},\n\nvielen Dank für deine Nachricht. Wir haben sie erhalten und melden uns so schnell wie möglich.\n\nDeine Anfrage und unsere Antworten findest du hier, dort kannst du auch jederzeit antworten:\n${link}\n\n${signatureText}`,
  html: `<p>Hallo ${escapeHtml(name)},</p><p>vielen Dank für deine Nachricht. Wir haben sie erhalten und melden uns so schnell wie möglich.</p><p><a href="${escapeHtml(link)}">Anfrage ansehen und antworten</a></p>${signatureHtml}`,
})

const buildTeamNotificationEmail = ({ kind, inquiry, text }) => {
  const heading = kind === 'customer_reply' ? 'Neue Antwort eines Kunden' : 'Neue Nachricht über die ZYRO-Markenwebsite'
  return {
    text: `${heading}\n\nName: ${inquiry.name}\nE-Mail: ${inquiry.email}\nBetreff: ${inquiry.subject}\n\n${text}\n\nBitte in der Zyro-Management-App unter „Neue Anfragen“ antworten.`,
    html: `<h2>${escapeHtml(heading)}</h2><p><strong>Name:</strong> ${escapeHtml(inquiry.name)}</p><p><strong>E-Mail:</strong> ${escapeHtml(inquiry.email)}</p><p><strong>Betreff:</strong> ${escapeHtml(inquiry.subject)}</p>${toHtmlParagraph(text)}<p>Bitte in der Zyro-Management-App unter „Neue Anfragen“ antworten.</p>`,
  }
}

module.exports = {
  defaultNotifyEmail,
  inquiryStatuses,
  signatureText,
  signatureHtml,
  createInquiryAccessToken,
  verifyInquiryAccessToken,
  buildInquiryLink,
  buildInquiryThread,
  validateInquiryReply,
  buildReplySubject,
  buildTeamReplyEmail,
  buildCustomerReceiptEmail,
  buildTeamNotificationEmail,
}
