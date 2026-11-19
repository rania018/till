import { describe, expect, it } from 'vitest'
import type { Debt, Transaction } from '../types'
import { debtBalances, debtFlows, keptAfterDebts, savingsRate } from './stats'

const RANGE = { start: '2026-10-25', end: '2026-11-24' }
const stamp = { createdAt: '', updatedAt: '' }

const debt = (id: string, direction: Debt['direction'], startingAmount: number, overrides: Partial<Debt> = {}): Debt => ({ id, ...stamp, direction, person: id, startingAmount, date: '2026-01-01', archived: false, ...overrides }) as Debt
const move = (debtId: string, type: 'debt-in' | 'debt-out', amount: number, date = '2026-11-01'): Transaction => ({ id: `${debtId}-${amount}-${date}`, ...stamp, type, amount, date, accountId: 'acc-bank', debtId }) as Transaction

const iBorrowed = debt('bank', 'borrowed', 0)
const iLent = debt('sami', 'lent', 0)
const debts = [iBorrowed, iLent]

describe('debtFlows', () => {
  it('tells apart the four ways money moves through debts', () => {
    const flows = debtFlows([move('bank', 'debt-in', 50_000), move('bank', 'debt-out', 10_000), move('sami', 'debt-out', 7_000), move('sami', 'debt-in', 3_000)], debts, RANGE)
    expect(flows).toEqual({ borrowed: 50_000, repaid: 10_000, lent: 7_000, repaidToYou: 3_000 })
  })

  it('counts only this period, and not deleted moves', () => {
    const outside = move('bank', 'debt-out', 1_000, '2026-10-24')
    const deleted = { ...move('bank', 'debt-out', 2_000), deleted: true } as Transaction
    expect(debtFlows([outside, deleted], debts, RANGE).repaid).toBe(0)
  })
})

describe('keeping money after debts', () => {
  const totals = { income: 100_000, spent: 56_000 }

  it('takes off what was repaid or lent, and adds back what was repaid to you', () => {
    expect(keptAfterDebts(totals, { borrowed: 0, repaid: 10_000, lent: 4_000, repaidToYou: 1_000 })).toBe(31_000)
  })

  it('never counts borrowed money as kept: spending it is just overspending', () => {
    const borrowed = { borrowed: 50_000, repaid: 0, lent: 0, repaidToYou: 0 }
    expect(keptAfterDebts(totals, borrowed)).toBe(44_000)
    expect(savingsRate(totals, borrowed)).toBeCloseTo(0.44, 5)
    expect(savingsRate({ income: 100_000, spent: 150_000 }, borrowed)).toBeCloseTo(-0.5, 5)
  })

  it('a repayment lowers the rate', () => {
    expect(savingsRate(totals, { borrowed: 0, repaid: 10_000, lent: 0, repaidToYou: 0 })).toBeCloseTo(0.34, 5)
  })

  it('has no rate without income', () => {
    expect(savingsRate({ income: 0, spent: 100 })).toBeNull()
  })
})

describe('debtBalances', () => {
  const cycles = [
    { start: '2026-09-25', end: '2026-10-24' },
    { start: '2026-10-25', end: '2026-11-24' },
  ]

  it('follows each debt down as it is repaid', () => {
    const loan = debt('loan', 'borrowed', 30_000, { date: '2026-09-01' })
    const repayments = [move('loan', 'debt-out', 10_000, '2026-10-10'), move('loan', 'debt-out', 5_000, '2026-11-01')]
    expect(debtBalances([loan], repayments, cycles, 'DZD', '2026-11-05').map((b) => b.owed)).toEqual([20_000, 15_000])
  })

  it('leaves out a debt before it began', () => {
    const later = debt('later', 'lent', 8_000, { date: '2026-11-01' })
    expect(debtBalances([later], [], cycles, 'DZD', '2026-11-05').map((b) => b.owedToYou)).toEqual([0, 8_000])
  })

  it("doesn't look past today in the cycle still running", () => {
    const loan = debt('loan', 'borrowed', 30_000, { date: '2026-09-01' })
    const future = [move('loan', 'debt-out', 10_000, '2026-11-20')]
    expect(debtBalances([loan], future, cycles, 'DZD', '2026-11-05')[1].owed).toBe(30_000)
  })

  it('adds up only the main currency', () => {
    const usd = debt('usd', 'borrowed', 100, { currency: 'USD' })
    expect(debtBalances([usd], [], cycles, 'DZD', '2026-11-05').map((b) => b.owed)).toEqual([0, 0])
  })
})
