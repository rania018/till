import type { Transaction } from '../types'

/**
 * Spending, with refunds taken off. A refund is money back for something bought: it lowers the
 * spending of its category, and of its bill when it was a bill payment, and it's never income.
 * Every total of what was spent goes through `spentAmount`, so none of them can forget it.
 */

/** An expense or a refund: what makes up spending. */
export function isSpending(t: Pick<Transaction, 'type'>): boolean {
  return t.type === 'expense' || t.type === 'refund'
}

/** What an entry adds to spending: an expense its amount, a refund takes its amount back, anything else nothing. */
export function spentAmount(t: Pick<Transaction, 'type' | 'amount'>): number {
  return t.type === 'expense' ? t.amount : t.type === 'refund' ? -t.amount : 0
}
