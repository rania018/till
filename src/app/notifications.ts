/** Where the browser stands on notifications. `unsupported` covers iOS Safari outside an installed app. */
export type NotificationState = 'unsupported' | 'default' | 'granted' | 'denied'

export function notificationState(): NotificationState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export async function requestNotifications(): Promise<NotificationState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.requestPermission()
}

/**
 * Shows a system notification. Goes through the service worker when there is one:
 * Android only allows notifications from there, and tapping it can reopen the app.
 */
export async function notify(title: string, body: string, tag: string): Promise<boolean> {
  if (notificationState() !== 'granted') return false
  const options: NotificationOptions = { body, tag, icon: '/pwa-192x192.png', badge: '/pwa-badge.png', data: { url: '/' } }
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification(title, options)
      return true
    }
    const notification = new Notification(title, options)
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
    return true
  } catch (error) {
    console.error('Could not show a notification.', error)
    return false
  }
}
