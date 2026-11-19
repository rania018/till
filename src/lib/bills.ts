import { addDays, addMonths, addYears, differenceInCalendarDays, getDaysInMonth, startOfMonth } from 'date-fns'
import type { Bill, ID, ISODate, Transaction } from '../types'
import { fromISODate, isWithin, toISODate, type Cycle } from './dates'
import { live } from './id'
import { roundMoney, sumAmounts } from './money'

/** What a bill costs per month on average (quarterly ÷ 3, yearly ÷ 12, weekly × 52/12). */
export function billMonthlyCost(bill: Pick<Bill, 'amount' | 'frequency'>): number {
  switch (bill.frequency) {
    case 'weekly':
      return roundMoney((bill.amount * 52) / 12)
    case 'monthly':
      return bill.amount
    case 'quarterly':
      return roundMoney(bill.amount / 3)
    case 'yearly':
      return roundMoney(bill.amount / 12)
  }
}

export function totalMonthlyBills(bills: Bill[]): number {
  return sumAmounts(live(bills).filter((b) => b.active).map(billMonthlyCost))
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

/** Every date in `range` the bill falls due, oldest first. */
export function billDueDates(bill: Pick<Bill, 'frequency' | 'dueDay' | 'startDate' | 'active' | 'deleted'>, range: { start: ISODate; end: ISODate }): ISODate[] {
  if (bill.deleted || !bill.active) return []
  const from = range.start > bill.startDate ? range.start : bill.startDate
  if (from > range.end) return []
  const dates: ISODate[] = []

  if (bill.frequency === 'weekly') {
    for (let day = fromISODate(from); toISODate(day) <= range.end; day = addDays(day, 1)) {
      if (day.getDay() === bill.dueDay) dates.push(toISODate(day))
    }
    return dates
  }

  const billStart = fromISODate(bill.startDate)
  for (let month = startOfMonth(fromISODate(from)); toISODate(month) <= range.end; month = addMonths(month, 1)) {
    const offset = monthsBetween(billStart, month)
    if (bill.frequency === 'quarterly' && offset % 3 !== 0) continue
    if (bill.frequency === 'yearly' && offset % 12 !== 0) continue
    const due = toISODate(new Date(month.getFullYear(), month.getMonth(), Math.min(bill.dueDay, getDaysInMonth(month))))
    if (due >= from && due <= range.end) dates.push(due)
  }
  return dates
}

export type BillStatus = 'paid' | 'overdue' | 'due-soon' | 'upcoming'

export interface BillOccurrence {
  billId: ID
  dueDate: ISODate
  status: BillStatus
  paymentId?: ID
}

/**
 * Each time the bill is due in this cycle and whether it's paid. Payments are
 * expenses linked to the bill, matched to due dates in order.
 */
export function billOccurrences(
  bill: Bill,
  cycle: Cycle,
  transactions: Transaction[],
  today: ISODate,
  dueSoonDays = 3,
): BillOccurrence[] {
  const payments = live(transactions)
    .filter((t) => t.type === 'expense' && t.billId === bill.id && isWithin(t.date, cycle))
    .sort((a, b) => a.date.localeCompare(b.date))

  return billDueDates(bill, cycle).map((dueDate, i) => {
    const payment = payments[i]
    if (payment) return { billId: bill.id, dueDate, status: 'paid', paymentId: payment.id }
    const daysUntil = differenceInCalendarDays(fromISODate(dueDate), fromISODate(today))
    const status: BillStatus = daysUntil < 0 ? 'overdue' : daysUntil <= dueSoonDays ? 'due-soon' : 'upcoming'
    return { billId: bill.id, dueDate, status }
  })
}

export interface CycleBill {
  bill: Bill
  occurrence: BillOccurrence
}

export interface CycleBills {
  /** Every time a bill is due this cycle: overdue first, then due soon, upcoming, and paid last. */
  due: CycleBill[]
  /** Bills with no due date this cycle (e.g. quarterly), with their next one. */
  notDue: { bill: Bill; nextDue: ISODate | null }[]
  /** What the bills due this cycle should cost. */
  planned: number
  /** What was actually paid for them. */
  paid: number
}

const STATUS_ORDER: Record<BillStatus, number> = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 }

/**
 * Bills to pick from when logging an expense: the ones due this cycle first
 * (still unpaid before paid), then the rest. Each bill once; `paid` means
 * every due date this cycle already has a payment.
 */
export function billChoices(bills: Bill[], cycle: Cycle, transactions: Transaction[], today: ISODate): { bill: Bill; paid: boolean }[] {
  const { due, notDue } = cycleBills(bills, cycle, transactions, today)
  const seen = new Set<ID>()
  const choices: { bill: Bill; paid: boolean }[] = []
  // `due` is ordered unpaid first, so the first time a bill appears says whether anything is still open.
  for (const { bill, occurrence } of due) {
    if (seen.has(bill.id)) continue
    seen.add(bill.id)
    choices.push({ bill, paid: occurrence.status === 'paid' })
  }
  for (const { bill } of notDue) {
    if (seen.has(bill.id)) continue
    seen.add(bill.id)
    choices.push({ bill, paid: false })
  }
  return choices
}

/** The bills screen for one pay cycle. */
export function cycleBills(bills: Bill[], cycle: Cycle, transactions: Transaction[], today: ISODate): CycleBills {
  const due: CycleBill[] = []
  const notDue: CycleBills['notDue'] = []
  const afterCycle = toISODate(addDays(fromISODate(cycle.end), 1))
  const horizon = toISODate(addYears(fromISODate(afterCycle), 2))

  for (const bill of live(bills).filter((b) => b.active)) {
    const occurrences = billOccurrences(bill, cycle, transactions, today)
    if (occurrences.length === 0) notDue.push({ bill, nextDue: billDueDates(bill, { start: afterCycle, end: horizon })[0] ?? null })
    for (const occurrence of occurrences) due.push({ bill, occurrence })
  }

  due.sort(
    (a, b) =>
      STATUS_ORDER[a.occurrence.status] - STATUS_ORDER[b.occurrence.status] ||
      a.occurrence.dueDate.localeCompare(b.occurrence.dueDate) ||
      a.bill.name.localeCompare(b.bill.name),
  )
  notDue.sort((a, b) => (a.nextDue ?? '9999').localeCompare(b.nextDue ?? '9999'))

  const paymentAmount = new Map(transactions.map((t) => [t.id, t.amount]))
  return {
    due,
    notDue,
    planned: sumAmounts(due.map((d) => d.bill.amount)),
    paid: sumAmounts(due.map((d) => (d.occurrence.paymentId ? (paymentAmount.get(d.occurrence.paymentId) ?? 0) : 0))),
  }
}
