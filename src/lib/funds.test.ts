import { describe, expect, it } from 'vitest'
import type { AppData, Bill, Goal, Transaction } from '../types'
import { createInitialData } from '../store/defaults'
import { budgetSummary, fundsToPutAside, goalPlannedIn, monthlyRoomForGoal, plannedFreeToSpend, spentByCategory } from './budget'
import { getPayCycle } from './dates'
import { fundDueDate, fundSeason, hijriMonthDay, nextHijriDate, occurrenceFrom, plannedMonthlyBills, walletPart } from './funds'
import { goalSaved, goalView } from './goals'
import { periodTotals } from './stats'
import { checkGoal, checkTransaction } from './validation'
import { walletBalance } from './wallets'

const TODAY = '2026-11-15'
const SALARY = { frequency: 'monthly' as const, payday: 25, accountId: 'acc-bank', amount: 60_000 }

function tx(fields: Partial<Transaction>, i = 0): Transaction {
  return { id: `t${i}`, createdAt: '', updatedAt: '', type: 'expense', amount: 0, date: TODAY, accountId: 'acc-bank', categoryId: 'cat-bills', ...fields }
}

function bill(fields: Partial<Bill> = {}): Bill {
  return {
    id: 'insurance',
    createdAt: '',
    updatedAt: '',
    name: 'Car insurance',
    amount: 24_000,
    categoryId: 'cat-transport',
    accountId: 'acc-bank',
    frequency: 'yearly',
    dueDay: 20,
    startDate: '2026-11-01',
    active: true,
    ...fields,
  }
}

function fund(fields: Partial<Goal> = {}): Goal {
  return { id: 'fund', createdAt: '2026-01-01', updatedAt: '', name: 'Insurance', icon: 'receipt', target: 24_000, monthlyContribution: 2_000, archived: false, fund: { billId: 'insurance' }, ...fields }
}

/** 60,000 DA on the 25th: this cycle is 25 Oct – 24 Nov. */
function data(fields: { bills?: Bill[]; goals?: Goal[]; transactions?: Transaction[] } = {}): AppData {
  const base = createInitialData(new Date(2026, 9, 25))
  base.profile.salary = { ...base.profile.salary, ...SALARY }
  base.profile.startDate = '2026-01-01'
  base.bills = fields.bills ?? []
  base.goals = fields.goals ?? []
  // The salary arrived on payday.
  base.transactions = [tx({ id: 'pay', type: 'income', amount: 60_000, date: '2026-10-25', categoryId: 'cat-salary', source: 'salary' }), ...(fields.transactions ?? [])]
  return base
}

describe('repeating dates', () => {
  it('comes round on the same date each year, counted from the first one', () => {
    expect(occurrenceFrom('2027-09-01', 'yearly', TODAY)).toBe('2027-09-01')
    expect(occurrenceFrom('2025-09-01', 'yearly', TODAY)).toBe('2027-09-01')
    expect(occurrenceFrom('2025-11-15', 'yearly', TODAY)).toBe('2026-11-15')
    // 29 February comes back in leap years, not as the 28th for ever.
    expect(occurrenceFrom('2024-02-29', 'yearly', '2027-03-01')).toBe('2028-02-29')
  })

  it('follows the Islamic calendar, about 11 days earlier each year', () => {
    expect(hijriMonthDay('2027-02-08')).toEqual({ month: 9, day: 1 })
    expect(nextHijriDate(9, 1, TODAY)).toBe('2027-02-08')
    expect(occurrenceFrom('2027-02-08', 'hijri-yearly', '2027-02-09')).toBe('2028-01-28')
    // From a past Eid al-Adha, the next one.
    expect(occurrenceFrom('2026-05-27', 'hijri-yearly', TODAY)).toBe('2027-05-16')
  })

  it('is in season a month either side of its date', () => {
    const ramadan = fund({ fund: { repeat: 'hijri-yearly' }, deadline: '2027-02-08' })
    expect(fundSeason(ramadan, TODAY)).toBeNull()
    expect(fundSeason(ramadan, '2027-01-10')).toBe('2027-02-08')
    expect(fundSeason(ramadan, '2027-03-08')).toBe('2027-02-08')
    expect(fundSeason(ramadan, '2027-03-12')).toBeNull()
    // A bill's fund is offered with its bill instead.
    expect(fundSeason(fund(), '2026-11-20')).toBeNull()
  })
})

describe('when a fund is needed', () => {
  const context = { bills: [bill()], transactions: [] as Transaction[], salary: SALARY }

  it('follows its bill: the next due date, or the one after once it’s paid', () => {
    expect(fundDueDate(fund(), TODAY, context)).toBe('2026-11-20')
    const paid = [tx({ billId: 'insurance', amount: 24_000, date: '2026-11-10' })]
    expect(fundDueDate(fund(), TODAY, { ...context, transactions: paid })).toBe('2027-11-20')
    // Overdue and unpaid: still that date.
    expect(fundDueDate(fund(), '2026-11-22', context)).toBe('2026-11-20')
  })

  it('has no date when its bill is paused or gone', () => {
    expect(fundDueDate(fund(), TODAY, { ...context, bills: [bill({ active: false })] })).toBeNull()
    expect(fundDueDate(fund(), TODAY, { ...context, bills: [] })).toBeNull()
  })

  it('counts this month as one to put aside in, until something is', () => {
    const ramadan = fund({ fund: { repeat: 'hijri-yearly' }, deadline: '2027-02-08', target: 30_000, monthlyContribution: 7_500 })
    const month = { start: '2026-10-25', end: '2026-11-24' }
    // This month and the paydays of 25 Nov, Dec and Jan: four.
    expect(goalView(ramadan, [], month, TODAY, SALARY).forecast.neededPerMonth).toBe(7_500)
    const putAside = [tx({ type: 'goal-deposit', goalId: 'fund', amount: 7_500, date: '2026-11-01' })]
    const after = goalView(ramadan, putAside, month, TODAY, SALARY)
    // The same once this month's share is in: not suddenly "ahead".
    expect(after.forecast.neededPerMonth).toBe(7_500)
    expect(after.status).toBe('on-track')
  })

  it('isn’t behind when its bill is due this month: the rest comes from this month’s pay', () => {
    const view = goalView(fund(), [], { start: '2026-10-25', end: '2026-11-24' }, TODAY, SALARY, [bill()])
    expect(view.dueNow).toBe(true)
    expect(view.status).toBeNull()
    expect(view.forecast.neededPerMonth).toBeNull()
  })

  it('starts again after its date, forecast to the next one', () => {
    const ramadan = fund({ fund: { repeat: 'hijri-yearly' }, deadline: '2027-02-08', target: 30_000, monthlyContribution: 2_500 })
    const view = goalView(ramadan, [], { start: '2027-02-25', end: '2027-03-24' }, '2027-03-01', SALARY)
    expect(view.due).toBe('2028-01-28')
    expect(view.season).toBe('2027-02-08')
  })
})

describe('the monthly plan', () => {
  it('counts a bill with a fund once, through the fund', () => {
    const bills = [bill(), bill({ id: 'rent', frequency: 'monthly', amount: 20_000, dueDay: 1 })]
    expect(plannedMonthlyBills(bills, [])).toBe(22_000)
    expect(plannedMonthlyBills(bills, [fund()])).toBe(20_000)
    // Salary 60,000 − rent 20,000 − the fund's 2,000.
    expect(plannedFreeToSpend({ salary: SALARY }, bills, [fund()])).toBe(38_000)
  })

  it('makes room for a new bill fund before it exists', () => {
    const bills = [bill()]
    expect(monthlyRoomForGoal({ salary: SALARY }, bills, [])).toBe(58_000)
    expect(monthlyRoomForGoal({ salary: SALARY }, bills, [], { fund: { billId: 'insurance' } })).toBe(60_000)
  })

  it('stops planning once a fund is full, and starts again once it’s spent', () => {
    const cycle = getPayCycle(TODAY, SALARY)
    const full = [tx({ type: 'goal-deposit', goalId: 'fund', amount: 24_000, date: '2026-01-25' })]
    expect(goalPlannedIn(fund(), full, cycle)).toBe(0)
    expect(goalPlannedIn(fund(), [...full, tx({ type: 'goal-deposit', goalId: 'fund', amount: 1_000, date: '2025-12-25' })], cycle)).toBe(0)
    expect(goalPlannedIn(fund({ startingAmount: 23_000 }), [], cycle)).toBe(1_000)
    const spent = [...full, tx({ billId: 'insurance', amount: 24_000, goalId: 'fund', fundAmount: 24_000, date: '2026-11-01' })]
    expect(goalPlannedIn(fund(), spent, cycle)).toBe(2_000)
    // A plain goal plans its amount whatever it holds.
    expect(goalPlannedIn(fund({ fund: undefined }), full, cycle)).toBe(2_000)
  })
})

describe('a yearly bill paid from its fund', () => {
  const saved = (amount: number) => tx({ id: 'saved', type: 'goal-deposit', goalId: 'fund', amount, date: '2026-01-25' })

  it('doesn’t land on the cycle it’s due in', () => {
    const without = budgetSummary(data(), TODAY)
    const unfunded = budgetSummary(data({ bills: [bill()] }), TODAY)
    expect(unfunded.billsReserved).toBe(24_000)
    const funded = budgetSummary(data({ bills: [bill()], goals: [fund()], transactions: [saved(24_000)] }), TODAY)
    expect(funded.billsReserved).toBe(0)
    // The fund is full, so nothing more is planned for it either.
    expect(funded.savingsReserved).toBe(0)
    expect(funded.leftToSpend).toBe(without.leftToSpend)
  })

  it('takes only what the fund is missing from this cycle', () => {
    const summary = budgetSummary(data({ bills: [bill()], goals: [fund()], transactions: [saved(10_000)] }), TODAY)
    expect(summary.billsReserved).toBe(14_000)
  })

  it('counts only what didn’t come from the fund once it’s paid', () => {
    const payment = tx({ id: 'paid', billId: 'insurance', amount: 26_000, goalId: 'fund', fundAmount: 24_000, date: '2026-11-18' })
    const summary = budgetSummary(data({ bills: [bill()], goals: [fund()], transactions: [saved(24_000), payment] }), '2026-11-18')
    expect(summary.billsReserved).toBe(2_000)
    expect(summary.fromFunds).toBe(24_000)
    expect(summary.spent).toBe(26_000)
    // Spending savings shows as savings used.
    expect(summary.saved).toBe(-24_000)
  })
})

describe('everyday spending from a fund', () => {
  const ramadan = fund({ id: 'ramadan', fund: { repeat: 'hijri-yearly' }, deadline: '2026-11-10', target: 30_000, monthlyContribution: 0 })
  const transactions = [
    tx({ id: 'in', type: 'goal-deposit', goalId: 'ramadan', amount: 30_000, date: '2026-02-01' }),
    tx({ id: 'shop', categoryId: 'cat-groceries', amount: 12_000, goalId: 'ramadan', fundAmount: 10_000, accountId: 'acc-cash' }),
  ]

  it('isn’t everyday spending or against a limit, only the rest is', () => {
    const d = data({ goals: [ramadan], transactions })
    d.categories = d.categories.map((c) => (c.id === 'cat-groceries' ? { ...c, monthlyBudget: 15_000 } : c))
    const summary = budgetSummary(d, TODAY)
    expect(summary.flexibleSpent).toBe(2_000)
    expect(summary.categories.find((c) => c.categoryId === 'cat-groceries')?.spent).toBe(2_000)
    expect(spentByCategory(d.transactions, getPayCycle(TODAY, SALARY)).get('cat-groceries')).toBe(12_000)
  })

  it('comes out of the fund, and only the rest out of the wallet', () => {
    expect(goalSaved(ramadan, transactions)).toBe(20_000)
    const cash = createInitialData().accounts.find((a) => a.id === 'acc-cash')!
    expect(walletBalance({ ...cash, startingBalance: 5_000, startDate: '2026-01-01' }, transactions)).toBe(3_000)
    expect(walletPart(transactions[1])).toBe(2_000)
  })

  it('counts in full as spending in Stats, and as savings used', () => {
    const totals = periodTotals(transactions, createInitialData().accounts, { start: '2026-11-01', end: '2026-11-30' })
    expect(totals.spent).toBe(12_000)
    expect(totals.saved).toBe(-10_000)
  })
})

describe('what Home offers to put aside', () => {
  it('lists each fund short of this month’s amount, by what it’s still missing', () => {
    const school = fund({ id: 'school', name: 'School', fund: { repeat: 'yearly' }, deadline: '2027-09-01', target: 20_000, monthlyContribution: 2_000 })
    const eid = fund({ id: 'eid', name: 'Eid', fund: { repeat: 'hijri-yearly' }, deadline: '2027-05-16', target: 40_000, monthlyContribution: 6_000 })
    const goal = fund({ id: 'laptop', name: 'Laptop', fund: undefined, monthlyContribution: 5_000 })
    const d = data({ goals: [school, eid, goal], transactions: [tx({ type: 'goal-deposit', goalId: 'eid', amount: 4_000, date: '2026-11-01' })] })
    expect(fundsToPutAside(d, TODAY).map((f) => [f.goal.id, f.amount])).toEqual([
      ['school', 2_000],
      ['eid', 2_000],
    ])
  })

  it('leaves out a bill’s fund in the month the bill is due unpaid: the bill itself is reserved', () => {
    expect(fundsToPutAside(data({ bills: [bill()], goals: [fund()] }), TODAY)).toEqual([])
    expect(fundsToPutAside(data({ bills: [bill({ startDate: '2027-03-01' })], goals: [fund()] }), TODAY).map((f) => f.amount)).toEqual([2_000])
  })
})

describe('checks', () => {
  const base = data({ goals: [fund()], transactions: [tx({ id: 'saved', type: 'goal-deposit', goalId: 'fund', amount: 5_000, date: '2026-01-25' })] })

  it('never takes more from a fund than it holds, or than the expense', () => {
    const entry = { type: 'expense' as const, amount: 8_000, date: TODAY, accountId: 'acc-bank', categoryId: 'cat-bills', goalId: 'fund' }
    expect(checkTransaction({ ...entry, fundAmount: 5_000 }, base)).toBeNull()
    expect(checkTransaction({ ...entry, fundAmount: 6_000 }, base)).toBe('Only 5,000 DA is in this fund.')
    expect(checkTransaction({ ...entry, fundAmount: 9_000 }, base)).toBe('A fund can’t pay more than the expense.')
    expect(checkTransaction({ ...entry, goalId: 'nope', fundAmount: 1_000 }, base)).toBe('That fund no longer exists.')
  })

  it('needs a date for a fund that isn’t for a bill', () => {
    expect(checkGoal({ ...fund(), fund: { repeat: 'yearly' } })).toBe('Pick the next date it’s needed.')
    expect(checkGoal({ ...fund(), fund: { repeat: 'yearly' }, deadline: '2027-09-01' })).toBeNull()
    expect(checkGoal(fund())).toBeNull()
  })
})
