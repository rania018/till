import { describe, expect, it } from 'vitest'
import { createInitialData } from '../store/defaults'
import type { AppData, Transaction } from '../types'
import { budgetSummary, spentByCategory } from './budget'
import { calendarMonth } from './calendar'
import { otherCurrencyTotals } from './currency'
import { categoryBreakdown, periodTotals } from './stats'
import { filterTransactions, groupByDay, totals } from './transactions'
import { checkTransaction } from './validation'
import { walletBalance } from './wallets'

const TODAY = '2026-11-15'
const CYCLE = { start: '2026-10-25', end: '2026-11-24' }

function tx(fields: Partial<Transaction>, i: number): Transaction {
  return { id: `t${i}`, createdAt: `2026-11-0${(i % 9) + 1}T10:00:00.000Z`, updatedAt: '', type: 'expense', amount: 0, date: TODAY, accountId: 'acc-cash', categoryId: 'cat-shopping', ...fields }
}

/** 60,000 DA on the 25th, arrived; a 5,000 DA limit on Shopping. */
function data(entries: Partial<Transaction>[]): AppData {
  const d = createInitialData(new Date(2026, 9, 1))
  d.profile.salary = { ...d.profile.salary, amount: 60_000, payday: 25 }
  d.profile.startDate = '2026-10-01'
  d.categories = d.categories.map((c) => (c.id === 'cat-shopping' ? { ...c, monthlyBudget: 5_000 } : c))
  d.transactions = [{ id: 'salary-2026-10-25', type: 'income', amount: 60_000, date: '2026-10-25', categoryId: 'inc-salary', source: 'salary', accountId: 'acc-bank' } as Partial<Transaction>, ...entries].map(tx)
  return d
}

const shoes = { id: 'shoes', amount: 8_000, date: '2026-11-02', note: 'Shoes' }

describe('a refund', () => {
  const d = data([shoes, { id: 'back', type: 'refund', amount: 3_000, refundOf: 'shoes' }])

  it('takes back spending in its category, and is never income', () => {
    const summary = budgetSummary(d, TODAY)
    expect(summary.spent).toBe(5_000)
    expect(summary.flexibleSpent).toBe(5_000)
    expect(summary.income).toBe(60_000)
    expect(summary.categories.find((c) => c.categoryId === 'cat-shopping')).toMatchObject({ spent: 5_000, remaining: 0 })
    expect(spentByCategory(d.transactions, CYCLE).get('cat-shopping')).toBe(5_000)
  })

  it('arrives in its wallet', () => {
    const cash = d.accounts.find((a) => a.id === 'acc-cash')!
    expect(walletBalance({ ...cash, startingBalance: 10_000, startDate: '2026-10-01' }, d.transactions)).toBe(5_000)
  })

  it('counts against spending everywhere: Stats, Activity and the calendar', () => {
    expect(periodTotals(d.transactions, d.accounts, CYCLE)).toMatchObject({ spent: 5_000, flexible: 5_000, cash: 5_000, income: 60_000 })
    expect(categoryBreakdown(d.transactions, CYCLE, { start: '2026-09-25', end: '2026-10-24' })).toEqual([expect.objectContaining({ categoryId: 'cat-shopping', spent: 5_000, share: 1 })])
    expect(totals(d.transactions)).toEqual({ spent: 5_000, received: 60_000 })
    expect(groupByDay(filterTransactions(d.transactions, { range: CYCLE }, { categories: [], accounts: [], goals: [], debts: [] })).find((g) => g.date === TODAY)!.spent).toBe(-3_000)
    expect(calendarMonth(d, TODAY, TODAY).spent).toBe(5_000)
    // The Expenses filter shows money back with what was spent.
    expect(filterTransactions(d.transactions, { kind: 'expense' }, { categories: [], accounts: [], goals: [], debts: [] }).map((t) => t.id)).toEqual(['back', 'shoes'])
  })

  it('never shows a category below nothing, when it outweighs this cycle’s spending', () => {
    const lastMonth = data([{ ...shoes, date: '2026-10-10' }, { id: 'back', type: 'refund', amount: 8_000, refundOf: 'shoes' }])
    const summary = budgetSummary(lastMonth, TODAY)
    expect(summary.categories.find((c) => c.categoryId === 'cat-shopping')!.spent).toBe(0)
    expect(categoryBreakdown(lastMonth.transactions, CYCLE, CYCLE)).toEqual([])
  })

  it('comes off bills when it’s money back for a bill payment', () => {
    const bill = data([
      { id: 'pay', amount: 2_000, billId: 'net', categoryId: 'cat-bills', accountId: 'acc-bank' },
      { id: 'back', type: 'refund', amount: 500, refundOf: 'pay', billId: 'net', categoryId: 'cat-bills', accountId: 'acc-bank' },
    ])
    bill.bills = [{ id: 'net', createdAt: '', updatedAt: '', name: 'Internet', amount: 2_000, categoryId: 'cat-bills', accountId: 'acc-bank', frequency: 'monthly', dueDay: 15, startDate: '2026-01-01', active: true }]
    const summary = budgetSummary(bill, TODAY)
    expect(summary.billsReserved).toBe(1_500)
    expect(summary.flexibleSpent).toBe(0)
    expect(periodTotals(bill.transactions, bill.accounts, CYCLE).fixed).toBe(1_500)
  })

  it('in another currency only lowers that currency’s spending', () => {
    const usd = data([
      { id: 'a', amount: 50, currency: 'USD' },
      { id: 'b', type: 'refund', amount: 20, currency: 'USD' },
    ])
    expect(otherCurrencyTotals(usd.transactions, CYCLE, 'DZD')).toEqual([{ currency: 'USD', spent: 30, received: 0 }])
  })

  it('can’t give back more than the purchase, counting earlier refunds', () => {
    const base = { type: 'refund' as const, date: TODAY, accountId: 'acc-cash', categoryId: 'cat-shopping', refundOf: 'shoes' }
    expect(checkTransaction({ ...base, amount: 5_000 }, d)).toBeNull()
    expect(checkTransaction({ ...base, amount: 5_001 }, d)).toBe('Only 5,000 DA of that purchase is still to come back.')
    // Editing the one already there: its own amount is counted back.
    expect(checkTransaction({ ...base, id: 'back', amount: 8_000 }, d)).toBeNull()
    expect(checkTransaction({ ...base, amount: 100, refundOf: 'nope' }, d)).toBe('The purchase this money is for no longer exists.')
    expect(checkTransaction({ ...base, amount: 100, categoryId: 'inc-salary' }, d)).toBe('Pick an expense category.')
    const full = data([shoes, { id: 'back', type: 'refund', amount: 8_000, refundOf: 'shoes' }])
    expect(checkTransaction({ ...base, amount: 1 }, full)).toBe('That purchase has already been refunded in full.')
  })
})
