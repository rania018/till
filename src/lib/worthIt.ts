import type { AppData, Goal, ID, ISODate, ISODateTime, WishlistItem } from '../types'
import { totalMonthlyBills } from './bills'
import { categoryBudgets } from './budget'
import { getPayCycle, planMonth } from './dates'
import { goalViews, purchaseDelayDays } from './goals'
import { live } from './id'
import { roundMoney } from './money'
import { hourlyRate, monthlySalary, workTimeFor, type WorkTime } from './workHours'

export type BudgetImpact =
  /** The category is already at or over its limit. */
  | { kind: 'already-over'; overBy: number }
  /** This purchase would take it over. */
  | { kind: 'goes-over'; overBy: number }
  /** It fits; `share` is the part of what's left that it uses. */
  | { kind: 'fits'; remaining: number; share: number }

export interface WorthItCheck {
  /** `null` until salary and working hours are set. */
  work: WorkTime | null
  /** Share of the monthly salary, 0–1; `null` without a salary. */
  salaryShare: number | null
  /** Against the category's limit this pay cycle; `null` without a category or a limit. */
  budget: BudgetImpact | null
  /** How long it pushes back a goal you're actively saving for. */
  goal: { goal: Goal; days: number } | null
}

/**
 * The goal a purchase competes with: an active one you put money into each month,
 * the one with the nearest deadline first, otherwise the oldest.
 */
function goalAtStake(data: Pick<AppData, 'goals' | 'transactions' | 'profile'>, today: ISODate): Goal | null {
  const cycle = planMonth(today, data.profile.salary)
  const candidates = goalViews(data.goals, data.transactions, cycle, today, data.profile.salary)
    // A fund is for a cost that comes anyway: a purchase doesn't push it back.
    .filter((v) => !v.goal.fund && v.status !== 'reached' && v.goal.monthlyContribution > 0)
    .map((v) => v.goal)
  const withDeadline = candidates.filter((g) => g.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!))
  return withDeadline[0] ?? candidates[0] ?? null
}

/** Everything "Is it worth it?" says about a price. */
export function worthItCheck(
  price: number,
  categoryId: ID | undefined,
  data: Pick<AppData, 'profile' | 'settings' | 'bills' | 'categories' | 'transactions' | 'goals'>,
  today: ISODate,
): WorthItCheck {
  const rate = hourlyRate(data.profile, totalMonthlyBills(data.bills))
  const salary = monthlySalary(data.profile.salary)

  let budget: BudgetImpact | null = null
  const row = categoryId
    ? categoryBudgets(data.categories, data.transactions, getPayCycle(today, data.profile.salary), data.settings.alerts.warnAtPercent).find(
        (c) => c.categoryId === categoryId,
      )
    : undefined
  if (row) {
    if (row.remaining <= 0) budget = { kind: 'already-over', overBy: -row.remaining }
    else if (price > row.remaining) budget = { kind: 'goes-over', overBy: roundMoney(price - row.remaining) }
    else budget = { kind: 'fits', remaining: row.remaining, share: price / row.remaining }
  }

  const goal = goalAtStake(data, today)
  const days = goal ? purchaseDelayDays(price, goal.monthlyContribution) : null

  return {
    work: rate ? workTimeFor(price, rate, data.profile.work.hoursPerDay) : null,
    salaryShare: salary > 0 ? price / salary : null,
    budget,
    goal: goal && days ? { goal, days } : null,
  }
}

/** When to ask again about a wishlist item. */
export function remindAt(now: Date, coolingOffHours: number): ISODateTime {
  return new Date(now.getTime() + coolingOffHours * 3_600_000).toISOString()
}

/** Wishlist items still being thought over whose cooling-off time is up, oldest first. */
export function wishlistReady(wishlist: WishlistItem[], now: Date): WishlistItem[] {
  const moment = now.toISOString()
  return live(wishlist)
    .filter((w) => w.status === 'thinking' && w.remindAt && w.remindAt <= moment)
    .sort((a, b) => (a.remindAt ?? '').localeCompare(b.remindAt ?? ''))
}
