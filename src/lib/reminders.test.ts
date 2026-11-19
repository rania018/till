import { describe, expect, it } from 'vitest'
import { PREVIEW_TODAY, previewExample } from '../test/previewExample'
import { lastReminderMoment, nextReminderMoment, weeklyReminderDue } from './reminders'

const SATURDAY_20 = { weekday: 6, time: '20:00' }
// Local times: Saturday 14 November 2026 is the reminder day of the preview's week.
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 10, day, hours, minutes)

describe('reminder moments', () => {
  it('finds the last and next Saturday 20:00', () => {
    expect(lastReminderMoment(at(15, 9), SATURDAY_20)).toEqual(at(14, 20))
    expect(lastReminderMoment(at(14, 20), SATURDAY_20)).toEqual(at(14, 20))
    expect(lastReminderMoment(at(14, 19, 59), SATURDAY_20)).toEqual(at(7, 20))
    expect(nextReminderMoment(at(14, 19, 59), SATURDAY_20)).toEqual(at(14, 20))
    expect(nextReminderMoment(at(14, 20), SATURDAY_20)).toEqual(at(21, 20))
  })
})

describe('weeklyReminderDue', () => {
  const quietWeek = () => {
    const data = previewExample()
    // Nothing logged between Sunday 8 and Saturday 14 November, except a cash-count correction.
    data.transactions = data.transactions.filter((t) => t.date < '2026-11-08' || t.date > '2026-11-14')
    data.transactions.push({ id: 'count', createdAt: '', updatedAt: '', type: 'expense', amount: 300, date: '2026-11-12', accountId: 'acc-cash', categoryId: 'cat-untracked', source: 'cash-count' })
    return data
  }

  it('reminds after Saturday 20:00 when the week had no expenses', () => {
    expect(weeklyReminderDue(quietWeek(), at(14, 20, 5))).toMatchObject({ week: { start: '2026-11-08', end: '2026-11-14' } })
    expect(weeklyReminderDue(quietWeek(), at(14, 19))).toBeNull()
    // Still asks on Monday, but not once 72 hours have passed.
    expect(weeklyReminderDue(quietWeek(), at(16, 9))).not.toBeNull()
    expect(weeklyReminderDue(quietWeek(), at(17, 21))).toBeNull()
  })

  it('stays quiet when something was logged, when switched off, or before setup', () => {
    expect(weeklyReminderDue(previewExample(), at(14, 21))).toBeNull()
    const off = quietWeek()
    off.settings = { ...off.settings, weeklyReminder: { ...off.settings.weeklyReminder, enabled: false } }
    expect(weeklyReminderDue(off, at(14, 21))).toBeNull()
    const newcomer = quietWeek()
    newcomer.profile = { ...newcomer.profile, startDate: PREVIEW_TODAY }
    expect(weeklyReminderDue(newcomer, at(14, 21))).toBeNull()
  })
})
