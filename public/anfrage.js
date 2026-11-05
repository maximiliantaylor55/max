const params = new URLSearchParams(window.location.search)
const inquiryId = params.get('id') || ''
const accessToken = params.get('t') || ''

const threadElement = document.getElementById('thread')
const subjectElement = document.getElementById('inquiry-subject')
const form = document.getElementById('reply-form')
const textarea = document.getElementById('reply-text')
const honeypot = document.getElementById('reply-website')
const button = document.getElementById('reply-button')
const status = document.getElementById('admin-status')

const setStatus = (message, isError = false) => {
  status.textContent = message
  status.classList.toggle('is-error', isError)
}

const formatDate = (value) => value
  ? new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
  : ''

const render = (inquiry) => {
  subjectElement.textContent = inquiry.subject
  threadElement.replaceChildren(...inquiry.thread.map((entry) => {
    const item = document.createElement('div')
    item.className = `thread-entry ${entry.from === 'customer' ? 'is-customer' : 'is-team'}`
    const meta = document.createElement('span')
    meta.className = 'thread-meta'
    meta.textContent = `${entry.from === 'customer' ? 'Du' : 'ZYRO'} · ${formatDate(entry.at)}`
    const body = document.createElement('div')
    body.textContent = entry.text
    item.append(meta, body)
    return item
  }))
  form.hidden = false
}

const request = async (body) => {
  const options = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: inquiryId, t: accessToken, ...body }) }
    : { method: 'GET' }
  const url = body ? '/api/inquiry' : `/api/inquiry?id=${encodeURIComponent(inquiryId)}&t=${encodeURIComponent(accessToken)}`
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Anfrage konnte nicht geladen werden.')
  return data
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  button.disabled = true
  setStatus('Wird gesendet …')
  try {
    const data = await request({ reply: textarea.value, website: honeypot.value })
    if (data.thread) {
      render(data)
      textarea.value = ''
      setStatus('Deine Antwort wurde gesendet.')
    }
  } catch (error) {
    setStatus(error.message, true)
  } finally {
    button.disabled = false
  }
})

if (!inquiryId || !accessToken) {
  subjectElement.textContent = 'Der Link ist unvollständig.'
  setStatus('Bitte öffne den Link aus deiner E-Mail erneut.', true)
} else {
  request().then(render).catch((error) => {
    subjectElement.textContent = 'Anfrage nicht verfügbar.'
    setStatus(error.message, true)
  })
}
