// What to send to one device right now. Pure: no Firestore, no network, so it's unit-tested.
// Mirrors the in-app logic in src/app/useReminders.ts and src/lib/reminders.ts, and the
// notification keys are the same, so a notification shown by the app and one pushed by the
// server share a tag and never show twice.

export interface PushSubscriptionInfo {
  endpoint: string
  expirationTime?: number | null
  keys: { p256dh: string; auth: string }
}

export type Language = 'en' | 'fr' | 'ar'

export interface DeviceBill {
  id: string
  /** YYYY-MM-DD in the device's local time. */
  dueDate: string
  /**
   * The bill's name and amount ("Rent, 20,000 DA"), sealed by the app with a key that never
   * leaves the device (src/app/pushSeal.ts). This server can't read it: it passes it on in
   * the push, and the device's service worker opens it. Without it the text stays generic.
   */
  sealed?: string
}

/** What a device shares so the server can decide when to notify it. */
export interface Device {
  subscription: PushSubscriptionInfo
  /** IANA name, e.g. Africa/Algiers. */
  timeZone: string
  weeklyReminder: { enabled: boolean; weekday: number; time: string }
  onboardingCompleted: boolean
  /** Day the app was set up; weeks before it are never reminded about. */
  startDate: string
  /** Distinct dates of expenses logged by hand recently (last two weeks and later). */
  expenseDates: string[]
  /** "Nothing to add" was tapped for the week ending on this date. */
  dismissedWeek?: string | null
  /** Unpaid bills coming up or late. */
  bills: DeviceBill[]
  /** The language to write this device's notifications in. Older apps don't send it: English. */
  language?: Language
  /** Notification keys already sent to this device. Server-managed. */
  sentKeys?: string[]
}

export interface PushMessage {
  /** Also the notification tag. */
  key: string
  title: string
  body: string
  /** Where tapping the notification opens the app. */
  url: string
  /** Sealed bill text, for the device to open and put into `template` in place of BILL_SLOT. `body` is the fallback. */
  sealed?: string
  template?: string
}

/** Where the device puts the bill's name and amount once it has opened them. */
export const BILL_SLOT = '{bill}'

/** The reminder is sent if the scheduler runs within this long after the reminder time. */
export const WEEKLY_WINDOW_MINUTES = 180
/** Bills due today or tomorrow (or late) are announced from this hour… */
export const BILL_CHECK_HOUR = 9
/** …and never after this one. */
export const QUIET_HOUR = 21
export const MAX_SENT_KEYS = 60

// Same wording as src/i18n/<language>.ts (reminder.*, alerts.billDue, alerts.billOverdue),
// and the same day names as the app's t.format.nearDay.
export const text = {
  en: {
    weeklyTitle: 'Anything to log?',
    weeklyBody: 'You haven’t logged any expenses this week. Anything to add?',
    billTitle: 'Bill due',
    billDue: (what: string, when: string) => `${what}, is due ${when}`,
    billOverdue: (what: string, when: string) => `${what}, was due ${when}`,
    someBillDue: (when: string) => `A bill is due ${when}`,
    someBillOverdue: (when: string) => `A bill was due ${when}`,
    today: 'today',
    tomorrow: 'tomorrow',
    yesterday: 'yesterday',
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  fr: {
    weeklyTitle: 'Quelque chose à noter ?',
    weeklyBody: 'Vous n’avez enregistré aucune dépense cette semaine. Quelque chose à ajouter ?',
    billTitle: 'Facture à payer',
    billDue: (what: string, when: string) => `${what}, à payer ${when}`,
    billOverdue: (what: string, when: string) => `${what}, échéance dépassée (${when})`,
    someBillDue: (when: string) => `Une facture est à payer ${when}`,
    someBillOverdue: (when: string) => `Une facture n’a pas été payée (${when})`,
    today: 'aujourd’hui',
    tomorrow: 'demain',
    yesterday: 'hier',
    weekdays: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
    months: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  },
  ar: {
    weeklyTitle: 'هل من شيء لتسجيله؟',
    weeklyBody: 'لم تسجّل أي مصاريف هذا الأسبوع. هل من شيء لإضافته؟',
    billTitle: 'فاتورة مستحقة',
    billDue: (what: string, when: string) => `${what}، تستحق ${when}`,
    billOverdue: (what: string, when: string) => `${what}، كانت تستحق ${when}`,
    someBillDue: (when: string) => `فاتورة تستحق ${when}`,
    someBillOverdue: (when: string) => `فاتورة كانت تستحق ${when}`,
    today: 'اليوم',
    tomorrow: 'غدًا',
    yesterday: 'أمس',
    weekdays: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    months: ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  },
} satisfies Record<Language, unknown>

export interface LocalClock {
  /** YYYY-MM-DD */
  date: string
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
  /** Minutes since local midnight. */
  minutes: number
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/** The wall clock in `timeZone` at `now`. Unknown zones fall back to UTC. */
export function localClock(now: Date, timeZone: string): LocalClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: isValidTimeZone(timeZone) ? timeZone : 'UTC',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
  }
}

function toUTC(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

export function addDays(date: string, days: number): string {
  const d = toUTC(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000)
}

/** today, tomorrow, yesterday, a weekday within the week either side, or 17 Nov. */
export function nearDay(date: string, today: string, language: Language = 'en'): string {
  const words = text[language]
  const days = daysBetween(today, date)
  if (days === 0) return words.today
  if (days === 1) return words.tomorrow
  if (days === -1) return words.yesterday
  const d = toUTC(date)
  if (Math.abs(days) < 7) return words.weekdays[d.getUTCDay()]
  return `${d.getUTCDate()} ${words.months[d.getUTCMonth()]}`
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

/** Everything this device should be told right now, in the order to send it. */
export function dueNotifications(device: Device, now: Date): PushMessage[] {
  const clock = localClock(now, device.timeZone)
  const language = device.language ?? 'en'
  const words = text[language]
  const sent = new Set(device.sentKeys ?? [])
  const messages: PushMessage[] = []

  const reminder = device.weeklyReminder
  if (reminder.enabled && device.onboardingCompleted && clock.weekday === reminder.weekday) {
    const since = clock.minutes - minutesOf(reminder.time)
    if (since >= 0 && since <= WEEKLY_WINDOW_MINUTES) {
      const week = { start: addDays(clock.date, -6), end: clock.date }
      const key = `weekly-${week.end}`
      const logged = device.expenseDates.some((d) => d >= week.start && d <= week.end)
      if (!sent.has(key) && !logged && device.startDate <= week.end && device.dismissedWeek !== week.end) {
        messages.push({ key, title: words.weeklyTitle, body: words.weeklyBody, url: '/' })
      }
    }
  }

  if (clock.minutes >= BILL_CHECK_HOUR * 60 && clock.minutes < QUIET_HOUR * 60) {
    const tomorrow = addDays(clock.date, 1)
    for (const bill of device.bills) {
      const key = `bill-${bill.id}-${bill.dueDate}`
      if (bill.dueDate > tomorrow || sent.has(key)) continue
      const late = bill.dueDate < clock.date
      const when = nearDay(bill.dueDate, clock.date, language)
      const message: PushMessage = { key, title: words.billTitle, body: (late ? words.someBillOverdue : words.someBillDue)(when), url: '/plan/bills' }
      if (bill.sealed) Object.assign(message, { sealed: bill.sealed, template: (late ? words.billOverdue : words.billDue)(BILL_SLOT, when) })
      messages.push(message)
    }
  }

  return messages
}

/** The sent list with `keys` added, trimmed to the most recent MAX_SENT_KEYS. */
export function rememberSent(sentKeys: string[] | undefined, keys: string[]): string[] {
  const kept = (sentKeys ?? []).filter((k) => !keys.includes(k))
  return [...kept, ...keys].slice(-MAX_SENT_KEYS)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/
export const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/
/** base64 nonce, a dot, base64 sealed bytes. */
const SEALED = /^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/=]{24,1000}$/

/**
 * Devices saved by older versions of this server kept bills' names and amounts in the clear.
 * Returns the bills without them, or null when there's nothing to take out.
 */
export function withoutBillText(bills: unknown[]): DeviceBill[] | null {
  const clean = (bill: unknown) => isRecord(bill) && Object.keys(bill).every((key) => key === 'id' || key === 'dueDate' || key === 'sealed')
  if (bills.every(clean)) return null
  return bills.filter(isRecord).map((bill) => {
    const { id, dueDate, sealed } = bill as unknown as DeviceBill
    return typeof sealed === 'string' ? { id, dueDate, sealed } : { id, dueDate }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSubscription(value: unknown): value is PushSubscriptionInfo {
  if (!isRecord(value) || !isRecord(value.keys)) return false
  return (
    typeof value.endpoint === 'string' &&
    /^https:\/\//.test(value.endpoint) &&
    value.endpoint.length <= 2048 &&
    typeof value.keys.p256dh === 'string' &&
    typeof value.keys.auth === 'string'
  )
}

/**
 * Checks a device payload sent by the app. Returns the clean device, or the name
 * of the first field that's wrong. Everything is capped so a stranger can't fill the database.
 */
export function parseDevice(body: unknown): Device | string {
  if (!isRecord(body)) return 'body'
  if (!isSubscription(body.subscription)) return 'subscription'
  if (typeof body.timeZone !== 'string' || body.timeZone.length > 64) return 'timeZone'
  const reminder = body.weeklyReminder
  if (!isRecord(reminder) || typeof reminder.enabled !== 'boolean') return 'weeklyReminder'
  if (typeof reminder.weekday !== 'number' || reminder.weekday < 0 || reminder.weekday > 6) return 'weeklyReminder.weekday'
  if (typeof reminder.time !== 'string' || !TIME.test(reminder.time)) return 'weeklyReminder.time'
  if (typeof body.onboardingCompleted !== 'boolean') return 'onboardingCompleted'
  if (typeof body.startDate !== 'string' || !ISO_DATE.test(body.startDate)) return 'startDate'
  const dates = body.expenseDates
  if (!Array.isArray(dates) || dates.length > 100 || !dates.every((d) => typeof d === 'string' && ISO_DATE.test(d))) return 'expenseDates'
  if (body.dismissedWeek != null && (typeof body.dismissedWeek !== 'string' || !ISO_DATE.test(body.dismissedWeek))) return 'dismissedWeek'
  if (!Array.isArray(body.bills) || body.bills.length > 100) return 'bills'
  const bills: DeviceBill[] = []
  for (const bill of body.bills) {
    if (!isRecord(bill)) return 'bills'
    const { id, dueDate, sealed } = bill
    if (typeof id !== 'string' || id.length > 64) return 'bills.id'
    if (typeof dueDate !== 'string' || !ISO_DATE.test(dueDate)) return 'bills.dueDate'
    if (sealed != null && (typeof sealed !== 'string' || !SEALED.test(sealed))) return 'bills.sealed'
    // Older apps also sent the name and amount in the clear: never kept.
    bills.push(typeof sealed === 'string' ? { id, dueDate, sealed } : { id, dueDate })
  }
  return {
    subscription: {
      endpoint: body.subscription.endpoint,
      expirationTime: typeof body.subscription.expirationTime === 'number' ? body.subscription.expirationTime : null,
      keys: { p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth },
    },
    timeZone: isValidTimeZone(body.timeZone) ? body.timeZone : 'UTC',
    weeklyReminder: { enabled: reminder.enabled, weekday: reminder.weekday, time: reminder.time },
    onboardingCompleted: body.onboardingCompleted,
    startDate: body.startDate,
    expenseDates: [...new Set(dates as string[])].sort(),
    dismissedWeek: typeof body.dismissedWeek === 'string' ? body.dismissedWeek : null,
    bills,
    language: body.language === 'fr' || body.language === 'ar' ? body.language : 'en',
  }
}
