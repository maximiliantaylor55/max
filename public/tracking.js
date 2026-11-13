const trackingForm = document.querySelector('#tracking-form')
const trackingInput = document.querySelector('#tracking-token')
const trackingStatus = document.querySelector('#tracking-status')
const trackingResult = document.querySelector('#tracking-result')

const refreshButton = document.querySelector('#tracking-refresh')
const checkedAt = document.querySelector('#tracking-checked-at')
let currentToken = ''

// refresh = true: Prüfung auf Abruf – das bisherige Ergebnis bleibt sichtbar, bis die neue Antwort da ist.
const showTracking = async (token, { refresh = false } = {}) => {
  currentToken = token
  trackingStatus.classList.remove('error')
  if (refresh) {
    refreshButton.disabled = true
    refreshButton.textContent = 'Wird bei DPD geprüft …'
    trackingStatus.hidden = true
  } else {
    trackingStatus.hidden = false
    trackingStatus.textContent = 'Sendungsdaten werden sicher geladen …'
    trackingResult.hidden = true
  }
  try {
    const response = await fetch('/api/tracking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Trackingdaten konnten nicht geladen werden.')
    const tracking = result.tracking
    if (!tracking || typeof tracking !== 'object') throw new Error('Trackingdaten konnten nicht geladen werden.')
    document.querySelector('#order-number').textContent = tracking.orderNumber || '–'
    document.querySelector('#shipment-status').textContent = tracking.status || 'Versendet'
    document.querySelector('#carrier').textContent = tracking.carrier || '–'
    document.querySelector('#tracking-number').textContent = tracking.trackingNumber || '–'
    const shippedAt = tracking.shippedAt ? new Date(tracking.shippedAt) : null
    document.querySelector('#shipped-at').textContent = shippedAt && !Number.isNaN(shippedAt.valueOf())
      ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(shippedAt)
      : '–'
    // Fortschritt: Bestellt → Versendet → Unterwegs → Im Zustelldepot → In Zustellung → Zugestellt
    const steps = document.querySelector('#tracking-steps')
    steps.replaceChildren()
    ;(Array.isArray(tracking.phases) ? tracking.phases : []).forEach((label, index) => {
      const step = document.createElement('li')
      step.textContent = label
      if (index < tracking.phase) step.className = 'done'
      if (index === tracking.phase) {
        step.className = tracking.delivered ? 'done current' : 'current'
        step.setAttribute('aria-current', 'step')
      }
      steps.append(step)
    })
    steps.hidden = !steps.childElementCount
    document.querySelector('#shipment-status').textContent = tracking.phaseLabel || tracking.status || 'Versendet'
    const check = document.querySelector('#status-check')
    check.textContent = tracking.delivered ? '✓' : '→'
    check.classList.toggle('is-delivered', Boolean(tracking.delivered))
    const deliveredNote = document.querySelector('#delivered-note')
    const deliveredAt = tracking.deliveredAt ? new Date(tracking.deliveredAt) : null
    deliveredNote.hidden = !tracking.delivered
    deliveredNote.textContent = tracking.delivered
      ? `Dein Paket wurde zugestellt${deliveredAt && !Number.isNaN(deliveredAt.valueOf()) ? ` – bestätigt am ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(deliveredAt)}` : ''}. Viel Spaß mit ZYRO!`
      : ''
    const carrierStatus = tracking.carrierStatus
    const statusBox = document.querySelector('#carrier-status')
    const eventList = document.querySelector('#carrier-events')
    eventList.replaceChildren()
    statusBox.hidden = false
    if (!carrierStatus) {
      document.querySelector('#carrier-status-text').textContent = tracking.delivered
        ? 'Die Zustellung ist bestätigt.'
        : `${tracking.carrier || 'Der Versanddienst'} hat noch keinen Status gemeldet. Nach der Übergabe kann das ein paar Stunden dauern.`
    }
    if (carrierStatus) {
      const when = (value) => {
        const text = String(value || '')
        const date = text ? new Date(text) : null
        if (/^\d{4}-\d{2}-\d{2}/.test(text) && date && !Number.isNaN(date.valueOf())) return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date)
        return text
      }
      document.querySelector('#shipment-status').textContent = tracking.phaseLabel || carrierStatus.status || tracking.status || 'Versendet'
      document.querySelector('#carrier-status-text').textContent = [carrierStatus.description, carrierStatus.location, when(carrierStatus.timestamp)].filter(Boolean).join(' · ')
      for (const event of carrierStatus.events || []) {
        const item = document.createElement('li')
        item.textContent = [when(event.timestamp), event.description, event.location].filter(Boolean).join(' · ')
        eventList.append(item)
      }
    }
    trackingStatus.hidden = true
    trackingResult.hidden = false
    checkedAt.textContent = `Zuletzt geprüft: ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())} Uhr`
  } catch (error) {
    trackingStatus.hidden = false
    trackingStatus.textContent = error.message
    trackingStatus.classList.add('error')
  } finally {
    refreshButton.disabled = false
    refreshButton.textContent = 'Status jetzt prüfen'
  }
}

refreshButton.addEventListener('click', () => {
  if (currentToken) showTracking(currentToken, { refresh: true })
})

trackingForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const token = trackingInput.value.trim()
  if (!/^[a-f0-9]{64}$/.test(token)) {
    trackingStatus.hidden = false
    trackingStatus.textContent = 'Der Tracking-Code muss aus dem persönlichen Versand-Link stammen.'
    trackingStatus.classList.add('error')
    trackingResult.hidden = true
    return
  }
  const url = new URL(window.location.href)
  url.searchParams.set('token', token)
  window.history.replaceState({}, '', url)
  showTracking(token)
})

const tokenFromLink = new URLSearchParams(window.location.search).get('token') || ''
if (/^[a-f0-9]{64}$/.test(tokenFromLink)) {
  trackingInput.value = tokenFromLink
  showTracking(tokenFromLink)
} else {
  trackingStatus.hidden = false
  trackingStatus.textContent = 'Öffne den persönlichen Tracking-Link aus deiner ZYRO-Versand-E-Mail.'
}
