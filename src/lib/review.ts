import type { AppData, ID, ISODate, PaySchedule } from '../types'
import { budgetSummary, categoryBudgets, leftShown, type BudgetData } from './budget'
import { inMainCurrency } from './currency'
import { getPayCycle, monthShare, previousCycle, type Cycle } from './dates'
import { categoryBreakdown, debtFlows, periodTotals, savingsRate } from './stats'

/** The pay cycle that ended most recently: the one before today's. */
export function lastEndedCycle(today: ISODate, salary: PaySchedule): Cycle {
  return previousCycle(getPayCycle(today, salary), salary)
}

/** Something worth changing after a cycle, with what to change it to. */
export type ReviewTip =
  /** It went over in this cycle and the one before: the limit may be too low to be real. */
  | { kind: 'raise-limit'; categoryId: ID; from: number; to: number }
  /** Under half used in this cycle and the one before: that money could go elsewhere. */
  | { kind: 'lower-limit'; categoryId: ID; from: number; to: number }
  /** Money was left at the end: it could go to a goal, dated on the cycle's last day. */
  | { kind: 'put-aside'; amount: number }
  /** It finished over: the category that went over by the most, if one did. */
  | { kind: 'over'; amount: number; categoryId?: ID }

export interface CategoryChange {
  categoryId: ID
  spent: number
  previous: number
  /** Positive when more was spent than the cycle before. */
  difference: number
}

export interface CycleReview {
  cycle: Cycle
  /** What was left at the end: negative when it went over. */
  left: number
  income: number
  spent: number
  saved: number
  savingsRate: number | null
  /** Limits that went over, by how much, biggest first. */
  over: { categoryId: ID; by: number }[]
  /** The biggest moves against the cycle before, up to three. */
  changes: CategoryChange[]
  tips: ReviewTip[]
}

type ReviewData = BudgetData & Pick<AppData, 'accounts'>

/** Rounded up to the next 500: a limit people can remember. */
const roundUp500 = (amount: number) => Math.ceil(amount / 500) * 500

/** A change is worth a line when it's at least this much, and a tenth of what it was. */
const MIN_CHANGE = 500

/**
 * How a pay cycle went, once it's over: what was left, the biggest changes against the cycle
 * before, and what could be adjusted. Numbers are the budget's own, measured on the last day.
 */
export function cycleReview(data: ReviewData, cycle: Cycle): CycleReview {
  const main = data.profile.currency
  const summary = budgetSummary(data, cycle.end, cycle)
  const before = previousCycle(cycle, data.profile.salary)
  const warn = data.settings.alerts.warnAtPercent
  const transactions = inMainCurrency(data.transactions, main)
  const totals = periodTotals(transactions, data.accounts, cycle)
  const left = leftShown(summary)

  const over = summary.categories
    .filter((c) => c.level === 'over' && c.remaining < 0)
    .map((c) => ({ categoryId: c.categoryId, by: -c.remaining }))
    .sort((a, b) => b.by - a.by)

  const changes = categoryBreakdown(transactions, cycle, before)
    .map((c) => ({ categoryId: c.categoryId, spent: c.spent, previous: c.previous, difference: Math.round(c.spent - c.previous) }))
    .filter((c) => c.previous > 0 && Math.abs(c.difference) >= Math.max(MIN_CHANGE, c.previous / 10))
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 3)

  const tips: ReviewTip[] = []
  if (left < 0) tips.push({ kind: 'over', amount: -left, categoryId: over[0]?.categoryId })
  // Limits are monthly; with weekly pay one week is too short to say a limit is wrong.
  if (monthShare(cycle) === 1) {
    const earlier = new Map(categoryBudgets(data.categories, transactions, before, warn).map((c) => [c.categoryId, c]))
    for (const now of summary.categories) {
      const then = earlier.get(now.categoryId)
      if (!then) continue
      if (now.level === 'over' && then.level === 'over') {
        const to = roundUp500((now.spent + then.spent) / 2)
        if (to > now.budget) tips.push({ kind: 'raise-limit', categoryId: now.categoryId, from: now.budget, to })
      } else if (now.budget >= 1_000 && now.ratio < 0.5 && then.ratio < 0.5) {
        const to = roundUp500(Math.max(now.spent, then.spent) * 1.1)
        // Nothing spent in either cycle says nothing about what the limit should be: a limit of 0 isn't a suggestion.
        if (to > 0 && to < now.budget) tips.push({ kind: 'lower-limit', categoryId: now.categoryId, from: now.budget, to })
      }
    }
  }
  if (left >= 1_000) tips.push({ kind: 'put-aside', amount: Math.floor(left / 100) * 100 })

  return {
    cycle,
    left,
    income: summary.income,
    spent: summary.spent,
    saved: summary.saved,
    savingsRate: savingsRate(totals, debtFlows(transactions, data.debts, cycle)),
    over,
    changes,
    tips,
  }
}
