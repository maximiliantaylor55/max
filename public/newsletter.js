// ZYRO Newsletter-Anmeldung (Double-Opt-in): sendet die Anmeldung, Bestätigung kommt per E-Mail.
(() => {
  const form = document.getElementById('newsletter-form')
  if (!form) return
  const status = document.getElementById('newsletter-status')
  const button = form.querySelector('button[type="submit"]')
  const setStatus = (text, type) => {
    status.textContent = text
    status.className = `zyro-newsletter-status${type ? ` is-${type}` : ''}`
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const email = form.email.value.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setStatus('Bitte gib eine gültige E-Mail-Adresse ein.', 'error')
    if (!form.consent.checked) return setStatus('Bitte bestätige, dass du den Newsletter erhalten möchtest.', 'error')
    button.disabled = true
    setStatus('Einen Moment …')
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: form.name.value.trim(), consent: true, website: form.website.value }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Die Anmeldung hat nicht geklappt.')
      if (result.alreadyActive) {
        setStatus('Du bist schon angemeldet – schön, dass du dabei bist! 🍑', 'success')
      } else {
        setStatus('Fast geschafft! Bitte bestätige deine Anmeldung über den Link in der E-Mail, die wir dir gerade geschickt haben.', 'success')
        window.dispatchEvent(new CustomEvent('zyro:newsletter-signup'))
      }
      form.reset()
    } catch (error) {
      setStatus(error.message, 'error')
    } finally {
      button.disabled = false
    }
  })
})()
