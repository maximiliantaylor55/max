// ZYRO Cookie-Einwilligung (TDDDG § 25 / DSGVO Art. 6 Abs. 1 lit. a).
// Statistik (Google Analytics) und Marketing (Google Ads, Meta, TikTok) werden erst NACH Zustimmung geladen.
// Ohne eingetragene Tracking-IDs erscheint nur ein Info-Hinweis.
(() => {
  const KEY = 'zyro-consent'
  const VERSION = 2
  const config = window.ZYRO_TRACKING || {}
  const has = (key) => /^[A-Za-z0-9_-]{4,40}$/.test(String(config[key] || ''))
  const tracking = has('ga4') || has('googleAds') || has('metaPixel') || has('tiktokPixel')
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.v === VERSION ? v : null } catch { return null } }
  const write = (value) => { try { localStorage.setItem(KEY, JSON.stringify({ ...value, v: VERSION, at: new Date().toISOString() })) } catch { /* ignorieren */ } }
  const loaded = {}
  const loadScript = (src) => { const s = document.createElement('script'); s.async = true; s.src = src; document.head.append(s) }

  const loadGoogle = (consent) => {
    window.dataLayer = window.dataLayer || []
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments) }
    window.gtag('consent', loaded.google ? 'update' : 'default', {
      analytics_storage: consent.statistics ? 'granted' : 'denied',
      ad_storage: consent.marketing ? 'granted' : 'denied',
      ad_user_data: consent.marketing ? 'granted' : 'denied',
      ad_personalization: consent.marketing ? 'granted' : 'denied',
    })
    if (loaded.google) return
    const first = (consent.statistics && has('ga4')) ? config.ga4 : (consent.marketing && has('googleAds')) ? config.googleAds : ''
    if (!first) return
    loaded.google = true
    window.gtag('js', new Date())
    if (consent.statistics && has('ga4')) window.gtag('config', config.ga4, { anonymize_ip: true })
    if (consent.marketing && has('googleAds')) window.gtag('config', config.googleAds)
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(first)}`)
  }
  const loadMeta = () => {
    if (loaded.meta || !has('metaPixel')) return
    loaded.meta = true
    const n = window.fbq = function fbq() { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }
    if (!window._fbq) window._fbq = n
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []
    loadScript('https://connect.facebook.net/en_US/fbevents.js')
    window.fbq('init', config.metaPixel)
    window.fbq('track', 'PageView')
  }
  const loadTiktok = () => {
    if (loaded.tiktok || !has('tiktokPixel')) return
    loaded.tiktok = true
    window.TiktokAnalyticsObject = 'ttq'
    const ttq = window.ttq = window.ttq || []
    ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent']
    ttq.setAndDefer = (target, method) => { target[method] = function deferred() { target.push([method].concat(Array.prototype.slice.call(arguments, 0))) } }
    ttq.methods.forEach((method) => ttq.setAndDefer(ttq, method))
    ttq.instance = (id) => { const instance = ttq._i[id] || []; ttq.methods.forEach((method) => ttq.setAndDefer(instance, method)); return instance }
    ttq.load = (id, options) => {
      const url = 'https://analytics.tiktok.com/i18n/pixel/events.js'
      ttq._i = ttq._i || {}; ttq._i[id] = []; ttq._i[id]._u = url
      ttq._t = ttq._t || {}; ttq._t[id] = +new Date()
      ttq._o = ttq._o || {}; ttq._o[id] = options || {}
      loadScript(`${url}?sdkid=${encodeURIComponent(id)}&lib=ttq`)
    }
    ttq.load(config.tiktokPixel)
    ttq.page()
  }
  const apply = (consent) => {
    if (consent.statistics || consent.marketing) loadGoogle(consent)
    if (consent.marketing) { loadMeta(); loadTiktok() }
  }

  // Messpunkte aus dem Shop: Kauf und Newsletter-Anmeldung (nur wenn zugestimmt).
  window.addEventListener('zyro:purchase', (event) => {
    const consent = read(); if (!consent) return
    const { orderNumber, value } = event.detail || {}
    const money = typeof value === 'number' && value > 0 ? { value, currency: 'EUR' } : { currency: 'EUR' }
    if (consent.statistics && loaded.google && has('ga4')) window.gtag('event', 'purchase', { transaction_id: orderNumber, ...money })
    if (consent.marketing && loaded.google && has('googleAds') && config.googleAdsPurchaseLabel) window.gtag('event', 'conversion', { send_to: `${config.googleAds}/${config.googleAdsPurchaseLabel}`, transaction_id: orderNumber, ...money })
    if (consent.marketing && loaded.meta) window.fbq('track', 'Purchase', money.value ? money : { value: 0, currency: 'EUR' })
    if (consent.marketing && loaded.tiktok) window.ttq.track('CompletePayment', money)
  })
  window.addEventListener('zyro:newsletter-signup', () => {
    const consent = read(); if (!consent) return
    if (consent.statistics && loaded.google && has('ga4')) window.gtag('event', 'sign_up', { method: 'newsletter' })
    if (consent.marketing && loaded.meta) window.fbq('track', 'Lead')
    if (consent.marketing && loaded.tiktok) window.ttq.track('Subscribe')
  })

  let box = null
  const close = () => { if (!box) return; box.classList.remove('is-visible'); const old = box; box = null; setTimeout(() => old.remove(), 300) }
  const save = (consent) => {
    const hadMore = loaded.google || loaded.meta || loaded.tiktok
    const current = read()
    write(consent)
    close()
    // Wurde eine Zustimmung zurückgenommen, Seite neu laden, damit geladene Dienste wirklich weg sind.
    if (hadMore && current && ((current.statistics && !consent.statistics) || (current.marketing && !consent.marketing))) location.reload()
    else apply(consent)
  }

  const showInfo = () => {
    if (box) return
    box = document.createElement('section')
    box.className = 'zyro-cookie'
    box.setAttribute('role', 'region')
    box.setAttribute('aria-label', 'Hinweis zu Cookies')
    box.innerHTML = '<span class="zyro-cookie-icon" aria-hidden="true">🍪</span>'
      + '<p><strong>Nur das Nötigste.</strong>Wir nutzen keine Tracking- oder Werbe-Cookies. Gespeichert werden nur dein Warenkorb und deine Anmeldung, damit der Shop funktioniert. <a href="/datenschutz.html">Mehr dazu</a></p>'
      + '<button type="button" data-a="ok">Verstanden</button>'
    box.querySelector('[data-a="ok"]').addEventListener('click', () => { write({ statistics: false, marketing: false, info: true }); close() })
    document.body.append(box)
    requestAnimationFrame(() => requestAnimationFrame(() => box && box.classList.add('is-visible')))
  }

  const showConsent = (expanded = false) => {
    if (box) close()
    const current = read() || { statistics: false, marketing: false }
    box = document.createElement('section')
    box.className = 'zyro-cookie zyro-consent'
    box.setAttribute('role', 'dialog')
    box.setAttribute('aria-modal', 'false')
    box.setAttribute('aria-labelledby', 'zyro-consent-title')
    const statsNames = has('ga4') ? 'Google Analytics' : ''
    const marketingNames = [has('googleAds') && 'Google Ads', has('metaPixel') && 'Meta (Facebook/Instagram)', has('tiktokPixel') && 'TikTok'].filter(Boolean).join(', ')
    box.innerHTML = '<div class="zyro-consent-body">'
      + '<p id="zyro-consent-title"><strong>🍪 Dürfen wir messen, was gut ankommt?</strong>'
      + 'Wir möchten mit Cookies und ähnlichen Techniken auswerten, wie die Seite genutzt wird, und unsere Werbung verbessern. Dabei können Daten auch in die USA übertragen werden. '
      + 'Du entscheidest selbst – und kannst deine Wahl jederzeit unter „Cookie-Einstellungen“ unten auf der Seite ändern. <a href="/datenschutz.html#tracking">Details</a></p>'
      + `<div class="zyro-consent-options"${expanded ? '' : ' hidden'}>`
      + '<label class="zyro-consent-option"><input type="checkbox" checked disabled><span><strong>Notwendig</strong>Warenkorb, Anmeldung, diese Auswahl. Immer aktiv.</span></label>'
      + (statsNames ? `<label class="zyro-consent-option"><input type="checkbox" data-c="statistics"${current.statistics ? ' checked' : ''}><span><strong>Statistik</strong>${statsNames}: anonyme Auswertung der Nutzung.</span></label>` : '')
      + (marketingNames ? `<label class="zyro-consent-option"><input type="checkbox" data-c="marketing"${current.marketing ? ' checked' : ''}><span><strong>Marketing</strong>${marketingNames}: Werbung messen und passende Anzeigen zeigen.</span></label>` : '')
      + '</div></div>'
      + '<div class="zyro-consent-actions">'
      + '<button type="button" data-a="all">Alle akzeptieren</button>'
      + '<button type="button" data-a="none" class="secondary">Nur notwendige</button>'
      + `<button type="button" data-a="${expanded ? 'save' : 'more'}" class="link">${expanded ? 'Auswahl speichern' : 'Einstellungen'}</button>`
      + '</div>'
    const options = box.querySelector('.zyro-consent-options')
    box.querySelector('[data-a="all"]').addEventListener('click', () => save({ statistics: !!statsNames, marketing: !!marketingNames }))
    box.querySelector('[data-a="none"]').addEventListener('click', () => save({ statistics: false, marketing: false }))
    const toggle = box.querySelector('[data-a="more"], [data-a="save"]')
    toggle.addEventListener('click', () => {
      if (options.hidden) { options.hidden = false; toggle.textContent = 'Auswahl speichern'; toggle.dataset.a = 'save'; return }
      save({ statistics: !!box.querySelector('[data-c="statistics"]')?.checked, marketing: !!box.querySelector('[data-c="marketing"]')?.checked })
    })
    document.body.append(box)
    requestAnimationFrame(() => requestAnimationFrame(() => box && box.classList.add('is-visible')))
  }

  window.zyroConsent = { open: () => (tracking ? showConsent(true) : showInfo()) }
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-cookie-settings]')
    if (!trigger) return
    event.preventDefault()
    window.zyroConsent.open()
  })

  const start = () => {
    const consent = read()
    const askAgain = /[?&]cookie-einstellungen/.test(location.search)
    if (!tracking) { if (!consent || askAgain) showInfo(); return }
    if (consent && !consent.info) apply(consent)
    if (!consent || consent.info || askAgain) showConsent(askAgain)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
