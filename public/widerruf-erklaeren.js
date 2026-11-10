// Elektronische Widerrufsfunktion (§ 356a BGB) – ausgelagert, damit die Content-Security-Policy das Skript erlaubt.
(() => {
  const form = document.getElementById('wd-form')
  const steps = [1, 2, 3].map((n) => document.getElementById(`step-${n}`))
  const show = (n) => steps.forEach((step, i) => { step.hidden = i !== n - 1 })
  const error = (n, message) => {
    const el = document.getElementById(`wd-error-${n}`)
    el.textContent = message || ''
    el.hidden = !message
  }
  let data = null
  const declaration = (d) => [
    'Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über den Kauf der folgenden Waren:',
    d.items || 'gesamte Bestellung',
    `Bestellung: ${d.order}`,
    `Name: ${d.name}`,
  ].join('\n')

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(form))
    data = {
      name: String(values.name || '').trim(),
      email: String(values.email || '').trim(),
      order: String(values.order || '').trim(),
      items: String(values.items || '').trim(),
      website: String(values.website || ''),
    }
    if (!data.name) return error(1, 'Bitte deinen Namen angeben.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return error(1, 'Bitte eine gültige E-Mail-Adresse angeben.')
    if (!data.order) return error(1, 'Bitte die Bestellnummer oder das Bestelldatum angeben.')
    error(1, '')
    document.getElementById('wd-preview').textContent = declaration(data)
    document.getElementById('wd-preview-email').textContent = data.email
    show(2)
  })

  document.getElementById('wd-back').addEventListener('click', () => show(1))

  document.getElementById('wd-confirm').addEventListener('click', async (event) => {
    const button = event.currentTarget
    button.disabled = true
    error(2, '')
    try {
      const response = await fetch('/api/withdrawal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Der Widerruf konnte nicht übermittelt werden.')
      document.getElementById('wd-time').textContent = result.receivedAt || ''
      document.getElementById('wd-ref').textContent = result.reference || ''
      document.getElementById('wd-final').textContent = result.declaration || declaration(data)
      document.getElementById('wd-mail-note').textContent = result.confirmationEmailSent
        ? `Die Eingangsbestätigung wurde an ${data.email} gesendet.`
        : 'Die Bestätigungs-E-Mail konnte gerade nicht versendet werden. Dein Widerruf ist trotzdem bei uns eingegangen. Bitte speichere diese Seite oder mache einen Screenshot.'
      show(3)
      document.querySelector('.legal-main h1').textContent = 'Widerruf übermittelt'
      const done = document.getElementById('step-3')
      done.scrollIntoView({ behavior: 'smooth', block: 'start' })
      done.focus({ preventScroll: true })
    } catch (failure) {
      error(2, `${failure.message} Du kannst den Widerruf auch per E-Mail an info@zyro-getränke.de senden.`)
    } finally {
      button.disabled = false
    }
  })
})()
