const { canonicalEmailAddress } = require('./email-address.cjs')

const validateContactMessage = (input) => {
  const name = String(input?.name || '').trim()
  let email
  try {
    email = canonicalEmailAddress(input?.email)
  } catch {
    throw new Error('Bitte gib eine gültige E-Mail-Adresse ein.')
  }
  const subject = String(input?.subject || '').trim()
  const message = String(input?.message || '').trim()
  if (!name || name.length > 100) throw new Error('Bitte gib einen Namen mit höchstens 100 Zeichen ein.')
  if (!subject || subject.length > 120) throw new Error('Bitte gib einen Betreff mit höchstens 120 Zeichen ein.')
  if (message.length < 10 || message.length > 4000) throw new Error('Deine Nachricht muss zwischen 10 und 4000 Zeichen lang sein.')
  return { name, email, subject, message }
}

module.exports = { validateContactMessage }