const apiUrl = '/api/admin/email'
const loginForm = document.querySelector('#login-form')
const settingsForm = document.querySelector('#settings-form')
const adminStatus = document.querySelector('#admin-status')
const configuredStatus = document.querySelector('#configured-status')
const tokenInput = document.querySelector('#admin-token')
const passwordInput = document.querySelector('#smtp-password')
const saveButton = document.querySelector('#save-button')
const testButton = document.querySelector('#test-button')
let adminToken = sessionStorage.getItem('zyroAdminToken') || ''

const showStatus = (message, isError = false) => {
  adminStatus.textContent = message
  adminStatus.classList.toggle('is-error', isError)
}

const setBusy = (busy) => {
  saveButton.disabled = busy
  testButton.disabled = busy
}

const request = async (method, body) => {
  const response = await fetch(apiUrl, {
    method,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) {
      adminToken = ''
      sessionStorage.removeItem('zyroAdminToken')
      showLogin()
    }
    throw new Error(result.error || `Anfrage fehlgeschlagen (${response.status}).`)
  }
  return result
}

const showLogin = () => {
  loginForm.hidden = false
  settingsForm.hidden = true
  tokenInput.value = ''
  tokenInput.focus()
}

const showSettings = (mail) => {
  loginForm.hidden = true
  settingsForm.hidden = false
  settingsForm.elements.host.value = mail.host || ''
  settingsForm.elements.port.value = String(mail.port || 465)
  settingsForm.elements.secure.checked = mail.secure !== false
  settingsForm.elements.username.value = mail.username || ''
  settingsForm.elements.from.value = mail.from || ''
  passwordInput.value = ''
  configuredStatus.textContent = mail.configured
    ? 'SMTP ist eingerichtet. Das Passwort bleibt geschützt.'
    : 'Noch nicht eingerichtet. Bitte alle SMTP-Daten eintragen.'
}

const showStripe = (stripe) => {
  document.querySelector('#stripe-status').textContent = !stripe?.configured
    ? 'Stripe ist noch nicht eingerichtet.'
    : `Schlüssel gespeichert (${stripe.mode === 'live' ? 'Live' : 'Test'}). ${stripe.enabled ? 'Online-Zahlung im Shop ist AKTIV.' : 'Webhook-Geheimnis fehlt – Zahlung noch nicht aktiv.'}`
}

const loadSettings = async () => {
  showStatus('Einstellungen werden geladen …')
  const result = await request('GET')
  showSettings(result.mail)
  showStripe(result.stripe)
  showStatus('')
}

document.querySelector('#stripe-button').addEventListener('click', async () => {
  const secretInput = document.querySelector('#stripe-secret')
  const webhookInput = document.querySelector('#stripe-webhook')
  try {
    const result = await request('POST', { action: 'saveStripe', secretKey: secretInput.value, webhookSecret: webhookInput.value })
    secretInput.value = ''
    webhookInput.value = ''
    showStripe(result.stripe)
    showStatus('Stripe wurde gespeichert.')
  } catch (error) {
    showStatus(error.message, true)
  }
})

const readMailSettings = () => ({
  host: settingsForm.elements.host.value.trim(),
  port: Number(settingsForm.elements.port.value),
  secure: settingsForm.elements.secure.checked,
  username: settingsForm.elements.username.value.trim(),
  from: settingsForm.elements.from.value.trim(),
  password: passwordInput.value,
})

const runAction = async (action) => {
  if (!settingsForm.reportValidity()) return
  const isTest = action === 'testMail'
  if (isTest && !settingsForm.elements.testEmail.reportValidity()) return
  setBusy(true)
  showStatus(isTest ? 'Einstellungen werden gespeichert und Testmail wird gesendet …' : 'Einstellungen werden gespeichert …')

  try {
    const body = { mail: readMailSettings() }
    if (isTest) {
      body.action = 'testMail'
      body.email = settingsForm.elements.testEmail.value.trim()
    }
    const result = await request('POST', body)
    if (result.mail) showSettings(result.mail)
    showStatus(isTest ? 'Testmail wurde erfolgreich versendet.' : 'SMTP-Einstellungen wurden gespeichert.')
  } catch (error) {
    showStatus(error.message || 'Die Anfrage ist fehlgeschlagen. Bitte erneut versuchen.', true)
  } finally {
    setBusy(false)
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  adminToken = tokenInput.value.trim()
  sessionStorage.setItem('zyroAdminToken', adminToken)
  try {
    await loadSettings()
  } catch (error) {
    showStatus(error.message || 'Anmeldung fehlgeschlagen.', true)
    if (adminToken) tokenInput.value = adminToken
  }
})

settingsForm.addEventListener('submit', (event) => {
  event.preventDefault()
  runAction('save')
})

testButton.addEventListener('click', () => runAction('testMail'))

document.querySelector('#logout-button').addEventListener('click', () => {
  adminToken = ''
  sessionStorage.removeItem('zyroAdminToken')
  showStatus('Du wurdest abgemeldet.')
  showLogin()
})

if (adminToken) {
  loadSettings().catch((error) => showStatus(error.message || 'Einstellungen konnten nicht geladen werden.', true))
} else {
  showLogin()
}
