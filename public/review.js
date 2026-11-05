const status = document.querySelector('#review-status')
const form = document.querySelector('#review-form')
const productSelect = document.querySelector('#review-product')
const token = new URLSearchParams(location.search).get('token') || ''

const showStatus = (message, success = false) => {
  status.textContent = message
  status.classList.toggle('success', success)
  status.hidden = !message
}

const ratingLabels = [...document.querySelectorAll('.rating-options label')]
ratingLabels.forEach((label) => {
  label.querySelector('input').addEventListener('change', (event) => {
    const rating = Number(event.currentTarget.value)
    ratingLabels.forEach((entry, index) => entry.classList.toggle('selected', index < rating))
  })
})

const request = async (action, data = {}) => {
  const response = await fetch('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, ...data }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Bewertungslink konnte nicht verarbeitet werden.')
  return result
}

const loadReview = async () => {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    showStatus('Der persönliche Bewertungslink fehlt oder ist ungültig.')
    return
  }
  try {
    const result = await request('details')
    if (result.alreadySubmitted) {
      showStatus('Danke! Deine Bewertung für diese Bestellung ist bereits bei uns eingegangen.', true)
      return
    }
    if (!Array.isArray(result.products) || result.products.length === 0) {
      showStatus('Zu dieser Bestellung konnte kein bewertbares Produkt gefunden werden.')
      return
    }
    productSelect.replaceChildren(...result.products.map((product) => {
      const option = document.createElement('option')
      option.value = product.id
      option.textContent = product.name
      return option
    }))
    showStatus('')
    form.hidden = false
  } catch (error) {
    showStatus(error.message)
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const button = form.querySelector('button[type="submit"]')
  const data = new FormData(form)
  button.disabled = true
  button.textContent = 'Wird sicher übermittelt …'
  try {
    await request('submit', {
      productId: data.get('productId'),
      rating: Number(data.get('rating')),
      comment: data.get('comment'),
      consent: data.get('consent') === 'on',
    })
    form.hidden = true
    showStatus('Danke für deine ehrliche Bewertung! Wir prüfen sie kurz, bevor sie im Shop erscheint. ✨', true)
  } catch (error) {
    showStatus(error.message)
    button.disabled = false
    button.textContent = 'Bewertung absenden'
  }
})

loadReview()
