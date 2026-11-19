import { t } from '../../i18n'
import type { BudgetSummary } from '../../lib/budget'

/** What the first line of the sum is: the salary, or with irregular pay, an estimate or what came in. */
export function payLabel(summary: Pick<BudgetSummary, 'irregular' | 'onEstimate' | 'salary' | 'received'>): string {
  if (!summary.irregular) return t.breakdown.salary
  return summary.onEstimate && summary.salary > summary.received ? t.breakdown.estimate : t.breakdown.incomeSoFar
}

/** The sentence under what's left to spend. */
export function budgetNote(summary: Pick<BudgetSummary, 'waitingFor' | 'leftToSpend' | 'flexibleBudget' | 'salary' | 'otherIncome'>, money: (amount: number) => string): string {
  if (summary.waitingFor > 0) return t.income.waiting(money(summary.waitingFor), money(summary.leftToSpend + summary.waitingFor))
  if (summary.flexibleBudget > 0) return t.home.ofBudget(money(summary.flexibleBudget))
  return summary.salary + summary.otherIncome > 0 ? t.desk.noBudgetLeft : t.breakdown.nothingArrived
}

export function daysLeftText(summary: Pick<BudgetSummary, 'irregular' | 'progress'>): string {
  const days = summary.progress.daysLeft
  return summary.irregular ? t.home.daysLeftInMonth(days) : t.home.daysToPayday(days)
}
