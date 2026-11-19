import { t } from '../../i18n'
import { roundMoney } from '../../lib/money'
import type { ID } from '../../types'

/** One more category in a split purchase. The category picked above takes whatever these leave. */
export interface SplitLine {
  /** Saved already: keeps its record when edited. */
  id?: ID
  categoryId?: ID
  amount: number | null
}

/** What the first category is left with once the other parts are taken off the total. */
export function splitRest(total: number, lines: SplitLine[]): number {
  return roundMoney(total - lines.reduce((sum, line) => sum + (line.amount ?? 0), 0))
}

/** The message for a split that can't be saved yet, or `null`. */
export function splitProblem(total: number, firstCategory: ID | undefined, lines: SplitLine[]): string | null {
  const copy = t.refunds
  if (!firstCategory || lines.some((line) => !line.categoryId)) return copy.splitCategory
  if (lines.some((line) => !line.amount || line.amount <= 0)) return copy.splitAmount
  if (splitRest(total, lines) <= 0) return copy.splitTooMuch
  return null
}
