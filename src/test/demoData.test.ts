import { describe, expect, it } from 'vitest'
import { budgetSummary } from '../lib/budget'
import { inMainCurrency } from '../lib/currency'
import { getPayCycle, previousCycle, recentCycles } from '../lib/dates'
import { live } from '../lib/id'
import { sumAmounts } from '../lib/money'
import { expectedPays } from '../lib/income'
import {
  biggestExpense,
  busiestWeekday,
  categoryBreakdown,
  cumulativeSpending,
  cycleTrend,
  periodTotals,
  PERIOD_KINDS,
  savingsRate,
  skippedSavings,
  statsPeriod,
} from '../lib/stats'
import { walletBalance } from '../lib/wallets'
import { createBackup, readBackup } from '../store/backup'
import type { Transaction } from '../types'
import { DEMO_CAR_REPAIR_AT, DEMO_CYCLES, DEMO_OLD_SALARY, DEMO_RAISE_AT, DEMO_SALARY, DEMO_UNPAID_AT, demoData } from './demoData'

// Paydays on the 25th; a few cycle positions, including its first and last day and a leap February.
const TODAYS = ['2026-11-03', '2026-11-24', '2026-11-25', '2026-03-31', '2028-02-29']

/** Adds up the raw entries by hand, without going through lib/stats. */
function byHand(transactions: Transaction[], range: { start: string; end: string }) {
  const kept = transactions.filter((t) => !t.deleted && !t.currency && t.date >= range.start && t.date <= range.end)
  const sum = (filter: (t: Transaction) => boolean) => Math.round(kept.filter(filter).reduce((all, t) => all + t.amount, 0) * 100) / 100
  // Spending is expenses less the money that came back for them.
  const net = (filter: (t: Transaction) => boolean) => Math.round((sum((t) => t.type === 'expense' && filter(t)) - sum((t) => t.type === 'refund' && filter(t))) * 100) / 100
  return {
    spent: net(() => true),
    income: sum((t) => t.type === 'income'),
    fixed: net((t) => !!t.billId),
    // What a fund paid is savings used, like money taken out.
    saved: Math.round((sum((t) => t.type === 'goal-deposit') - sum((t) => t.type === 'goal-withdrawal') - kept.reduce((all, t) => all + (t.type === 'expense' ? (t.fundAmount ?? 0) : 0), 0)) * 100) / 100,
    cash: net((t) => t.accountId === 'acc-cash'),
  }
}

describe.each(TODAYS)('the demo data, seen on %s', (today) => {
  const data = demoData(today)
  const mainOnly = inMainCurrency(data.transactions, data.profile.currency)
  const { salary } = data.profile
  const current = getPayCycle(today, salary)
  const cycleAt = (back: number) => {
    let cycle = current
    for (let i = 0; i < back; i++) cycle = previousCycle(cycle, salary)
    return cycle
  }

  it('is the same every time and survives a backup', () => {
    expect(demoData(today).transactions).toEqual(data.transactions)
    expect(readBackup(createBackup(data))).toEqual(data)
  })

  it('has nothing in the future and no salary waiting for an answer', () => {
    expect(data.transactions.every((t) => t.date <= today)).toBe(true)
    expect(expectedPays(data, today)).toEqual([])
  })

  it('leaves the wallets with money in them, as they would for a real person', () => {
    for (const account of data.accounts) expect(walletBalance(account, data.transactions, today)).toBeGreaterThanOrEqual(0)
  })

  it.each(PERIOD_KINDS)('period "%s": totals match the raw entries, and every split adds up', (kind) => {
    const period = statsPeriod(kind, today, salary, { start: cycleAt(4).start, end: cycleAt(2).end })
    const totals = periodTotals(mainOnly, data.accounts, period.range)
    const hand = byHand(data.transactions, period.range)

    expect(totals).toMatchObject({ spent: hand.spent, income: hand.income, fixed: hand.fixed, saved: hand.saved, cash: hand.cash })
    expect(totals.fixed + totals.flexible).toBeCloseTo(totals.spent, 2)
    expect(totals.cash + totals.card).toBeCloseTo(totals.spent, 2)

    const rows = categoryBreakdown(mainOnly, period.range, period.previous)
    expect(sumAmounts(rows.map((r) => r.spent))).toBeCloseTo(totals.spent, 2)
    expect(rows.reduce((all, r) => all + r.share, 0)).toBeCloseTo(totals.spent > 0 ? 1 : 0, 6)
    // Biggest first.
    expect(rows.map((r) => r.spent)).toEqual([...rows.map((r) => r.spent)].sort((a, b) => b - a))

    const previous = byHand(data.transactions, period.previous)
    expect(sumAmounts(rows.map((r) => r.previous))).toBeLessThanOrEqual(previous.spent + 0.01)
    expect(period.previous.end < period.range.start).toBe(true)
  })

  it('never counts a deleted entry', () => {
    const period = statsPeriod('year', today, salary)
    const biggest = biggestExpense(mainOnly, { start: cycleAt(DEMO_CYCLES - 1).start, end: today })
    expect(biggest?.deleted).toBeFalsy()
    expect(biggest?.amount).toBeLessThan(1_000_000)
    expect(periodTotals(mainOnly, data.accounts, period.range).spent).toBeLessThan(5_000_000)
    expect(data.transactions.some((t) => t.deleted && t.amount > 1_000_000)).toBe(true)
  })

  it('the trend matches cycle by cycle, and the awkward months are there', () => {
    const cycles = recentCycles(today, salary, 12)
    const trend = cycleTrend(mainOnly, data.accounts, cycles, today)
    expect(trend).toHaveLength(12)
    for (const point of trend) {
      const hand = byHand(data.transactions, point.cycle)
      expect(point).toMatchObject({ income: hand.income, spent: hand.spent, saved: hand.saved })
    }
    expect(trend.at(-1)?.partial).toBe(true)
    expect(trend.slice(0, -1).every((p) => !p.partial)).toBe(true)

    const at = (back: number) => trend[trend.length - 1 - back]
    // An unpaid month: nothing to work a rate out from, and money taken out of savings.
    expect(at(DEMO_UNPAID_AT).income).toBe(0)
    expect(at(DEMO_UNPAID_AT).savingsRate).toBeNull()
    expect(at(DEMO_UNPAID_AT).saved).toBeLessThan(0)
    // The car repair: more went out than came in.
    expect(at(DEMO_CAR_REPAIR_AT).savingsRate).toBeLessThan(0)
    expect(at(DEMO_CAR_REPAIR_AT).saved).toBeLessThan(0)
    // The raise: older paydays were smaller.
    const paydayIn = (back: number) => data.transactions.find((t) => t.source === 'salary' && !t.deleted && t.date === cycleAt(back).start)?.amount
    expect(paydayIn(DEMO_RAISE_AT + 1)).toBe(DEMO_OLD_SALARY)
    expect(paydayIn(DEMO_RAISE_AT - 1)).toBe(DEMO_SALARY)
  })

  it('the pace line ends at the budget and only runs up to today', () => {
    const budget = budgetSummary(data, today).flexibleBudget
    const points = cumulativeSpending(mainOnly, current, budget, today)
    expect(points).toHaveLength(current.days)
    expect(points.at(-1)?.pace).toBeCloseTo(budget, 0)
    expect(points.filter((p) => p.date > today).every((p) => p.spent === null)).toBe(true)
    const known = points.flatMap((p) => (p.spent === null ? [] : [p.spent]))
    expect(known).toEqual([...known].sort((a, b) => a - b))
    const flexible = periodTotals(mainOnly, data.accounts, { start: current.start, end: today }).flexible
    expect(known.at(-1)).toBeCloseTo(flexible, 2)
  })

  it('safe to spend per day is whole money and never adds up to more than what is left', () => {
    const summary = budgetSummary(data, today)
    expect(Number.isInteger(summary.safePerDay)).toBe(true)
    expect(summary.safePerDay * summary.progress.daysLeft).toBeLessThanOrEqual(Math.max(0, summary.leftToSpend))
  })

  it('the savings rate is what is left of income after all spending', () => {
    const totals = periodTotals(mainOnly, data.accounts, cycleAt(1))
    expect(savingsRate(totals)).toBeCloseTo((totals.income - totals.spent) / totals.income, 6)
    expect(savingsRate({ income: 0, spent: 100 })).toBeNull()
  })

  it('reaches every "compared with before" label', () => {
    const period = statsPeriod('last', today, salary)
    const rows = categoryBreakdown(mainOnly, period.range, period.previous)
    expect(rows.some((r) => (r.change ?? 0) > 0)).toBe(true)
    expect(rows.some((r) => (r.change ?? 0) < 0)).toBe(true)

    const everyMonth = recentCycles(today, salary, 12)
    const anyNew = everyMonth.some((cycle) => categoryBreakdown(mainOnly, cycle, previousCycle(cycle, salary)).some((r) => r.change === null && r.previous === 0))
    const anyFlat = everyMonth.some((cycle) => categoryBreakdown(mainOnly, cycle, previousCycle(cycle, salary)).some((r) => r.change === 0))
    expect(anyNew).toBe(true)
    expect(anyFlat).toBe(true)
  })

  it('has both cash and card, a busiest day, and wishlist savings', () => {
    const period = statsPeriod('year', today, salary)
    const totals = periodTotals(mainOnly, data.accounts, period.range)
    expect(totals.cash).toBeGreaterThan(0)
    expect(totals.card).toBeGreaterThan(0)
    expect(busiestWeekday(mainOnly, period.range)).not.toBeNull()
    const skipped = skippedSavings(data.wishlist, period.range)
    expect(skipped.count).toBeGreaterThanOrEqual(4)
    expect(skipped.total).toBe(sumAmounts(live(data.wishlist).filter((w) => w.status === 'skipped' && w.decidedAt! >= period.range.start).map((w) => w.price)))
  })
})
