const trackingForm = document.querySelector('#tracking-form')
const trackingInput = document.querySelector('#tracking-token')
const trackingStatus = document.querySelector('#tracking-status')
const trackingResult = document.querySelector('#tracking-result')
const carrierLink = document.querySelector('#carrier-link')

const trackingUrlFor = (tracking) => {
  if (tracking.trackingUrl) {
    try {
      const url = new URL(tracking.trackingUrl)
      if (url.protocol === 'https:') return url.href
    } catch {
      return ''
    }
  }
  if (tracking.carrier === 'DHL' && tracking.trackingNumber) {
    const url = new URL('https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html')
    url.searchParams.set('piececode', tracking.trackingNumber)
    return url.href
  }
  if (tracking.carrier === 'DPD' && tracking.trackingNumber) {
    return `https://tracking.dpd.de/status/de_DE/parcel/${encodeURIComponent(tracking.trackingNumber)}`
  }
  return ''
}

const showTracking = async (token) => {
  trackingStatus.hidden = false
  trackingStatus.classList.remove('error')
  trackingStatus.textContent = 'Sendungsdaten werden sicher geladen …'
  trackingResult.hidden = true
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
    const target = trackingUrlFor(tracking)
    const carrierStatus = tracking.carrierStatus
    const statusBox = document.querySelector('#carrier-status')
    const eventList = document.querySelector('#carrier-events')
    eventList.replaceChildren()
    statusBox.hidden = !carrierStatus
    if (carrierStatus) {
      const when = (value) => {
        const date = value ? new Date(value) : null
        return date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date) : ''
      }
      document.querySelector('#shipment-status').textContent = carrierStatus.status || tracking.status || 'Versendet'
      document.querySelector('#carrier-status-text').textContent = [carrierStatus.description, carrierStatus.location, when(carrierStatus.timestamp)].filter(Boolean).join(' · ')
      for (const event of carrierStatus.events || []) {
        const item = document.createElement('li')
        item.textContent = [when(event.timestamp), event.description, event.location].filter(Boolean).join(' · ')
        eventList.append(item)
      }
    }
    carrierLink.hidden = !target
    if (target) carrierLink.href = target
    trackingStatus.hidden = true
    trackingResult.hidden = false
  } catch (error) {
    trackingStatus.textContent = error.message
    trackingStatus.classList.add('error')
  }
}

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
