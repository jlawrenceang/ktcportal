// KTC Online Portal service worker.
//   * Web Push (show pushed notification + focus/open on tap).
//   * A conservative cache so the installed app launches fast and survives a
//     flaky gate connection — WITHOUT serving stale code:
//       - navigations (HTML): network-first, fall back to the cached shell
//       - hashed build assets (/assets/*): cache-first (filenames are immutable)
//     New deploys ship new hashed filenames, so cache-first can never serve old
//     code; this coexists with the app's stale-chunk auto-reload.
const VERSION = 'ktc-v1'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(SHELL)
    // Best-effort precache of the app shell + icon (offline launch).
    await c.addAll(['/', '/index.html', '/app-icon-192.png']).catch(() => {})
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

// Let the page tell a freshly-installed SW to take over immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // never touch Supabase/3rd-party

  // Navigations → network-first (always get fresh HTML + current chunk refs),
  // fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        return res
      } catch (_e) {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error()
      }
    })())
    return
  }

  // Hashed, immutable build assets → cache-first (safe; filenames change per build).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) { const c = await caches.open(ASSETS); c.put(req, res.clone()) }
      return res
    })())
  }
})

// ---- Web Push ----
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_e) { data = {} }
  const title = data.title || 'KTC Online Portal'
  const options = {
    body: data.body || '',
    icon: '/app-icon-192.png',
    badge: '/app-icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          if ('navigate' in w) { try { w.navigate(target) } catch (_e) { /* cross-origin guard */ } }
          return w.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
