import type { BudgetSummary } from './budget'

/**
 * Where the cycle is heading at today's pace: everyday spending so far, carried on at the same
 * rate per day to the end. Bills, goals and instalments are already in the budget, so only
 * everyday spending moves the forecast.
 */
export interface CycleForecast {
  /** Everyday spending by the last day, at this pace. */
  spent: number
  /** What will be left on the last day, rounded to 100: negative when it heads over. */
  left: number
}

/** A forecast only means something after a few days: one big shop on day one isn't a pace. */
const MIN_DAYS = 5

/**
 * `null` when there's nothing to forecast: no budget yet, pay still on its way, too early in the
 * cycle, or the last day already (what's left is what's left). Rounded to 100 so it reads as the
 * estimate it is.
 */
export function cycleForecast(summary: Pick<BudgetSummary, 'progress' | 'cycle' | 'flexibleSpent' | 'flexibleBudget' | 'waitingFor' | 'hasPay'>): CycleForecast | null {
  const { progress, cycle, flexibleSpent, flexibleBudget } = summary
  if (!summary.hasPay || summary.waitingFor > 0 || flexibleBudget <= 0) return null
  if (progress.daysLeft <= 1 || progress.dayNumber < Math.min(MIN_DAYS, Math.ceil(cycle.days / 4))) return null
  // Today counts as gone, as it does for the pace mark: its spending is in already.
  const perDay = flexibleSpent / progress.dayNumber
  const spent = Math.round(flexibleSpent + perDay * (progress.daysLeft - 1))
  return { spent, left: Math.round((flexibleBudget - spent) / 100) * 100 }
}
