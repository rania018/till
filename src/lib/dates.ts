import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, getDaysInMonth, parseISO, startOfMonth, subDays } from 'date-fns'
import type { ISODate, PaySchedule } from '../types'

// All dates are local calendar days as `YYYY-MM-DD` strings. Never derive them
// with `toISOString()`, which converts to UTC and can shift the day.

export function toISODate(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd')
}

export function fromISODate(iso: ISODate): Date {
  return parseISO(iso)
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now)
}

export function isWithin(date: ISODate, range: { start: ISODate; end: ISODate }): boolean {
  // ISO dates sort the same as strings.
  return date >= range.start && date <= range.end
}

/** A budget month. `end` is inclusive. */
export interface Cycle {
  start: ISODate
  end: ISODate
  days: number
}

function makeCycle(start: Date, end: Date): Cycle {
  return { start: toISODate(start), end: toISODate(end), days: differenceInCalendarDays(end, start) + 1 }
}

/** The payday inside a month, moved to the last day for short months (payday 31 → 30 Nov, 28 Feb). */
function paydayInMonth(monthStart: Date, payday: number): Date {
  const day = Math.min(Math.max(1, payday), getDaysInMonth(monthStart))
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), day)
}

export function isShortPay(salary: Pick<PaySchedule, 'frequency'>): boolean {
  return salary.frequency === 'weekly' || salary.frequency === 'biweekly'
}

/** Whether paydays are known dates. Irregular pay has none, and neither does weekly or biweekly pay saved before it had a date. */
export function hasPaydays(salary: PaySchedule): boolean {
  return salary.frequency === 'monthly' || (isShortPay(salary) && !!salary.anchor)
}

/**
 * The pay cycle containing `date`: from payday to the day before the next payday,
 * e.g. 25 Oct – 24 Nov, or 7 and 14 days for weekly and biweekly pay. Irregular pay
 * has a budget month starting on `payday`.
 */
export function getPayCycle(date: ISODate, salary: PaySchedule): Cycle {
  const day = fromISODate(date)
  const monthStart = startOfMonth(day)
  if (isShortPay(salary)) {
    if (!salary.anchor) return makeCycle(monthStart, endOfMonth(day))
    const length = salary.frequency === 'weekly' ? 7 : 14
    const anchor = fromISODate(salary.anchor)
    const start = addDays(anchor, Math.floor(differenceInCalendarDays(day, anchor) / length) * length)
    return makeCycle(start, addDays(start, length - 1))
  }
  const paydayThisMonth = paydayInMonth(monthStart, salary.payday)
  const start = day >= paydayThisMonth ? paydayThisMonth : paydayInMonth(addMonths(monthStart, -1), salary.payday)
  const nextStart = paydayInMonth(addMonths(startOfMonth(start), 1), salary.payday)
  return makeCycle(start, subDays(nextStart, 1))
}

/**
 * What monthly plans follow: bills, goals and instalments are monthly amounts. With monthly
 * pay that's the pay cycle; with weekly and biweekly pay, calendar months.
 */
export function planSchedule(salary: PaySchedule): PaySchedule {
  return isShortPay(salary) ? { frequency: 'monthly', payday: 1 } : salary
}

export function planMonth(date: ISODate, salary: PaySchedule): Cycle {
  return getPayCycle(date, planSchedule(salary))
}

/** How much of a month a cycle stands for, so monthly amounts can be shared out over weeks. */
export function monthShare(cycle: Pick<Cycle, 'days'>): number {
  if (cycle.days === 7) return 12 / 52
  if (cycle.days === 14) return 12 / 26
  return 1
}

/**
 * The `n`-th payday after `today` (n ≥ 1): the first day of the `n`-th pay cycle
 * after the one containing `today`. Goals are forecast on these, since money is
 * put aside once per pay cycle.
 */
export function nthPayday(today: ISODate, salary: PaySchedule, n: number): ISODate {
  const { payday } = planSchedule(salary)
  const start = fromISODate(planMonth(today, salary).start)
  return toISODate(paydayInMonth(addMonths(startOfMonth(start), n), payday))
}

/** How many paydays fall after `today` and on or before `deadline`. */
export function paydaysUntil(today: ISODate, deadline: ISODate, salary: PaySchedule): number {
  if (deadline <= today) return 0
  const { payday } = planSchedule(salary)
  const start = fromISODate(planMonth(today, salary).start)
  const end = fromISODate(deadline)
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  if (months < 1) return 0
  // One payday a month: every month before the deadline's counts, and the deadline's own month counts if its payday isn't past the deadline.
  return months - 1 + (toISODate(paydayInMonth(startOfMonth(end), payday)) <= deadline ? 1 : 0)
}

export function previousCycle(cycle: Cycle, salary: PaySchedule): Cycle {
  return getPayCycle(toISODate(subDays(fromISODate(cycle.start), 1)), salary)
}

export function nextCycle(cycle: Cycle, salary: PaySchedule): Cycle {
  return getPayCycle(toISODate(addDays(fromISODate(cycle.end), 1)), salary)
}

/** The last `count` cycles up to and including the one containing `date`, oldest first. */
export function recentCycles(date: ISODate, salary: PaySchedule, count: number): Cycle[] {
  const cycles = [getPayCycle(date, salary)]
  while (cycles.length < count) cycles.unshift(previousCycle(cycles[0], salary))
  return cycles
}

export interface CycleProgress {
  /** 1-based day of the cycle; 0 before it starts. */
  dayNumber: number
  /** Days left including today; 0 after it ends. */
  daysLeft: number
  /** Share of the cycle gone, 0–1, counting today as gone. */
  elapsedRatio: number
}

export function cycleProgress(cycle: Cycle, today: ISODate): CycleProgress {
  if (today < cycle.start) return { dayNumber: 0, daysLeft: cycle.days, elapsedRatio: 0 }
  if (today > cycle.end) return { dayNumber: cycle.days, daysLeft: 0, elapsedRatio: 1 }
  const dayNumber = differenceInCalendarDays(fromISODate(today), fromISODate(cycle.start)) + 1
  return { dayNumber, daysLeft: cycle.days - dayNumber + 1, elapsedRatio: dayNumber / cycle.days }
}

/** The 7-day week containing `date` that ends on `endWeekday` (0 = Sunday … 6 = Saturday). */
export function weekEndingOn(date: ISODate, endWeekday: number): { start: ISODate; end: ISODate } {
  const day = fromISODate(date)
  const end = addDays(day, (endWeekday - day.getDay() + 7) % 7)
  return { start: toISODate(subDays(end, 6)), end: toISODate(end) }
}
