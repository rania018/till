import type { Account, AppData, ISODate, Transaction, TransactionType } from '../types'
import { walletPart } from './funds'
import { live } from './id'
import { roundMoney } from './money'

/**
 * Money in a wallet: its starting balance plus everything logged since its
 * start date (up to `upTo` if given). Older transactions are already part of
 * the starting balance.
 */
export function walletBalance(account: Account, transactions: Transaction[], upTo?: ISODate): number {
  let balance = account.startingBalance
  for (const t of live(transactions)) {
    if (t.date < account.startDate || (upTo && t.date > upTo)) continue
    // What a fund paid of an expense was already out of the wallet, since it was put aside.
    if (t.accountId === account.id) balance += t.type === 'income' || t.type === 'refund' || t.type === 'goal-withdrawal' || t.type === 'debt-in' ? t.amount : -walletPart(t)
    if (t.type === 'transfer' && t.toAccountId === account.id) balance += t.toAmount ?? t.amount
  }
  return roundMoney(balance)
}

export type WalletCloseProblem =
  | { reason: 'not-empty'; balance: number }
  | { reason: 'receives-salary' }
  | { reason: 'pays-bills'; count: number }
  | { reason: 'receives-income'; count: number }
  | { reason: 'last-open' }

/**
 * Why this wallet can't close, or `null` if it can. Only an empty wallet closes, so
 * money can't vanish from the totals, and nothing may still depend on it.
 */
export function walletCloseProblem(account: Account, data: Pick<AppData, 'accounts' | 'transactions' | 'bills' | 'profile' | 'incomes'>): WalletCloseProblem | null {
  if (live(data.accounts).filter((a) => !a.archived).length <= 1) return { reason: 'last-open' }
  if (data.profile.salary.accountId === account.id) return { reason: 'receives-salary' }
  const bills = live(data.bills).filter((b) => b.active && b.accountId === account.id).length
  if (bills > 0) return { reason: 'pays-bills', count: bills }
  const incomes = live(data.incomes).filter((s) => s.accountId === account.id).length
  if (incomes > 0) return { reason: 'receives-income', count: incomes }
  const balance = walletBalance(account, data.transactions)
  if (balance !== 0) return { reason: 'not-empty', balance }
  return null
}

/** Whether anything refers to this wallet, including deleted entries that Undo could bring back. */
export function walletWasUsed(account: Account, data: Pick<AppData, 'transactions' | 'bills'>): boolean {
  return (
    account.startingBalance !== 0 ||
    data.transactions.some((t) => t.accountId === account.id || t.toAccountId === account.id) ||
    data.bills.some((b) => b.accountId === account.id)
  )
}

/**
 * What to log when a cash count doesn't match: missing money becomes untracked
 * spending, extra money becomes income. `null` when the count matches.
 */
export function cashCountAdjustment(expected: number, counted: number): { type: Extract<TransactionType, 'expense' | 'income'>; amount: number } | null {
  const difference = roundMoney(expected - counted)
  if (difference === 0) return null
  return difference > 0 ? { type: 'expense', amount: difference } : { type: 'income', amount: -difference }
}
