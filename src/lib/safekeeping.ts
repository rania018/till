import { differenceInCalendarDays } from 'date-fns'

/** Below this there's little to lose, and a new person shouldn't be nagged. */
export const SAFEKEEPING_MIN_ENTRIES = 10
/** A backup older than this no longer covers much. */
export const BACKUP_STALE_DAYS = 30
/** How long "Not now" lasts. */
export const SAFEKEEPING_SNOOZE_DAYS = 14

interface SafekeepingState {
  entries: number
  /** Signed in here, so there's a copy online. */
  synced: boolean
  /** When a backup file was last saved here. */
  lastBackup: string | null
  /** When "Not now" was last tapped here. */
  snoozedAt: string | null
  now: Date
}

const daysSince = (moment: string, now: Date) => differenceInCalendarDays(now, new Date(moment))

/** Whether Home should say that everything is on this device only. */
export function needsSafekeeping({ entries, synced, lastBackup, snoozedAt, now }: SafekeepingState): boolean {
  if (synced || entries < SAFEKEEPING_MIN_ENTRIES) return false
  if (lastBackup && daysSince(lastBackup, now) < BACKUP_STALE_DAYS) return false
  return !snoozedAt || daysSince(snoozedAt, now) >= SAFEKEEPING_SNOOZE_DAYS
}

/**
 * Asks the browser not to clear this site's data when space runs low. The browser decides, and
 * may not say yes; clearing site data by hand still deletes it, so this doesn't replace a backup.
 */
export async function keepStorage(storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = navigator.storage): Promise<void> {
  try {
    if (!storage?.persist || (await storage.persisted())) return
    await storage.persist()
  } catch {
    // Not offered here: the data is just as safe as it was.
  }
}
