// Added to the generated service worker (workbox importScripts).

// Tapping a notification brings the app forward, or opens it if it was closed.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => 'focus' in client)
      return open ? open.focus() : self.clients.openWindow(url)
    }),
  )
})

// The key the app seals bill names and amounts with (src/app/pushSeal.ts), from the app's
// IndexedDB store. It never leaves this device; the push server only ever sees sealed text.
function readPushKey() {
  return new Promise((resolve) => {
    const request = indexedDB.open('expense-tracker')
    // Not there yet: create the store the way the app's idb-keyval does, so the app still finds it.
    request.onupgradeneeded = () => request.result.createObjectStore('state')
    request.onerror = () => resolve(null)
    request.onsuccess = () => {
      const db = request.result
      const done = (value) => {
        db.close()
        resolve(value || null)
      }
      try {
        const read = db.transaction('state', 'readonly').objectStore('state').get('push-key')
        read.onsuccess = () => done(read.result)
        read.onerror = () => done(null)
      } catch {
        done(null)
      }
    }
  })
}

function fromBase64(text) {
  const raw = atob(text)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** The bill's name and amount, or null when this device can't open them. */
async function openSealed(sealed) {
  try {
    const [iv, data] = sealed.split('.')
    const key = await readPushKey()
    if (!key || !iv || !data) return null
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv), additionalData: new TextEncoder().encode('till/push') }, key, fromBase64(data))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

// A reminder pushed by the server while the app is closed (push-server/src/index.ts sends
// { title, body, tag, url, sealed?, template? }). The tag matches the one the app uses for the
// same reminder, so a notification never shows twice. For a bill, `body` is generic ("A bill is
// due tomorrow") and `template` takes the name and amount this device opens from `sealed`.
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // On screen, Home already shows all of this.
      if (windows.some((client) => client.visibilityState === 'visible')) return undefined
      let body = payload.body || ''
      if (typeof payload.sealed === 'string' && typeof payload.template === 'string') {
        const what = await openSealed(payload.sealed)
        if (what) body = payload.template.replace('{bill}', what)
      }
      return self.registration.showNotification(payload.title || 'Till', {
        body,
        tag: payload.tag,
        icon: '/pwa-192x192.png',
        badge: '/pwa-badge.png',
        data: { url: payload.url || '/' },
      })
    })(),
  )
})
