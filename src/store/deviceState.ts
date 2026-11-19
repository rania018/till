import type { ISODate } from '../types'

// Small things this device remembers outside the synced data: they describe what
// was shown here, not the user's money, so they never need to sync.

const DISMISSED_REMINDER = 'expense-tracker:reminder-dismissed'
const NOTIFIED = 'expense-tracker:notified'
const MAX_NOTIFIED = 60

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the worst case is a reminder showing twice.
  }
}

/** "Nothing to add" was tapped for the week ending on `weekEnd`. */
export function isReminderDismissed(weekEnd: ISODate): boolean {
  return read(DISMISSED_REMINDER) === weekEnd
}

export function dismissReminder(weekEnd: ISODate): void {
  write(DISMISSED_REMINDER, weekEnd)
}

/** The week whose reminder was dismissed, for the push server. */
export function dismissedReminderWeek(): ISODate | null {
  return read(DISMISSED_REMINDER)
}

function notified(): string[] {
  try {
    const list = JSON.parse(read(NOTIFIED) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** A system notification with this key was already shown on this device. */
export function wasNotified(key: string): boolean {
  return notified().includes(key)
}

export function markNotified(key: string): void {
  write(NOTIFIED, JSON.stringify([...notified().filter((k) => k !== key), key].slice(-MAX_NOTIFIED)))
}

const INSTALL_DISMISSED = 'expense-tracker:install-dismissed'

/** The install pop-up was closed in this tab. It comes back the next time the site is opened, but not on a reload, such as changing language. */
export function isInstallDismissed(): boolean {
  try {
    return sessionStorage.getItem(INSTALL_DISMISSED) === 'yes'
  } catch {
    return false
  }
}

export function dismissInstall(): void {
  try {
    sessionStorage.setItem(INSTALL_DISMISSED, 'yes')
  } catch {
    // Storage blocked: the worst case is the pop-up showing again after a reload.
  }
}

const SYNC_ON = 'expense-tracker:sync-on'
const SYNC_ACCOUNT = 'expense-tracker:sync-account'

/** Signed in for sync on this device, so the app knows to load Firebase when it opens. */
export function isSyncOn(): boolean {
  return read(SYNC_ON) === 'yes'
}

export function setSyncOn(on: boolean): void {
  write(SYNC_ON, on ? 'yes' : 'no')
}

/** The account this device's data was last synced with, even after signing out. */
export function syncedAccount(): string | null {
  return read(SYNC_ACCOUNT)
}

export function rememberSyncedAccount(uid: string): void {
  write(SYNC_ACCOUNT, uid)
}

export function clearSyncedAccount(): void {
  try {
    localStorage.removeItem(SYNC_ACCOUNT)
  } catch {
    // Storage blocked: nothing was remembered either.
  }
}

const LAST_BACKUP = 'expense-tracker:last-backup'

/** When a backup file was last saved from this device. */
export function lastBackupAt(): string | null {
  return read(LAST_BACKUP)
}

export function rememberBackup(moment: string): void {
  write(LAST_BACKUP, moment)
}

const SAFEKEEPING_SNOOZED = 'expense-tracker:safekeeping-snoozed'

/** When "Not now" was last tapped on Home's reminder to keep a copy. */
export function safekeepingSnoozedAt(): string | null {
  return read(SAFEKEEPING_SNOOZED)
}

export function snoozeSafekeeping(moment: string): void {
  write(SAFEKEEPING_SNOOZED, moment)
}

const FUNDS_SNOOZED = 'expense-tracker:funds-snoozed'

/** The month Home's "Put aside for your funds" was put off for, by its first day. */
export function fundsSnoozedFor(): ISODate | null {
  return read(FUNDS_SNOOZED)
}

export function snoozeFunds(monthStart: ISODate): void {
  write(FUNDS_SNOOZED, monthStart)
}

const REVIEW_DISMISSED = 'expense-tracker:review-dismissed'

/** The pay cycle whose review card was put away on Home, by its first day. */
export function reviewDismissedFor(): ISODate | null {
  return read(REVIEW_DISMISSED)
}

export function dismissReview(cycleStart: ISODate): void {
  write(REVIEW_DISMISSED, cycleStart)
}
