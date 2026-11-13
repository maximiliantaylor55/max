// Rezepturentwicklung beauftragen: nutzt den bestehenden Kontakt-Endpunkt (/api/contact),
// damit Anfragen im gleichen Postfach / Anfrage-Thread landen wie normale Kontaktnachrichten.
(() => {
  const form = document.querySelector('#recipe-form')
  const status = document.querySelector('#recipe-status')
  if (!form || !status) return

  const value = (data, key) => String(data.get(key) || '').trim()

  const showError = (text) => {
    status.classList.add('is-error')
    status.textContent = text
  }

  const validate = (data) => {
    if (!value(data, 'name')) return 'Bitte gib deinen Namen ein.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value(data, 'email'))) return 'Bitte gib eine gültige E-Mail-Adresse ein.'
    if (!value(data, 'drinkType')) return 'Bitte wähle eine Getränkeart.'
    if (!value(data, 'projectType')) return 'Bitte wähle die Art des Projekts.'
    if (value(data, 'message').length < 20) return 'Bitte beschreibe deine Idee in mindestens 20 Zeichen.'
    return ''
  }

  const buildMessage = (data) => {
    const requirements = data.getAll('requirements').map(String)
    const lines = [
      'Anfrage Rezepturentwicklung',
      '',
      `Unternehmen: ${value(data, 'company') || '–'}`,
      `Telefon: ${value(data, 'phone') || '–'}`,
      `Getränkeart: ${value(data, 'drinkType')}`,
      `Projekt: ${value(data, 'projectType')}`,
      `Geplante Menge: ${value(data, 'volume') || 'noch offen'}`,
      `Gewünschter Start: ${value(data, 'timeline') || 'noch offen'}`,
      `Anforderungen: ${requirements.length ? requirements.join(', ') : '–'}`,
      '',
      'Idee / Briefing:',
      value(data, 'message'),
    ]
    return lines.join('\n').slice(0, 4000)
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    status.classList.remove('is-error')
    const problem = validate(data)
    if (problem) return showError(problem)

    const submitButton = form.querySelector('[type="submit"]')
    const who = value(data, 'company') || value(data, 'name')
    submitButton.disabled = true
    status.textContent = 'Anfrage wird gesendet …'

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: value(data, 'name'),
          email: value(data, 'email'),
          subject: `Rezepturentwicklung: ${value(data, 'drinkType')} – ${who}`.slice(0, 120),
          message: buildMessage(data),
          website: value(data, 'website'),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Anfrage konnte nicht gesendet werden.')
      form.reset()
      status.textContent = result.confirmationEmailSent
        ? 'Danke! Deine Anfrage ist bei uns eingegangen. Eine Bestätigung ist per E-Mail unterwegs – wir melden uns zeitnah für ein Erstgespräch.'
        : 'Deine Anfrage wurde gespeichert, aber die Eingangsbestätigung konnte nicht per E-Mail gesendet werden. Bitte prüfe deine Adresse.'
      if (!result.confirmationEmailSent) status.classList.add('is-error')
    } catch (error) {
      showError(error.message || 'Anfrage konnte nicht gesendet werden. Bitte versuche es später erneut.')
    } finally {
      submitButton.disabled = false
    }
  })
})()
