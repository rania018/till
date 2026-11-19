import { subDays } from 'date-fns'
import type { AppData, ISODate, Settings } from '../types'
import { isWithin, toISODate } from './dates'
import { live } from './id'

type ReminderTime = Pick<Settings['weeklyReminder'], 'weekday' | 'time'>

/** After the reminder time, Home keeps asking for this long (e.g. Saturday 20:00 → Tuesday 20:00). */
export const REMINDER_SHOWS_HOURS = 72

function atTime(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const moment = new Date(day)
  moment.setHours(hours || 0, minutes || 0, 0, 0)
  return moment
}

/** The latest reminder time at or before `now`, e.g. last Saturday 20:00. */
export function lastReminderMoment(now: Date, reminder: ReminderTime): Date {
  const moment = atTime(now, reminder.time)
  moment.setDate(moment.getDate() - ((now.getDay() - reminder.weekday + 7) % 7))
  if (moment > now) moment.setDate(moment.getDate() - 7)
  return moment
}

/** The first reminder time after `now`. */
export function nextReminderMoment(now: Date, reminder: ReminderTime): Date {
  const moment = lastReminderMoment(now, reminder)
  moment.setDate(moment.getDate() + 7)
  return moment
}

export interface DueReminder {
  /** The 7 days that ended on the reminder day. */
  week: { start: ISODate; end: ISODate }
  moment: Date
}

/**
 * The weekly reminder, if it should show now: it's past the reminder time (by at
 * most REMINDER_SHOWS_HOURS) and nothing was spent in the 7 days up to it. Cash-count
 * corrections don't count as logging; weeks before setup are never reminded about.
 */
export function weeklyReminderDue(data: Pick<AppData, 'profile' | 'settings' | 'transactions'>, now: Date): DueReminder | null {
  const reminder = data.settings.weeklyReminder
  if (!reminder.enabled || !data.profile.onboardingCompleted) return null
  const moment = lastReminderMoment(now, reminder)
  if (now.getTime() - moment.getTime() > REMINDER_SHOWS_HOURS * 3_600_000) return null
  const week = { start: toISODate(subDays(moment, 6)), end: toISODate(moment) }
  if (data.profile.startDate > week.end) return null
  const logged = live(data.transactions).some((t) => t.type === 'expense' && !t.source && isWithin(t.date, week))
  return logged ? null : { week, moment }
}
