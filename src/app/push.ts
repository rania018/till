import { addDays } from 'date-fns'
import type { Language } from '../i18n/language'
import { billOccurrences } from '../lib/bills'
import { fromISODate, nextCycle, planMonth, planSchedule, todayISO, toISODate } from '../lib/dates'
import { live } from '../lib/id'
import { formatMoney, withAmountsShown } from '../lib/money'
import { appStore } from '../store'
import { dismissedReminderWeek } from '../store/deviceState'
import type { AppData, ISODate } from '../types'
import { PUSH_API, PUSH_ENABLED, VAPID_PUBLIC_KEY } from './pushConfig'
import { sealForPush } from './pushSeal'

/**
 * Reminders while the app is closed. The browser's push service wakes the service
 * worker (public/sw-notifications.js) when the server sends a message; the server
 * is a Cloudflare Worker (push-server/) that runs every 15 minutes and only knows what
 * this file sends it: the reminder time, which days had expenses, and when the next
 * bills are due. Their names and amounts are sealed with a key only this device has
 * (pushSeal.ts), so the server passes them on without being able to read them.
 * If the browser ever swaps the subscription, the next sync sends the new one.
 */

const API = `${PUSH_API}/push`
/** Expenses from this many days back are shared, so the server can tell whether the week was empty. */
export const EXPENSE_DAYS_SHARED = 14
/** Unpaid bills due within this many days are shared. */
export const BILL_DAYS_SHARED = 14
/** Store changes are sent after this pause, so a burst of edits is one request. */
const SYNC_DELAY_MS = 3_000

export type PushState = 'unsupported' | 'off' | 'on'

export function pushSupported(): boolean {
  return PUSH_ENABLED && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  // The service worker only exists in production builds, so this is undefined in `pnpm dev`.
  return pushSupported() ? navigator.serviceWorker.getRegistration() : undefined
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** Whether this device is registered for reminders while the app is closed. */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  return (await currentSubscription()) ? 'on' : 'off'
}

/** What the server needs, apart from the subscription. Pure, so it's tested. */
export interface PushDeviceData {
  weeklyReminder: AppData['settings']['weeklyReminder']
  onboardingCompleted: boolean
  startDate: ISODate
  /** Distinct dates of expenses logged by hand, recent and future. */
  expenseDates: ISODate[]
  /** The language the server writes this device's notifications in. */
  language: Language
  /** Unpaid bills: overdue, or due soon. */
  bills: { id: string; name: string; dueDate: ISODate; amountText: string }[]
}

export function pushDeviceData(data: Pick<AppData, 'profile' | 'settings' | 'bills' | 'transactions'>, today: ISODate): PushDeviceData {
  const since = toISODate(addDays(fromISODate(today), -EXPENSE_DAYS_SHARED))
  const expenseDates = [...new Set(live(data.transactions).filter((t) => t.type === 'expense' && !t.source && t.date >= since).map((t) => t.date))].sort()

  const horizon = toISODate(addDays(fromISODate(today), BILL_DAYS_SHARED))
  const cycle = planMonth(today, data.profile.salary)
  const bills: PushDeviceData['bills'] = []
  for (const bill of live(data.bills).filter((b) => b.active)) {
    for (const span of [cycle, nextCycle(cycle, planSchedule(data.profile.salary))]) {
      for (const occurrence of billOccurrences(bill, span, data.transactions, today)) {
        if (occurrence.status === 'paid' || occurrence.dueDate > horizon) continue
        bills.push({ id: bill.id, name: bill.name, dueDate: occurrence.dueDate, amountText: withAmountsShown(() => formatMoney(bill.amount, data.profile.currency)) })
      }
    }
  }
  bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name))

  return {
    weeklyReminder: data.settings.weeklyReminder,
    onboardingCompleted: data.profile.onboardingCompleted,
    startDate: data.profile.startDate,
    expenseDates,
    language: data.profile.language,
    bills,
  }
}

/** A bill's name and amount as the notification shows them, e.g. "Rent, 20,000 DA". */
export function billText(name: string, amountText: string, language: Language): string {
  return `${name}${language === 'ar' ? '، ' : ', '}${amountText}`
}

function deviceState(subscription: PushSubscription) {
  return {
    subscription: subscription.toJSON(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dismissedWeek: dismissedReminderWeek(),
    ...pushDeviceData(appStore.getState(), todayISO()),
  }
}

/** What goes to the server: bills keep only their id and due date in the clear, the rest sealed. */
async function devicePayload(state: ReturnType<typeof deviceState>): Promise<string> {
  const bills = await Promise.all(
    state.bills.map(async ({ id, dueDate, name, amountText }) => {
      try {
        return { id, dueDate, sealed: await sealForPush(billText(name, amountText, state.language)) }
      } catch (error) {
        // No key storage here: the reminder still comes, without the name and amount.
        console.warn('Could not seal a bill for the reminder server.', error)
        return { id, dueDate }
      }
    }),
  )
  return JSON.stringify({ ...state, bills })
}

/** The last state sent, before sealing: a sealed payload differs every time, so it can't be compared. */
let lastSent: string | undefined

/** Sends this device's current state to the server. Quiet on failure: the next change tries again. */
async function syncNow(): Promise<boolean> {
  const subscription = await currentSubscription()
  if (!subscription) return false
  const state = deviceState(subscription)
  const plain = JSON.stringify(state)
  if (plain === lastSent) return true
  try {
    const response = await fetch(`${API}/devices/${encodeURIComponent(appStore.getState().deviceId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: await devicePayload(state),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    lastSent = plain
    return true
  } catch (error) {
    console.warn('Could not update the reminder server.', error)
    return false
  }
}

let syncTimer: ReturnType<typeof setTimeout> | undefined

/** Asks for a sync soon. Safe to call often; does nothing when push is off. */
export function requestPushSync(): void {
  if (!pushSupported()) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => void syncNow(), SYNC_DELAY_MS)
}

function toKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

/**
 * Registers this device for reminders while the app is closed. Needs notification
 * permission (asked here if still undecided), a service worker and a reachable server.
 */
export async function enablePush(): Promise<'on' | 'denied' | 'unsupported' | 'failed'> {
  if (!pushSupported()) return 'unsupported'
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (permission !== 'granted') return 'denied'
  const reg = await registration()
  if (!reg) return 'failed'
  try {
    let subscription = await reg.pushManager.getSubscription()
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) })
    }
    lastSent = undefined
    if (await syncNow()) return 'on'
    // The server never heard of us: don't leave a subscription it can't use.
    await subscription.unsubscribe()
    return 'failed'
  } catch (error) {
    console.error('Could not turn on push reminders.', error)
    return 'failed'
  }
}

/** Stops reminders while the app is closed and asks the server to forget this device. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription()
  clearTimeout(syncTimer)
  lastSent = undefined
  if (!subscription) return
  await subscription.unsubscribe()
  try {
    await fetch(`${API}/devices/${encodeURIComponent(appStore.getState().deviceId)}`, { method: 'DELETE' })
  } catch (error) {
    // The server drops the device anyway once the push service reports the subscription gone.
    console.warn('Could not tell the reminder server.', error)
  }
}

/** Sends the state right away if registered. For app start and coming back on screen. */
export function syncPushIfOn(): void {
  if (!pushSupported()) return
  clearTimeout(syncTimer)
  void syncNow()
}
