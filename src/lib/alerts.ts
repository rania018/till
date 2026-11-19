import { differenceInCalendarDays } from 'date-fns'
import type { AppData, DebtDirection, ID, ISODate } from '../types'
import { cycleBills } from './bills'
import { budgetSummary, type BudgetSummary } from './budget'
import { debtViews } from './debts'
import { fromISODate, hasPaydays, isShortPay, planMonth, todayISO } from './dates'
import { live } from './id'
import { wishlistReady } from './worthIt'

/** Days between cash counts before Home suggests counting again. */
export const CASH_CHECK_DAYS = 7

export type AlertTone = 'crit' | 'warn' | 'info'

/** Something on Home that needs attention. `id` is stable while the cause lasts. */
export type Alert = { id: string; tone: AlertTone } & (
  | { kind: 'category-over'; categoryId: ID; overBy: number }
  | { kind: 'category-near'; categoryId: ID; percent: number }
  | { kind: 'budget-over'; overBy: number }
  | { kind: 'budget-near'; percent: number }
  | { kind: 'too-fast'; usedPercent: number; elapsedPercent: number }
  | { kind: 'bill-overdue' | 'bill-due'; billId: ID; dueDate: ISODate; amount: number }
  | { kind: 'debt-overdue' | 'debt-due'; debtId: ID; person: string; direction: DebtDirection; dueDate: ISODate; amount: number; currency?: string }
  /** `daysSince` is `null` when the cash was never counted. */
  | { kind: 'cash-check'; accountId: ID; daysSince: number | null }
  /** Wishlist items whose cooling-off time is up; `name` is the first one's. */
  | { kind: 'wishlist-ready'; count: number; name: string }
  /** Weekly or biweekly pay saved before it had a date, so its cycles can't start yet. */
  | { kind: 'set-payday' }
)

/** Most urgent first: a late bill can cost a fee, then the whole budget, then single categories. */
const PRIORITY: Record<Alert['kind'], number> = {
  'bill-overdue': 0,
  'debt-overdue': 1,
  'budget-over': 2,
  'category-over': 3,
  'budget-near': 4,
  'category-near': 5,
  'too-fast': 6,
  'bill-due': 7,
  'debt-due': 8,
  'cash-check': 9,
  'wishlist-ready': 10,
  'set-payday': 11,
}

/** Budget alerts for a pay cycle's summary: over and near limits, and spending ahead of pace. */
export function budgetAlerts(summary: BudgetSummary, warnAtPercent: number): Alert[] {
  const alerts: Alert[] = []
  for (const c of summary.categories) {
    if (c.level === 'over') alerts.push({ id: `over-${c.categoryId}`, tone: 'crit', kind: 'category-over', categoryId: c.categoryId, overBy: -c.remaining })
    else if (c.level === 'warning') alerts.push({ id: `near-${c.categoryId}`, tone: 'warn', kind: 'category-near', categoryId: c.categoryId, percent: Math.round(c.ratio * 100) })
  }
  // With pay on its way the budget isn't complete yet, so being "over" it would say nothing.
  if (summary.flexibleBudget > 0 && summary.waitingFor === 0) {
    const percent = Math.round(summary.usedRatio * 100)
    if (summary.leftToSpend < 0) alerts.push({ id: 'budget-over', tone: 'crit', kind: 'budget-over', overBy: -summary.leftToSpend })
    else if (percent >= warnAtPercent) alerts.push({ id: 'budget-near', tone: 'warn', kind: 'budget-near', percent })
    // Already near or over the whole budget says more than "too fast".
    else if (summary.spendingTooFast) {
      alerts.push({ id: 'too-fast', tone: 'warn', kind: 'too-fast', usedPercent: percent, elapsedPercent: Math.round(summary.progress.elapsedRatio * 100) })
    }
  }
  return alerts
}

/**
 * Budget alerts that adding or changing an expense just caused: a limit newly
 * reached or passed. Pace is left out; it's a trend, not something one expense crosses.
 */
export function newBudgetAlerts(before: BudgetSummary, after: BudgetSummary, warnAtPercent: number): Alert[] {
  const seen = new Set(budgetAlerts(before, warnAtPercent).map((a) => a.id))
  return budgetAlerts(after, warnAtPercent)
    .filter((a) => a.kind !== 'too-fast' && !seen.has(a.id))
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])
}

/** A single expense big enough to stop and look at its hours of work. */
export function isBigPurchase(amount: number, monthlySalary: number, bigPurchasePercent: number): boolean {
  return monthlySalary > 0 && amount >= (monthlySalary * bigPurchasePercent) / 100
}

/**
 * Everything Home should point out today, most urgent first. Budget alerts and the
 * cash check can be switched off in Settings; bills and debts due soon or overdue always show.
 */
export function homeAlerts(
  data: Pick<AppData, 'profile' | 'settings' | 'categories' | 'transactions' | 'bills' | 'goals' | 'debts' | 'incomes' | 'accounts' | 'wishlist'>,
  today: ISODate,
  now: Date = new Date(),
): Alert[] {
  const summary = budgetSummary(data, today)
  const alerts = data.settings.alerts.enabled ? budgetAlerts(summary, data.settings.alerts.warnAtPercent) : []

  const month = planMonth(today, data.profile.salary)
  for (const { bill, occurrence } of cycleBills(data.bills, month, data.transactions, today).due) {
    if (occurrence.status !== 'overdue' && occurrence.status !== 'due-soon') continue
    const overdue = occurrence.status === 'overdue'
    alerts.push({
      id: `bill-${bill.id}-${occurrence.dueDate}`,
      tone: overdue ? 'crit' : 'info',
      kind: overdue ? 'bill-overdue' : 'bill-due',
      billId: bill.id,
      dueDate: occurrence.dueDate,
      amount: bill.amount,
    })
  }
  for (const { debt, status, nextDate, nextAmount } of debtViews(data.debts, data.transactions, month, today)) {
    if ((status !== 'overdue' && status !== 'due-soon') || !nextDate || nextAmount === undefined) continue
    const overdue = status === 'overdue'
    alerts.push({
      id: `debt-${debt.id}-${nextDate}`,
      // Late on money you owe can cost you; someone late paying you back is only worth a look.
      tone: overdue ? (debt.direction === 'borrowed' ? 'crit' : 'warn') : 'info',
      kind: overdue ? 'debt-overdue' : 'debt-due',
      debtId: debt.id,
      person: debt.person,
      direction: debt.direction,
      dueDate: nextDate,
      amount: nextAmount,
      currency: debt.currency,
    })
  }
  if (data.settings.cashCheck.enabled) {
    for (const account of live(data.accounts).filter((a) => a.kind === 'cash' && !a.archived)) {
      const counted = account.lastCountedAt ? todayISO(new Date(account.lastCountedAt)) : null
      const days = differenceInCalendarDays(fromISODate(today), fromISODate(counted ?? account.startDate))
      if (days >= CASH_CHECK_DAYS) alerts.push({ id: `cash-${account.id}`, tone: 'info', kind: 'cash-check', accountId: account.id, daysSince: counted ? days : null })
    }
  }

  const ready = wishlistReady(data.wishlist, now)
  if (ready.length > 0) alerts.push({ id: 'wishlist-ready', tone: 'info', kind: 'wishlist-ready', count: ready.length, name: ready[0].name })
  if (isShortPay(data.profile.salary) && !hasPaydays(data.profile.salary)) alerts.push({ id: 'set-payday', tone: 'info', kind: 'set-payday' })

  // Array sort is stable, so alerts of one kind keep their order (categories in display order, bills by due date).
  return alerts.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])
}
