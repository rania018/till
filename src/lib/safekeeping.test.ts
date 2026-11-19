import { describe, expect, it, vi } from 'vitest'
import { BACKUP_STALE_DAYS, keepStorage, needsSafekeeping, SAFEKEEPING_MIN_ENTRIES, SAFEKEEPING_SNOOZE_DAYS } from './safekeeping'

const now = new Date(2026, 10, 5, 12)
const daysAgo = (days: number) => new Date(2026, 10, 5 - days, 12).toISOString()
const base = { entries: SAFEKEEPING_MIN_ENTRIES, synced: false, lastBackup: null, snoozedAt: null, now }

describe('needsSafekeeping', () => {
  it('speaks up once there is something to lose and no copy of it', () => {
    expect(needsSafekeeping(base)).toBe(true)
  })

  it('leaves a new person alone', () => {
    expect(needsSafekeeping({ ...base, entries: SAFEKEEPING_MIN_ENTRIES - 1 })).toBe(false)
  })

  it('stays quiet when signed in, whatever the backups', () => {
    expect(needsSafekeeping({ ...base, synced: true })).toBe(false)
  })

  it('counts a recent backup, until it goes stale', () => {
    expect(needsSafekeeping({ ...base, lastBackup: daysAgo(BACKUP_STALE_DAYS - 1) })).toBe(false)
    expect(needsSafekeeping({ ...base, lastBackup: daysAgo(BACKUP_STALE_DAYS) })).toBe(true)
  })

  it('"Not now" lasts a while, then it asks again', () => {
    expect(needsSafekeeping({ ...base, snoozedAt: daysAgo(SAFEKEEPING_SNOOZE_DAYS - 1) })).toBe(false)
    expect(needsSafekeeping({ ...base, snoozedAt: daysAgo(SAFEKEEPING_SNOOZE_DAYS) })).toBe(true)
  })
})

describe('keepStorage', () => {
  it('asks when the data is not protected yet', async () => {
    const storage = { persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(true) }
    await keepStorage(storage)
    expect(storage.persist).toHaveBeenCalledOnce()
  })

  it('does not ask twice', async () => {
    const storage = { persisted: vi.fn().mockResolvedValue(true), persist: vi.fn() }
    await keepStorage(storage)
    expect(storage.persist).not.toHaveBeenCalled()
  })

  it('takes no for an answer, and a browser without it', async () => {
    const refusing = { persisted: vi.fn().mockRejectedValue(new Error('blocked')), persist: vi.fn() }
    await expect(keepStorage(refusing)).resolves.toBeUndefined()
    await expect(keepStorage({} as StorageManager)).resolves.toBeUndefined()
  })
})
