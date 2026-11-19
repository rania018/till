import { createStore } from 'zustand/vanilla'
import type { ID, ISODate, Transaction } from '../../types'

export type SheetMode = 'expense' | 'income' | 'goal' | 'transfer' | 'debt'

/** Starting values for a new transaction, e.g. "Take out" on a goal's page or "Buy it" in the calculator. */
export interface SheetPrefill {
  amount?: number
  categoryId?: ID
  note?: string
  /** In goal mode, the goal. In expense mode, the fund it's paid from. */
  goalId?: ID
  /** Goal mode only: take money out of the goal instead of putting it aside. */
  withdraw?: boolean
  /** Debt mode only: which debt this is about. Starts as a payment on it. */
  debtId?: ID
  /** Debt mode only: lending or borrowing more on `debtId`, instead of a payment. */
  grow?: boolean
  /** Runs once the new transaction is saved, e.g. to mark a wishlist item as bought. */
  onSaved?: (transaction: Transaction) => void
  /** The day it's for, e.g. a day picked in the calendar. Today otherwise. */
  date?: ISODate
  /** Expense mode: money back for this expense. Its category, wallet and bill carry over. */
  refundOf?: Transaction
  /** Expense and income: tags it starts with, e.g. from a tag's page. */
  tags?: string[]
}

interface SheetState {
  open: boolean
  mode: SheetMode
  editing?: Transaction
  prefill?: SheetPrefill
  /** Changes every time the sheet opens, so the form starts fresh. */
  session: number
}

/** One transaction sheet for the whole app; any screen can open it. */
export const transactionSheet = createStore<SheetState>(() => ({ open: false, mode: 'expense', session: 0 }))

export function openTransactionSheet(mode: SheetMode = 'expense', prefill?: SheetPrefill): void {
  transactionSheet.setState((s) => ({ open: true, mode, editing: undefined, prefill, session: s.session + 1 }))
}

export function editTransaction(transaction: Transaction): void {
  const mode: SheetMode =
    transaction.type === 'goal-deposit' || transaction.type === 'goal-withdrawal'
      ? 'goal'
      : transaction.type === 'debt-in' || transaction.type === 'debt-out'
        ? 'debt'
        : // Money back for a purchase is edited where purchases are.
          transaction.type === 'refund'
          ? 'expense'
          : transaction.type
  transactionSheet.setState((s) => ({ open: true, mode, editing: transaction, prefill: undefined, session: s.session + 1 }))
}

export function closeTransactionSheet(): void {
  // Keep mode and editing so the closing animation still shows the same form.
  transactionSheet.setState({ open: false })
}
