import { addDays, endOfMonth, startOfMonth } from 'date-fns'
import type { AppData, Debt, ID, ISODate, Transaction } from '../types'
import { billDueDates, billOccurrences } from './bills'
import { isMainCurrency } from './currency'
import { fromISODate, planMonth, toISODate, type Cycle } from './dates'
import { debtOwed, debtPlan } from './debts'
import { occurrenceFrom } from './funds'
import { live } from './id'
import { expectedPays, scheduledPays } from './income'
import { roundMoney } from './money'
import { spentAmount } from './spending'

/**
 * A calendar month: what was spent and received each day, and what falls due on it. Amounts are
 * the main currency's; entries in others are listed but never added in, as everywhere else.
 */

export type CalendarEventKind = 'bill' | 'pay' | 'goal' | 'fund' | 'debt' | 'instalment'

/** `paid` and `received` are done; `late` is past and still open; `expected` is pay due with no answer yet. */
export type CalendarEventStatus = 'paid' | 'late' | 'upcoming' | 'expected' | 'received'

export interface CalendarEvent {
  id: string
  kind: CalendarEventKind
  date: ISODate
  /** A bill's, goal's or income's name, or the person for a debt. Left out for the salary, whose name comes from the language. */
  name?: string
  amount?: number
  currency?: string
  status: CalendarEventStatus
  /** The record it's about, to open its page. */
  recordId?: ID
}

export interface CalendarDay {
  date: ISODate
  /** Expenses in the main currency, less refunds. */
  spent: number
  /** Income in the main currency. */
  received: number
  /** Every live entry on the day, in any currency, newest first. */
  entries: Transaction[]
  events: CalendarEvent[]
}

export interface CalendarMonth {
  /** The first day, `YYYY-MM-01`. */
  month: ISODate
  days: CalendarDay[]
  spent: number
  received: number
  /** The biggest day's spending, so cells can be shaded against it. */
  busiestDay: number
  /** Bills due this month: how many, and what's still to pay. */
  billsDue: number
  /** How many of them aren't paid yet, and what they come to. */
  billsOpen: number
  billsToPay: number
}

type CalendarData = Pick<AppData, 'profile' | 'transactions' | 'bills' | 'goals' | 'debts' | 'incomes'>

/** `YYYY-MM-01` for the month containing `date`. */
export function monthOf(date: ISODate): ISODate {
  return toISODate(startOfMonth(fromISODate(date)))
}

const ORDER: Record<CalendarEventKind, number> = { pay: 0, bill: 1, instalment: 2, debt: 3, fund: 4, goal: 5 }

export function calendarMonth(data: CalendarData, month: ISODate, today: ISODate): CalendarMonth {
  const first = fromISODate(monthOf(month))
  const range = { start: toISODate(first), end: toISODate(endOfMonth(first)) }
  const main = data.profile.currency
  const days = new Map<ISODate, CalendarDay>()
  for (let day = first; toISODate(day) <= range.end; day = addDays(day, 1)) {
    const date = toISODate(day)
    days.set(date, { date, spent: 0, received: 0, entries: [], events: [] })
  }
  const inMonth = (date: ISODate) => date >= range.start && date <= range.end
  const add = (event: CalendarEvent) => days.get(event.date)?.events.push(event)

  for (const t of live(data.transactions)) {
    const day = days.get(t.date)
    if (!day) continue
    day.entries.push(t)
    if (!isMainCurrency(t, main)) continue
    day.spent = roundMoney(day.spent + spentAmount(t))
    if (t.type === 'income') day.received = roundMoney(day.received + t.amount)
  }

  // Bills, each due date with whether it's paid. Payments match due dates within the plan's month, as on Bills.
  const cycles = new Map<ISODate, Cycle>()
  const cycleOf = (date: ISODate) => {
    const cycle = planMonth(date, data.profile.salary)
    return cycles.get(cycle.start) ?? (cycles.set(cycle.start, cycle), cycle)
  }
  let billsDue = 0
  let billsOpen = 0
  let billsToPay = 0
  for (const bill of live(data.bills).filter((b) => b.active)) {
    for (const date of billDueDates(bill, range)) {
      const occurrence = billOccurrences(bill, cycleOf(date), data.transactions, today).find((o) => o.dueDate === date)
      const paid = occurrence?.status === 'paid'
      billsDue++
      if (!paid) {
        billsOpen++
        billsToPay = roundMoney(billsToPay + bill.amount)
      }
      add({ id: `bill-${bill.id}-${date}`, kind: 'bill', date, name: bill.name, amount: bill.amount, status: paid ? 'paid' : date < today ? 'late' : 'upcoming', recordId: bill.id })
    }
  }

  // Pay: what arrived shows as an entry; due with no answer, or still to come, shows here.
  for (const pay of [...expectedPays(data, today), ...scheduledPays(data, range, today)]) {
    if (!inMonth(pay.payDate)) continue
    add({ id: `pay-${pay.id}`, kind: 'pay', date: pay.payDate, name: pay.name, amount: pay.amount, currency: pay.currency, status: pay.payDate <= today ? 'expected' : 'upcoming', recordId: pay.sourceId })
  }

  for (const goal of live(data.goals).filter((g) => !g.archived && g.deadline)) {
    // A bill's fund shows through its bill.
    if (goal.fund?.billId) continue
    const date = goal.fund ? occurrenceFrom(goal.deadline!, goal.fund.repeat ?? 'yearly', range.start) : goal.deadline!
    if (inMonth(date)) add({ id: `goal-${goal.id}-${date}`, kind: goal.fund ? 'fund' : 'goal', date, name: goal.name, amount: goal.target, status: date < today ? 'late' : 'upcoming', recordId: goal.id })
  }

  for (const debt of live(data.debts).filter((d) => !d.archived)) {
    const owed = debtOwed(debt, data.transactions)
    if (debt.dueDate && inMonth(debt.dueDate) && owed > 0) {
      add({ id: `debt-${debt.id}`, kind: 'debt', date: debt.dueDate, name: debt.person, amount: owed, currency: debt.currency, status: debt.dueDate < today ? 'late' : 'upcoming', recordId: debt.id })
    }
    for (const date of instalmentDates(debt, range)) {
      const plan = debtPlan(debt, data.transactions, cycleOf(date))
      const paid = plan.planned > 0 && plan.unpaid === 0
      // Nothing left to pay: later instalments don't fall due.
      if (!paid && owed <= 0) continue
      add({ id: `instalment-${debt.id}-${date}`, kind: 'instalment', date, name: debt.person, amount: debt.monthlyPayment, currency: debt.currency, status: paid ? 'paid' : date < today ? 'late' : 'upcoming', recordId: debt.id })
    }
  }

  const list = [...days.values()]
  for (const day of list) {
    day.entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    day.events.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.name ?? '').localeCompare(b.name ?? ''))
  }
  return {
    month: range.start,
    days: list,
    spent: roundMoney(list.reduce((sum, d) => sum + d.spent, 0)),
    received: roundMoney(list.reduce((sum, d) => sum + d.received, 0)),
    busiestDay: Math.max(0, ...list.map((d) => d.spent)),
    billsDue,
    billsOpen,
    billsToPay,
  }
}

/** When a borrowed debt's instalments fall due in `range`: monthly, on the first payment's day. */
function instalmentDates(debt: Debt, range: { start: ISODate; end: ISODate }): ISODate[] {
  if (debt.direction !== 'borrowed' || !debt.monthlyPayment || !debt.firstPaymentDate) return []
  return billDueDates({ frequency: 'monthly', active: true, startDate: debt.firstPaymentDate, dueDay: fromISODate(debt.firstPaymentDate).getDate() }, range)
}

/** The days to draw for a month: whole weeks from `weekStartsOn` (0 = Sunday), `null` for days outside it. */
export function monthGrid(month: ISODate, weekStartsOn: number): (ISODate | null)[][] {
  const first = fromISODate(monthOf(month))
  const lead = (first.getDay() - weekStartsOn + 7) % 7
  const last = endOfMonth(first).getDate()
  const cells: (ISODate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: last }, (_, i) => toISODate(addDays(first, i)))]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (ISODate | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
