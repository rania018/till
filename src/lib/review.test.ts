import { describe, expect, it } from 'vitest'
import { createInitialData } from '../store/defaults'
import type { AppData, Transaction } from '../types'
import { budgetSummary } from './budget'
import { cycleForecast } from './forecast'
import { cycleReview, lastEndedCycle } from './review'
import { reportYears, yearReport } from './yearReport'

/** 60,000 DA on the 25th; limits on Eating out (5,000) and Shopping (10,000). */
function data(entries: Partial<Transaction>[]): AppData {
  const d = createInitialData(new Date(2026, 6, 1))
  d.profile.salary = { ...d.profile.salary, amount: 60_000, payday: 25 }
  d.profile.startDate = '2026-07-01'
  d.categories = d.categories.map((c) => (c.id === 'cat-eating-out' ? { ...c, monthlyBudget: 5_000 } : c.id === 'cat-shopping' ? { ...c, monthlyBudget: 10_000 } : c))
  const pay = (date: string): Partial<Transaction> => ({ id: `salary-${date}`, type: 'income', amount: 60_000, date, categoryId: 'inc-salary', source: 'salary', accountId: 'acc-bank' })
  d.transactions = [pay('2026-08-25'), pay('2026-09-25'), pay('2026-10-25'), ...entries].map((t, i) => ({
    id: `t${i}`,
    createdAt: `2026-10-01T10:00:${String(i % 60).padStart(2, '0')}.000Z`,
    updatedAt: '',
    type: 'expense',
    amount: 0,
    date: '2026-10-01',
    accountId: 'acc-cash',
    categoryId: 'cat-groceries',
    ...t,
  }))
  return d
}

describe('the forecast', () => {
  it('carries on at this pace to the end of the cycle', () => {
    // 25 Oct – 24 Nov, 31 days. By 4 Nov (day 11): 22,000 spent, 2,000 a day; 20 days to go after today.
    const d = data([{ amount: 22_000, date: '2026-11-01' }])
    const summary = budgetSummary(d, '2026-11-04')
    expect(summary.flexibleBudget).toBe(60_000)
    expect(cycleForecast(summary)).toEqual({ spent: 62_000, left: -2_000 })
  })

  it('stays quiet too early, on the last day, and while pay is on its way', () => {
    expect(cycleForecast(budgetSummary(data([{ amount: 5_000, date: '2026-10-26' }]), '2026-10-27'))).toBeNull()
    expect(cycleForecast(budgetSummary(data([]), '2026-11-24'))).toBeNull()
    const waiting = data([])
    waiting.transactions = waiting.transactions.filter((t) => t.id !== 'salary-2026-10-25')
    expect(cycleForecast(budgetSummary(waiting, '2026-11-04'))).toBeNull()
  })
})

describe('the review of a cycle', () => {
  it('reviews the cycle that ended most recently', () => {
    expect(lastEndedCycle('2026-10-27', data([]).profile.salary)).toMatchObject({ start: '2026-09-25', end: '2026-10-24' })
  })

  it('says what was left, what changed and what could be adjusted', () => {
    const d = data([
      // August–September: Eating out over, Shopping hardly used.
      { amount: 7_000, date: '2026-09-01', categoryId: 'cat-eating-out' },
      { amount: 2_000, date: '2026-09-02', categoryId: 'cat-shopping' },
      { amount: 10_000, date: '2026-09-03' },
      // September–October: the same again, and groceries up.
      { amount: 8_000, date: '2026-10-01', categoryId: 'cat-eating-out' },
      { amount: 3_000, date: '2026-10-02', categoryId: 'cat-shopping' },
      { amount: 16_000, date: '2026-10-03' },
    ])
    const review = cycleReview(d, lastEndedCycle('2026-10-27', d.profile.salary))
    expect(review.cycle.start).toBe('2026-09-25')
    expect(review.left).toBe(60_000 - 27_000)
    expect(review.spent).toBe(27_000)
    expect(review.over).toEqual([{ categoryId: 'cat-eating-out', by: 3_000 }])
    expect(review.changes[0]).toMatchObject({ categoryId: 'cat-groceries', difference: 6_000 })
    expect(review.tips).toEqual([
      { kind: 'raise-limit', categoryId: 'cat-eating-out', from: 5_000, to: 7_500 },
      { kind: 'lower-limit', categoryId: 'cat-shopping', from: 10_000, to: 3_500 },
      { kind: 'put-aside', amount: 33_000 },
    ])
  })

  it('says by how much it went over, and which limit went over most', () => {
    const d = data([
      { amount: 50_000, date: '2026-10-01' },
      { amount: 15_000, date: '2026-10-02', categoryId: 'cat-shopping' },
    ])
    const review = cycleReview(d, lastEndedCycle('2026-10-27', d.profile.salary))
    expect(review.left).toBe(-5_000)
    expect(review.tips[0]).toEqual({ kind: 'over', amount: 5_000, categoryId: 'cat-shopping' })
    expect(review.tips.some((t) => t.kind === 'put-aside')).toBe(false)
  })

  it('never suggests a limit of nothing for a category left unused', () => {
    // Groceries only: Eating out and Shopping keep their limits and spend nothing, two cycles running.
    const d = data([
      { amount: 10_000, date: '2026-09-03' },
      { amount: 12_000, date: '2026-10-03' },
    ])
    const review = cycleReview(d, lastEndedCycle('2026-10-27', d.profile.salary))
    expect(review.tips.filter((t) => t.kind === 'lower-limit')).toEqual([])
  })
})

describe('the year report', () => {
  it('adds up the year by calendar month, against the year before', () => {
    const d = data([
      { amount: 4_000, date: '2026-09-10' },
      { amount: 6_000, date: '2026-10-10', categoryId: 'cat-shopping' },
      { amount: 1_000, date: '2025-10-10' },
      { amount: 250, date: '2026-10-11', currency: 'USD' },
    ])
    const report = yearReport(d, 2026, '2026-10-27')
    expect(report.months).toHaveLength(10)
    expect(report.months[8]).toEqual({ month: '2026-09-01', income: 60_000, spent: 4_000, kept: 56_000 })
    expect(report.totals).toMatchObject({ income: 180_000, spent: 10_000 })
    expect(report.kept).toBe(170_000)
    expect(report.biggest.map((t) => t.amount)).toEqual([6_000, 4_000])
    expect(report.categories.find((c) => c.categoryId === 'cat-groceries')).toMatchObject({ spent: 4_000, previous: 1_000 })
    expect(report.otherCurrencies).toEqual([{ currency: 'USD', spent: 250, received: 0 }])
    expect(reportYears(d.transactions, '2026-10-27')).toEqual([2026, 2025])
  })
})
