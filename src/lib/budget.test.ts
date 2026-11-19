import { describe, expect, it } from 'vitest'
import type { AppData, Bill, Goal, Transaction } from '../types'
import { createInitialData } from '../store/defaults'
import { budgetLevel, budgetSummary, monthlyRoomForGoal, spentByCategory, suggestBudgets, unbudgetedSpending } from './budget'

const TODAY = '2026-11-15'

interface SetupOptions {
  salary?: number
  bills?: Partial<Bill>[]
  goals?: Partial<Goal>[]
}

/** 60,000 DA paid on the 25th (cycle 25 Oct – 24 Nov), no bills or goals unless given. */
function setup(budgets: Record<string, number>, transactions: Partial<Transaction>[], options: SetupOptions = {}): AppData {
  const data = createInitialData(new Date(2026, 9, 25))
  data.profile.salary = { ...data.profile.salary, amount: options.salary ?? 60_000, payday: 25 }
  data.categories = data.categories.map((c) => (budgets[c.id] ? { ...c, monthlyBudget: budgets[c.id] } : c))
  data.transactions = transactions.map((t, i) => ({
    id: `t${i}`,
    createdAt: '',
    updatedAt: '',
    type: 'expense',
    amount: 0,
    date: TODAY,
    accountId: 'acc-cash',
    ...t,
  }))
  data.bills = (options.bills ?? []).map((b, i) => ({
    id: `b${i}`,
    createdAt: '',
    updatedAt: '',
    name: `Bill ${i}`,
    amount: 0,
    categoryId: 'cat-bills',
    accountId: 'acc-bank',
    frequency: 'monthly',
    dueDay: 1,
    startDate: '2026-01-01',
    active: true,
    ...b,
  }))
  data.goals = (options.goals ?? []).map((g, i) => ({
    id: `g${i}`,
    createdAt: '',
    updatedAt: '',
    name: `Goal ${i}`,
    icon: 'target',
    target: 100_000,
    monthlyContribution: 0,
    archived: false,
    ...g,
  }))
  return data
}

describe('budgetLevel', () => {
  it('warns from 80% and is over from 100%', () => {
    expect(budgetLevel(0.79, 80)).toBe('ok')
    expect(budgetLevel(0.8, 80)).toBe('warning')
    expect(budgetLevel(1, 80)).toBe('over')
  })
})

describe('budgetSummary', () => {
  it('starts from the salary and takes off every expense that is not a bill', () => {
    const data = setup({ 'cat-groceries': 10_000 }, [
      { amount: 2_000, categoryId: 'cat-groceries' },
      { amount: 3_000, categoryId: 'cat-travel' },
    ])
    const summary = budgetSummary(data, TODAY)
    expect(summary).toMatchObject({ salary: 60_000, flexibleBudget: 60_000, flexibleSpent: 5_000, leftToSpend: 55_000 })
    expect(summary.categories).toHaveLength(1)
  })

  it('reserves bills: what was paid, plus the planned amount of what is still due', () => {
    const data = setup(
      { 'cat-health': 2_000 },
      [
        // Swimming cost more than planned this month.
        { amount: 6_500, categoryId: 'cat-health', billId: 'b0', date: '2026-10-26', accountId: 'acc-bank' },
        { amount: 500, categoryId: 'cat-health' },
      ],
      {
        bills: [
          { name: 'Swimming', amount: 6_000, categoryId: 'cat-health', dueDay: 26 },
          { name: 'Internet', amount: 2_000, dueDay: 17 },
          { name: 'Insurance', amount: 12_000, frequency: 'yearly', startDate: '2026-03-01', dueDay: 1 },
        ],
      },
    )
    const summary = budgetSummary(data, TODAY)
    // The yearly bill isn't due this cycle, so it isn't taken off this cycle's pay.
    expect(summary).toMatchObject({ billsReserved: 8_500, flexibleBudget: 51_500, flexibleSpent: 500, leftToSpend: 51_000, spent: 7_000 })
    expect(summary.categories[0]).toMatchObject({ spent: 500, level: 'ok' })
  })

  it('reserves each goal’s monthly amount, or more when more was put aside', () => {
    const data = setup({}, [{ type: 'goal-deposit', amount: 12_000, goalId: 'g0', accountId: 'acc-bank' }], {
      goals: [{ monthlyContribution: 10_302.08 }, { monthlyContribution: 25_000 }, { monthlyContribution: 4_000, archived: true }],
    })
    const summary = budgetSummary(data, TODAY)
    expect(summary).toMatchObject({ savingsReserved: 37_000, flexibleBudget: 23_000, saved: 12_000 })
  })

  it('does not count money taken out of a goal as spending the salary', () => {
    // 100,000 saved for a TV comes out and buys it: the salary is only down the month's 25,000.
    // That 25,000 came back out with the rest, so it isn't reserved: 75,000 of the TV is older savings, 25,000 is this pay.
    const data = setup({}, [
      { type: 'goal-deposit', amount: 25_000, goalId: 'g0', accountId: 'acc-bank', date: '2026-10-25' },
      { type: 'goal-withdrawal', amount: 100_000, goalId: 'g0', accountId: 'acc-bank' },
      { amount: 100_000, categoryId: 'cat-shopping', accountId: 'acc-bank' },
      { amount: 700, categoryId: 'cat-groceries' },
    ], { goals: [{ monthlyContribution: 25_000, startingAmount: 75_000 }] })
    const summary = budgetSummary(data, TODAY)
    expect(summary).toMatchObject({ savingsReserved: 0, fromSavings: 75_000, flexibleBudget: 60_000, flexibleSpent: 25_700, leftToSpend: 34_300 })
  })

  it('gives the pay back when money put aside this cycle is taken back out', () => {
    // Put aside 40,000 by mistake, took it all back, spent 8,125: the budget is only down the spending.
    const spent = { amount: 8_125, categoryId: 'cat-groceries' }
    const without = budgetSummary(setup({}, [spent], { goals: [{ monthlyContribution: 0 }] }), TODAY)
    const data = setup({}, [
      spent,
      { type: 'goal-deposit', amount: 40_000, goalId: 'g0', accountId: 'acc-bank' },
      { type: 'goal-withdrawal', amount: 40_000, goalId: 'g0', accountId: 'acc-bank' },
    ], { goals: [{ monthlyContribution: 0 }] })
    const summary = budgetSummary(data, TODAY)
    expect(summary).toMatchObject({ savingsReserved: 0, fromSavings: 0, saved: 0, leftToSpend: without.leftToSpend })
  })

  it('adds other income, but not the salary itself or cash-count corrections', () => {
    const data = setup({}, [
      { type: 'income', amount: 60_000, categoryId: 'inc-salary', source: 'salary', date: '2026-10-25', accountId: 'acc-bank' },
      { type: 'income', amount: 5_000, categoryId: 'inc-side' },
      { type: 'income', amount: 200, categoryId: 'inc-other', source: 'cash-count' },
    ])
    const summary = budgetSummary(data, TODAY)
    expect(summary).toMatchObject({ income: 65_200, otherIncome: 5_000, flexibleBudget: 65_000 })
  })

  it('ignores disabled categories, deleted transactions and other cycles', () => {
    const data = setup({ 'cat-groceries': 10_000, 'cat-pets': 3_000 }, [
      { amount: 1_000, categoryId: 'cat-groceries', deleted: true },
      { amount: 1_000, categoryId: 'cat-groceries', date: '2026-10-24' },
    ])
    const summary = budgetSummary(data, TODAY)
    expect(summary.categories.map((c) => c.categoryId)).toEqual(['cat-groceries'])
    expect(summary.flexibleSpent).toBe(0)
  })

  it('flags spending more than 15 points ahead of the cycle', () => {
    // Day 22 of 31 is 71% of the cycle gone, so 90% used is 19 points ahead.
    const data = setup({ 'cat-groceries': 10_000 }, [{ amount: 9_000, categoryId: 'cat-groceries' }], { salary: 10_000 })
    expect(budgetSummary(data, TODAY).spendingTooFast).toBe(true)
  })

  it('never suggests a negative daily amount', () => {
    const data = setup({ 'cat-groceries': 1_000 }, [{ amount: 1_500, categoryId: 'cat-groceries' }], { salary: 1_000 })
    const summary = budgetSummary(data, TODAY)
    expect(summary.leftToSpend).toBe(-500)
    expect(summary.safePerDay).toBe(0)
  })

  it('has nothing to spend without a salary', () => {
    const summary = budgetSummary(setup({}, [{ amount: 300, categoryId: 'cat-groceries' }], { salary: 0 }), TODAY)
    expect(summary).toMatchObject({ salary: 0, flexibleBudget: 0, leftToSpend: -300, usedRatio: 0, spendingTooFast: false })
  })
})

describe('monthlyRoomForGoal', () => {
  const data = setup({}, [], {
    bills: [{ amount: 3_000 }, { amount: 12_000, frequency: 'yearly' }],
    goals: [{ monthlyContribution: 10_302.08 }, { monthlyContribution: 25_000 }, { monthlyContribution: 9_000, archived: true }],
  })

  it('is the salary less average bills and the other active goals', () => {
    // 60,000 − 3,000 − 1,000 (12,000 a year) − 35,302.08 for a new goal; editing a goal doesn't count itself.
    expect(monthlyRoomForGoal(data.profile, data.bills, data.goals)).toBe(20_697.92)
    expect(monthlyRoomForGoal(data.profile, data.bills, data.goals, 'g1')).toBe(45_697.92)
  })

  it('is unlimited until a salary is set', () => {
    expect(monthlyRoomForGoal({ salary: { ...data.profile.salary, amount: 0 } }, data.bills, data.goals)).toBeNull()
  })
})

describe('spentByCategory', () => {
  it('adds up expenses per category and skips income', () => {
    const data = setup({}, [
      { amount: 100, categoryId: 'cat-groceries' },
      { amount: 250, categoryId: 'cat-groceries' },
      { amount: 5_000, categoryId: 'inc-bonus', type: 'income' },
    ])
    const totals = spentByCategory(data.transactions, { start: '2026-10-25', end: '2026-11-24' })
    expect([...totals]).toEqual([['cat-groceries', 350]])
  })
})

describe('suggestBudgets', () => {
  const split: [string, number][] = [
    ['cat-groceries', 0.45],
    ['cat-eating-out', 0.14],
    ['cat-shopping', 0.14],
    ['cat-entertainment', 0.08],
    ['cat-personal-care', 0.07],
    ['cat-household', 0.05],
    ['cat-other', 0.07],
  ]

  it('reproduces the limits in the preview from 35,800 DA free to spend', () => {
    expect(Object.fromEntries(suggestBudgets(35_800, split))).toEqual({
      'cat-groceries': 16_100,
      'cat-eating-out': 5_000,
      'cat-shopping': 5_000,
      'cat-entertainment': 2_900,
      'cat-personal-care': 2_500,
      'cat-household': 1_800,
      'cat-other': 2_500,
    })
  })

  it('always adds up to exactly the free amount, even when small', () => {
    for (const free of [35_800, 12_345, 1_000, 250]) {
      const total = [...suggestBudgets(free, split).values()].reduce((a, b) => a + b, 0)
      expect(total).toBeCloseTo(free, 2)
      expect([...suggestBudgets(free, split).values()].every((v) => v >= 0)).toBe(true)
    }
  })

  it('suggests nothing when there is nothing free to spend', () => {
    expect(suggestBudgets(0, split).size).toBe(0)
    expect(suggestBudgets(-500, split).size).toBe(0)
  })
})

describe('unbudgetedSpending', () => {
  it('lists flexible spending in categories without a limit, biggest first', () => {
    const data = setup({ 'cat-groceries': 10_000 }, [
      { amount: 2_000, categoryId: 'cat-groceries' },
      { amount: 500, categoryId: 'cat-gifts' },
      { amount: 3_000, categoryId: 'cat-travel' },
      { amount: 6_000, categoryId: 'cat-health', billId: 'bill-gym' },
    ])
    expect(unbudgetedSpending(data.categories, data.transactions, { start: '2026-10-25', end: '2026-11-24' })).toEqual([
      { categoryId: 'cat-travel', spent: 3_000 },
      { categoryId: 'cat-gifts', spent: 500 },
    ])
  })
})

describe('budgetSummary for another cycle', () => {
  it('summarises a past cycle as fully elapsed, from what was really paid then', () => {
    const data = setup({ 'cat-groceries': 10_000 }, [
      { type: 'income', amount: 58_000, categoryId: 'inc-salary', source: 'salary', date: '2026-09-25', accountId: 'acc-bank' },
      { amount: 4_000, categoryId: 'cat-groceries', date: '2026-10-10' },
    ])
    const past = budgetSummary(data, TODAY, { start: '2026-09-25', end: '2026-10-24', days: 30 })
    expect(past).toMatchObject({ flexibleSpent: 4_000, salary: 58_000, leftToSpend: 54_000 })
    expect(past.progress).toEqual({ dayNumber: 30, daysLeft: 0, elapsedRatio: 1 })
  })
})
