// KTC Online Portal service worker — Web Push only (no offline caching yet;
// the PWA work in a later step can extend this). Shows the pushed notification
// and focuses/opens the right page when tapped.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_e) { data = {} }
  const title = data.title || 'KTC Online Portal'
  const options = {
    body: data.body || '',
    icon: '/ktc-logo.png',
    badge: '/ktc-logo.png',
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
