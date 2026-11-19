import { describe, expect, it } from 'vitest'
import type { Transaction, WishlistItem } from '../types'
import { PREVIEW_TODAY, previewExample } from '../test/previewExample'
import { getPayCycle } from './dates'
import { formatCompact } from './money'
import { biggestExpense, busiestWeekday, categoryBreakdown, cumulativeSpending, cycleTrend, niceTicks, periodTotals, savingsRate, skippedSavings, statsPeriod } from './stats'
import { formatWorkTime, hourlyRate, workTimeFor } from './workHours'

const data = previewExample()
const salary = data.profile.salary
const CYCLE = { start: '2026-10-25', end: '2026-11-24' }

describe('statsPeriod', () => {
  it('compares the current cycle with the same days of the last one', () => {
    const period = statsPeriod('cycle', PREVIEW_TODAY, salary)
    expect(period).toMatchObject({ range: CYCLE, previous: { start: '2026-09-25', end: '2026-10-16' }, elapsedDays: 22, isCurrent: true })
    expect(period.trend.map((c) => c.start)).toEqual(['2026-05-25', '2026-06-25', '2026-07-25', '2026-08-25', '2026-09-25', '2026-10-25'])
  })

  it('covers whole cycles for last, 3 cycles and a year', () => {
    expect(statsPeriod('last', PREVIEW_TODAY, salary)).toMatchObject({
      range: { start: '2026-09-25', end: '2026-10-24' },
      previous: { start: '2026-08-25', end: '2026-09-24' },
      elapsedDays: 30,
      isCurrent: false,
    })
    expect(statsPeriod('3', PREVIEW_TODAY, salary)).toMatchObject({
      range: { start: '2026-08-25', end: '2026-11-24' },
      previous: { start: '2026-05-25', end: '2026-08-24' },
    })
    const year = statsPeriod('year', PREVIEW_TODAY, salary)
    expect(year.range).toEqual({ start: '2025-11-25', end: '2026-11-24' })
    expect(year.trend).toHaveLength(12)
  })

  it('keeps a custom range in the past and compares it with the days just before', () => {
    expect(statsPeriod('custom', PREVIEW_TODAY, salary, { start: '2026-11-01', end: '2026-12-31' })).toMatchObject({
      range: { start: '2026-11-01', end: PREVIEW_TODAY },
      previous: { start: '2026-10-17', end: '2026-10-31' },
      elapsedDays: 15,
    })
  })
})

describe('the Stats mockup numbers', () => {
  const totals = periodTotals(data.transactions, data.accounts, CYCLE)

  it('splits 38,300 DA into cash 27,200 and card 11,100', () => {
    expect(totals).toEqual({ income: 60_000, spent: 38_300, fixed: 12_200, flexible: 26_100, saved: 8_000, cash: 27_200, card: 11_100 })
    expect(savingsRate(totals)).toBeCloseTo(0.3617, 3)
  })

  it('ranks groceries, health, shopping and eating out first', () => {
    const top = categoryBreakdown(data.transactions, CYCLE, { start: '2026-09-25', end: '2026-10-24' }).slice(0, 4)
    expect(top.map((c) => [c.categoryId, c.spent, Math.round(c.share * 100), c.change])).toEqual([
      ['cat-groceries', 12_000, 31, null],
      ['cat-health', 6_000, 16, null],
      ['cat-shopping', 5_400, 14, null],
      ['cat-eating-out', 4_600, 12, null],
    ])
  })

  it('costs 13 h 17 min of work on eating out', () => {
    const rate = hourlyRate(data.profile)!
    expect(formatWorkTime(workTimeFor(4_600, rate, data.profile.work.hoursPerDay))).toBe('13 h 17 min')
  })
})

describe('changes, trend and pace', () => {
  const extra: Transaction[] = [
    { id: 'old-1', createdAt: '', updatedAt: '', type: 'expense', amount: 10_000, date: '2026-10-01', accountId: 'acc-cash', categoryId: 'cat-groceries' },
    { id: 'old-2', createdAt: '', updatedAt: '', type: 'income', amount: 60_000, date: '2026-09-25', accountId: 'acc-bank', categoryId: 'inc-salary' },
  ]
  const transactions = [...data.transactions, ...extra]

  it('shows the change per category against the previous period', () => {
    const groceries = categoryBreakdown(transactions, CYCLE, { start: '2026-09-25', end: '2026-10-24' })[0]
    expect(groceries).toMatchObject({ spent: 12_000, previous: 10_000, change: 0.2 })
  })

  it('gives each cycle its income, spending, saving and savings rate', () => {
    const cycles = [getPayCycle('2026-10-01', salary), getPayCycle(PREVIEW_TODAY, salary)]
    const trend = cycleTrend(transactions, data.accounts, cycles, PREVIEW_TODAY)
    expect(trend.map(({ income, spent, saved, partial }) => ({ income, spent, saved, partial }))).toEqual([
      { income: 60_000, spent: 10_000, saved: 0, partial: false },
      { income: 60_000, spent: 38_300, saved: 8_000, partial: true },
    ])
    expect(trend[0].savingsRate).toBeCloseTo(0.8333, 3)
  })

  it('adds up flexible spending day by day next to an even pace', () => {
    const points = cumulativeSpending(data.transactions, getPayCycle(PREVIEW_TODAY, salary), 31_000, PREVIEW_TODAY)
    expect(points).toHaveLength(31)
    expect(points[0]).toEqual({ date: '2026-10-25', day: 1, spent: 0, pace: 1_000 })
    expect(points[21]).toMatchObject({ date: PREVIEW_TODAY, spent: 26_100, pace: 22_000 })
    expect(points[22].spent).toBeNull()
    expect(points[30].pace).toBe(31_000)
  })

  it('finds the biggest expense and the busiest weekday', () => {
    expect(biggestExpense(data.transactions, CYCLE)?.amount).toBe(9_650)
    // Sunday 1 Nov: 9,650 of groceries.
    expect(busiestWeekday(data.transactions, CYCLE)).toBe(0)
    expect(busiestWeekday([], CYCLE)).toBeNull()
  })

  it('counts what was skipped in the period', () => {
    const item = (price: number, status: WishlistItem['status'], decidedAt?: string): WishlistItem => ({ id: `w${price}`, createdAt: '', updatedAt: '', name: 'x', price, status, decidedAt })
    const wishlist = [item(8_900, 'skipped', '2026-11-03T10:00:00'), item(2_000, 'skipped', '2026-09-01T10:00:00'), item(500, 'bought', '2026-11-03T10:00:00'), item(300, 'thinking')]
    expect(skippedSavings(wishlist, CYCLE)).toEqual({ total: 8_900, count: 1 })
  })
})

describe('axis ticks', () => {
  it('uses round steps from zero past the largest value', () => {
    expect(niceTicks(0, 26_000)).toEqual([0, 10_000, 20_000, 30_000])
    expect(niceTicks(0, 60_000)).toEqual([0, 20_000, 40_000, 60_000])
    expect(niceTicks(0, 78)).toEqual([0, 20, 40, 60, 80])
    expect(niceTicks(-12, 50)).toEqual([-20, 0, 20, 40, 60])
    expect(niceTicks(0, 0)).toEqual([0])
  })

  it('labels ticks in full below 10,000 and in thousands above', () => {
    expect([0, 2_500, 7_500].map((v) => formatCompact(v, 7_500))).toEqual(['0', '2,500', '7,500'])
    expect([0, 10_000, 15_000, 1_500].map((v) => formatCompact(v, 60_000))).toEqual(['0', '10k', '15k', '1.5k'])
    expect(formatCompact(1_250_000, 2_000_000)).toBe('1.25M')
  })
})

describe('statsPeriod with weekly pay', () => {
  const weekly = { frequency: 'weekly', payday: 1, anchor: '2026-11-03' } as const

  it('covers weeks for one and three cycles, and a real year by the month', () => {
    expect(statsPeriod('cycle', '2026-11-05', weekly).range).toEqual({ start: '2026-11-03', end: '2026-11-09' })
    expect(statsPeriod('last', '2026-11-05', weekly).range).toEqual({ start: '2026-10-27', end: '2026-11-02' })
    expect(statsPeriod('3', '2026-11-05', weekly).range.start).toBe('2026-10-20')
    const year = statsPeriod('year', '2026-11-05', weekly)
    expect(year.range.start).toBe('2025-11-11')
    expect(year.trend).toHaveLength(12)
    expect(year.trend[11]).toMatchObject({ start: '2026-11-01', end: '2026-11-30' })
    expect(statsPeriod('cycle', '2026-11-05', weekly).trend).toHaveLength(6)
  })
})
