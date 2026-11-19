import { useEffect } from 'react'
import { appStore } from '../store'
import { requestPushSync, syncPushIfOn } from './push'

/**
 * Keeps the reminder server up to date while push is on: at start, when the app
 * comes back on screen or online, and a few seconds after anything it needs changes
 * (expenses, bills, reminder settings, the profile).
 */
export function usePushSync(ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    syncPushIfOn()
    const unsubscribe = appStore.subscribe((state, previous) => {
      if (
        state.transactions !== previous.transactions ||
        state.bills !== previous.bills ||
        state.settings.weeklyReminder !== previous.settings.weeklyReminder ||
        state.profile !== previous.profile
      ) {
        requestPushSync()
      }
    })
    const onShow = () => {
      if (document.visibilityState === 'visible') syncPushIfOn()
    }
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('online', syncPushIfOn)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('online', syncPushIfOn)
    }
  }, [ready])
}
