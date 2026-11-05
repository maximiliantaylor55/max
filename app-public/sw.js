const CACHE_NAME = 'zyro-management-shell-v6'
const APP_ROOT = new URL('./', self.registration.scope).pathname

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        const startUrl = new URL('./', self.registration.scope).href
        const page = await fetch(startUrl)
        if (!page.ok) throw new Error(`App-Startseite nicht verfügbar (${page.status}).`)
        const html = await page.clone().text()
        const appAssets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1])
        await cache.put(startUrl, page)
        await cache.addAll([
          ...appAssets,
          new URL('manifest.webmanifest', self.registration.scope).href,
          new URL('icons/zyro.svg', self.registration.scope).href,
        ])
      })
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames.filter((cacheName) => cacheName.startsWith('zyro-management-shell-') && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(APP_ROOT)) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            return caches.open(CACHE_NAME)
              .then((cache) => cache.put(new URL('./', self.registration.scope).href, copy))
              .then(() => response)
          }
          return response
        })
        .catch(async () => {
          const cachedPage = await caches.match(new URL('./', self.registration.scope).href)
          if (cachedPage) return cachedPage
          return new Response('ZYRO Management ist offline noch nicht verfügbar. Öffne die App einmal mit Internetverbindung.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }),
    )
    return
  }

  const isStylesheetOrScript = /\.(?:js|css)$/.test(requestUrl.pathname)
  if (isStylesheetOrScript) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            return caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy))
              .then(() => response)
          }
          return response
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request)
          if (cachedResponse) return cachedResponse
          return new Response('Diese App-Datei ist offline nicht verfügbar.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy))
            .then(() => response)
        }
        return response
      })
    }),
  )
})
