import { addDays, addYears, differenceInCalendarDays } from 'date-fns'
import type { Bill, FundRepeat, Goal, ID, ISODate, PaySchedule, Transaction } from '../types'
import { billDueDates, billOccurrences, totalMonthlyBills } from './bills'
import { fromISODate, planMonth, toISODate } from './dates'
import { live } from './id'
import { roundMoney } from './money'

/**
 * A fund is in season this many days either side of its date: Ramadan shopping starts before
 * the first day, and school things are still bought after the first week. That's when the + sheet
 * offers to pay from it.
 */
export const FUND_SEASON_DAYS = 30

/** An Islamic year is about 354 days, so these dates come about 11 days earlier each year. */
const HIJRI_YEAR_DAYS = 354.367

let hijriFormat: Intl.DateTimeFormat | null | undefined

/** The browser's Islamic calendar, or `null` if it has none. Umm al-Qura where there's a choice. */
function hijriCalendar(): Intl.DateTimeFormat | null {
  if (hijriFormat !== undefined) return hijriFormat
  try {
    const format = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', timeZone: 'UTC' })
    hijriFormat = format.resolvedOptions().calendar.startsWith('islamic') ? format : null
  } catch {
    hijriFormat = null
  }
  return hijriFormat
}

/** Islamic month (1–12) and day of a date, or `null` without the calendar. */
export function hijriMonthDay(date: ISODate): { month: number; day: number } | null {
  const format = hijriCalendar()
  if (!format) return null
  const parts = format.formatToParts(new Date(`${date}T12:00:00Z`))
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  return Number.isInteger(month) && Number.isInteger(day) ? { month, day } : null
}

/** The first day on or after `from` that falls on this Islamic month and day, e.g. 1 Ramadan. */
export function nextHijriDate(month: number, day: number, from: ISODate): ISODate | null {
  if (!hijriCalendar()) return null
  const start = fromISODate(from)
  for (let offset = 0; offset < 390; offset++) {
    const date = toISODate(addDays(start, offset))
    const parts = hijriMonthDay(date)
    if (parts && parts.month === month && parts.day === day) return date
  }
  return null
}

/** The same Islamic day `years` Islamic years after `anchor`. Without the calendar, an estimate. */
function hijriYearsLater(anchor: ISODate, years: number): ISODate {
  const guess = addDays(fromISODate(anchor), Math.round(years * HIJRI_YEAR_DAYS))
  const wanted = hijriMonthDay(anchor)
  if (!wanted) return toISODate(guess)
  // Some months have 29 days: the 30th comes round as the 29th.
  const day = Math.min(wanted.day, 29)
  for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
    const date = toISODate(addDays(guess, offset))
    const parts = hijriMonthDay(date)
    if (parts && parts.month === wanted.month && parts.day === day) return date
  }
  return toISODate(guess)
}

/** The first time a repeating date comes round on or after `from`. Never before `anchor` itself. */
export function occurrenceFrom(anchor: ISODate, repeat: FundRepeat, from: ISODate): ISODate {
  if (anchor >= from) return anchor
  const anchorDate = fromISODate(anchor)
  if (repeat === 'yearly') {
    // Counted from the anchor each time, so 29 February comes back in leap years.
    let years = fromISODate(from).getFullYear() - anchorDate.getFullYear()
    let date = toISODate(addYears(anchorDate, years))
    while (date < from) date = toISODate(addYears(anchorDate, ++years))
    return date
  }
  let years = Math.max(0, Math.floor(differenceInCalendarDays(fromISODate(from), anchorDate) / HIJRI_YEAR_DAYS))
  let date = hijriYearsLater(anchor, years)
  while (date < from) date = hijriYearsLater(anchor, ++years)
  return date
}

export interface FundContext {
  bills: Bill[]
  transactions: Transaction[]
  salary: PaySchedule
}

/**
 * When a bill's fund is next needed: a due date this month that isn't paid yet, or the bill's
 * next due date after this month. `null` when it's paused or gone.
 */
function billFundDate(bill: Bill, today: ISODate, transactions: Transaction[], salary: PaySchedule): ISODate | null {
  const month = planMonth(today, salary)
  const open = billOccurrences(bill, month, transactions, today).find((o) => o.status !== 'paid')
  if (open) return open.dueDate
  const after = toISODate(addDays(fromISODate(month.end), 1))
  return billDueDates(bill, { start: after, end: toISODate(addYears(fromISODate(after), 2)) })[0] ?? null
}

/** The bill a fund pays, while it's still there. */
export function fundBill(goal: Pick<Goal, 'fund'>, bills: Bill[]): Bill | undefined {
  const billId = goal.fund?.billId
  return billId ? live(bills).find((b) => b.id === billId) : undefined
}

/**
 * When the money is next needed, today or later: the next Ramadan, or the bill's next due date.
 * A plain goal's is its deadline. `null` when there's no date, as with a paused or deleted bill.
 */
export function fundDueDate(goal: Pick<Goal, 'deadline' | 'fund'>, today: ISODate, context: FundContext): ISODate | null {
  const { fund } = goal
  if (!fund) return goal.deadline ?? null
  if (fund.billId) {
    const bill = fundBill(goal, context.bills)
    return bill?.active ? billFundDate(bill, today, context.transactions, context.salary) : null
  }
  return goal.deadline ? occurrenceFrom(goal.deadline, fund.repeat ?? 'yearly', today) : null
}

/**
 * The date a fund is in season for, if today is within `FUND_SEASON_DAYS` of it: that's when
 * the + sheet offers it. A bill's fund is offered with its bill instead, so it has none.
 */
export function fundSeason(goal: Pick<Goal, 'deadline' | 'fund'>, today: ISODate): ISODate | null {
  const { fund } = goal
  if (!fund || fund.billId || !goal.deadline) return null
  const from = toISODate(addDays(fromISODate(today), -FUND_SEASON_DAYS))
  const date = occurrenceFrom(goal.deadline, fund.repeat ?? 'yearly', from)
  return differenceInCalendarDays(fromISODate(date), fromISODate(today)) <= FUND_SEASON_DAYS ? date : null
}

/** The fund in use for a bill. A finished one is no longer paying it. */
export function fundForBill(goals: Goal[], billId: ID | undefined): Goal | undefined {
  return billId ? live(goals).find((g) => !g.archived && g.fund?.billId === billId) : undefined
}

/** Bills a fund pays: what they cost is planned through the fund's monthly amount instead. */
export function fundedBillIds(goals: Goal[]): Set<ID> {
  return new Set(
    live(goals)
      .filter((g) => !g.archived && g.fund?.billId)
      .map((g) => g.fund!.billId!),
  )
}

/** Bills for a monthly plan: the ones a fund pays are left out, or they'd be counted twice. */
export function plannedMonthlyBills(bills: Bill[], goals: Goal[]): number {
  const funded = fundedBillIds(goals)
  return totalMonthlyBills(bills.filter((b) => !funded.has(b.id)))
}

/** The part of an expense a fund paid. Nothing for anything else. */
export function fundPart(t: Pick<Transaction, 'type' | 'fundAmount'>): number {
  return t.type === 'expense' ? (t.fundAmount ?? 0) : 0
}

/** The part of an expense that left its wallet: what a fund didn't pay. */
export function walletPart(t: Pick<Transaction, 'type' | 'amount' | 'fundAmount'>): number {
  return Math.max(0, roundMoney(t.amount - fundPart(t)))
}
