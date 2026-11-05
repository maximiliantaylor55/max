const menuToggle = document.querySelector('.menu-toggle')
const siteNav = document.querySelector('#site-nav')
const contactForm = document.querySelector('#contact-form')
const contactStatus = document.querySelector('#contact-status')
document.querySelector('#current-year').textContent = String(new Date().getFullYear())

if (location.pathname === '/shop' || location.pathname === '/shop/') {
  const accountLink = /^#(?:verify|reset)=/.test(location.hash)
  const destinationHash = accountLink ? location.hash : '#sortiment'
  history.replaceState(null, '', `/${location.search}${destinationHash}`)
  if (!accountLink) requestAnimationFrame(() => document.querySelector('#sortiment').scrollIntoView())
}

const revealItems = document.querySelectorAll('.reveal')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (revealItems.length && 'IntersectionObserver' in window && !reduceMotion) {
  document.body.classList.add('has-motion')
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-visible')
      observer.unobserve(entry.target)
    })
  }, { threshold: 0.12 })
  revealItems.forEach((item) => revealObserver.observe(item))
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'))
}

menuToggle.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true'
  menuToggle.setAttribute('aria-expanded', String(!isOpen))
  menuToggle.setAttribute('aria-label', isOpen ? 'Menü öffnen' : 'Menü schließen')
  siteNav.classList.toggle('is-open', !isOpen)
})

siteNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  siteNav.classList.remove('is-open')
  menuToggle.setAttribute('aria-expanded', 'false')
  menuToggle.setAttribute('aria-label', 'Menü öffnen')
}))

contactForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!contactForm.reportValidity()) return

  const submitButton = contactForm.querySelector('[type="submit"]')
  const formData = new FormData(contactForm)
  submitButton.disabled = true
  contactStatus.classList.remove('is-error')
  contactStatus.textContent = 'Nachricht wird gesendet …'

  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        subject: String(formData.get('subject') || '').trim(),
        message: String(formData.get('message') || '').trim(),
        website: String(formData.get('website') || '').trim(),
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Nachricht konnte nicht gesendet werden.')
    contactForm.reset()
    contactStatus.textContent = result.confirmationEmailSent
      ? 'Danke für deine Nachricht. Eine Eingangsbestätigung ist per E-Mail unterwegs.'
      : 'Deine Nachricht wurde gespeichert, aber die Eingangsbestätigung konnte nicht per E-Mail gesendet werden. Bitte prüfe deine Adresse oder schreibe uns direkt.'
    if (!result.confirmationEmailSent) contactStatus.classList.add('is-error')
  } catch (error) {
    contactStatus.classList.add('is-error')
    contactStatus.textContent = error.message || 'Nachricht konnte nicht gesendet werden. Bitte nutze alternativ den E-Mail-Link.'
  } finally {
    submitButton.disabled = false
  }
})