/**
 * Swaps in a newer version of the app, if the server has one. The saved data isn't
 * touched: it's the app that's out of date, and the data stays where it is.
 *
 * The current service worker keeps running until a new one is ready, so nothing breaks
 * when there's no connection. Resolves `false` when there's nothing newer. When there
 * is, the page reloads into it.
 */
export async function updateApp(): Promise<boolean> {
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
  if (!registration) return false
  // Offline, or the server can't be reached: whatever is already waiting can still be used.
  await registration.update().catch(() => undefined)

  const installing = registration.installing
  if (installing) {
    await new Promise<void>((resolve) => {
      const settled = () => {
        if (installing.state === 'installed' || installing.state === 'redundant') resolve()
      }
      installing.addEventListener('statechange', settled)
      settled()
    })
  }

  const waiting = registration.waiting
  if (!waiting) return false
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}
