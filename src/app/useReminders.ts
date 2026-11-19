import { addDays } from 'date-fns'
import { useEffect } from 'react'
import { t } from '../i18n'
import { homeAlerts } from '../lib/alerts'
import { fromISODate, todayISO, toISODate } from '../lib/dates'
import { formatMoney, withAmountsShown } from '../lib/money'
import { nextReminderMoment, weeklyReminderDue } from '../lib/reminders'
import { nameOf } from '../lib/transactions'
import { appStore } from '../store'
import { markNotified, wasNotified } from '../store/deviceState'
import { notify } from './notifications'

/** Bills due today or tomorrow (or late) get a notification at this hour. */
const BILL_CHECK_HOUR = 9
/** setTimeout can't wait longer than this (about 24.8 days). */
const MAX_DELAY = 2 ** 31 - 1

function nextBillCheck(now: Date): Date {
  const moment = new Date(now)
  moment.setHours(BILL_CHECK_HOUR, 0, 0, 0)
  if (moment <= now) moment.setDate(moment.getDate() + 1)
  return moment
}

/** Notifies once per key and remembers it on this device. */
async function notifyOnce(key: string, title: string, body: string): Promise<void> {
  if (wasNotified(key)) return
  if (await notify(title, body, key)) markNotified(key)
}

/** Sends what's due now as system notifications: the weekly reminder, and bills due today or tomorrow. */
async function sendDueNotifications(): Promise<void> {
  // On screen, Home already shows all of this.
  if (document.visibilityState === 'visible') return
  const state = appStore.getState()
  const now = new Date()
  const reminder = weeklyReminderDue(state, now)
  if (reminder) await notifyOnce(`weekly-${reminder.week.end}`, t.reminder.title, t.reminder.notificationBody)

  const today = todayISO(now)
  const tomorrow = toISODate(addDays(fromISODate(today), 1))
  for (const alert of homeAlerts(state, today, now)) {
    if ((alert.kind !== 'bill-due' && alert.kind !== 'bill-overdue') || alert.dueDate > tomorrow) continue
    const describe = alert.kind === 'bill-due' ? t.alerts.billDue : t.alerts.billOverdue
    const body = describe(nameOf(state.bills, alert.billId), withAmountsShown(() => formatMoney(alert.amount, state.profile.currency)), t.format.nearDay(alert.dueDate, today))
    await notifyOnce(`bill-${alert.billId}-${alert.dueDate}`, t.reminder.billNotificationTitle, body)
  }
}

/**
 * While the app is open or in the background, wakes up at the next reminder time
 * and at 9:00 each day to send notifications. Closed apps can't run timers: for
 * those, the server pushes the same notifications (see push.ts) if this device
 * opted in, and Home's banner is the fallback.
 */
export function useReminders(ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    let timer: ReturnType<typeof setTimeout> | undefined

    const schedule = () => {
      clearTimeout(timer)
      const now = new Date()
      const { weeklyReminder } = appStore.getState().settings
      const moments = [nextBillCheck(now)]
      if (weeklyReminder.enabled) moments.push(nextReminderMoment(now, weeklyReminder))
      const wait = Math.min(...moments.map((m) => m.getTime() - now.getTime()))
      timer = setTimeout(
        () => {
          void sendDueNotifications()
          schedule()
        },
        // A second late, so the reminder time has passed when it fires.
        Math.min(MAX_DELAY, wait + 1_000),
      )
    }

    schedule()
    const unsubscribe = appStore.subscribe((state, previous) => {
      if (state.settings.weeklyReminder !== previous.settings.weeklyReminder) schedule()
    })
    // Timers drift while a computer sleeps, so re-plan whenever the app is shown or hidden.
    // (Hiding it doesn't notify: whatever was due a moment ago was just on screen.)
    document.addEventListener('visibilitychange', schedule)
    return () => {
      clearTimeout(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [ready])
}
