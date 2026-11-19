import { describe, expect, it } from 'vitest'
import { createInitialData } from '../store/defaults'
import type { AppData, Bill, IncomeSource, Salary, Transaction } from '../types'
import { budgetAlerts, homeAlerts } from './alerts'
import { budgetSummary, leftShown, monthlyRoomForGoal, plannedFreeToSpend } from './budget'
import { expectedPays, monthlyIncomes, salaryCountedOn, scheduledPays } from './income'

const MONTHLY: Salary = { amount: 60_000, frequency: 'monthly', payday: 25, accountId: 'acc-bank' }

function setup(options: { salary?: Partial<Salary>; startDate?: string; transactions?: Partial<Transaction>[]; incomes?: Partial<IncomeSource>[]; bills?: Partial<Bill>[]; onboarded?: boolean } = {}): AppData {
  const data = createInitialData(new Date(2026, 9, 1))
  data.profile = { ...data.profile, salary: { ...MONTHLY, ...options.salary }, startDate: options.startDate ?? '2026-09-01', onboardingCompleted: options.onboarded ?? true }
  data.transactions = (options.transactions ?? []).map((t, i) => ({ id: `t${i}`, createdAt: '', updatedAt: '', type: 'income', amount: 60_000, date: '2026-10-25', accountId: 'acc-bank', categoryId: 'inc-salary', ...t }))
  data.incomes = (options.incomes ?? []).map((s, i) => ({
    id: `i${i}`,
    createdAt: '',
    updatedAt: '',
    name: 'Second job',
    amount: 20_000,
    frequency: 'monthly',
    payday: 5,
    startDate: '2026-09-01',
    accountId: 'acc-bank',
    categoryId: 'inc-side',
    ...s,
  }))
  data.bills = (options.bills ?? []).map((b, i) => ({ id: `b${i}`, createdAt: '', updatedAt: '', name: 'Rent', amount: 8_500, categoryId: 'cat-bills', accountId: 'acc-bank', frequency: 'monthly', dueDay: 1, startDate: '2026-01-01', active: true, ...b }))
  return data
}

const dates = (data: AppData, today: string) => expectedPays(data, today).map((p) => p.payDate)

describe('expectedPays', () => {
  it('expects the salary on each payday after setup, and not before', () => {
    expect(dates(setup({ startDate: '2026-10-01' }), '2026-11-30')).toEqual(['2026-10-25', '2026-11-25'])
    expect(dates(setup({ startDate: '2026-10-25' }), '2026-11-24')).toEqual([])
    expect(dates(setup({ startDate: '2026-10-25' }), '2026-11-25')).toEqual(['2026-11-25'])
  })

  it('gets an answer from a salary logged or answered, late or by hand', () => {
    const answered = (t: Partial<Transaction>) => dates(setup({ startDate: '2026-11-01', transactions: [t] }), '2026-11-30')
    expect(answered({ id: 'salary-2026-11-25', source: 'salary', date: '2026-11-25' })).toEqual([])
    expect(answered({ id: 'salary-2026-11-25', source: 'salary', date: '2026-11-28' })).toEqual([])
    expect(answered({ date: '2026-11-27' })).toEqual([])
    // Three days early still belongs to that payday; a week early doesn't.
    expect(answered({ date: '2026-11-22' })).toEqual([])
    expect(answered({ date: '2026-11-18' })).toEqual(['2026-11-25'])
  })

  it('takes a deleted salary as "not received", until that answer is taken back', () => {
    const asked = (t: Partial<Transaction>) => dates(setup({ startDate: '2026-11-01', transactions: [t] }), '2026-11-30')
    expect(asked({ id: 'salary-2026-11-25', source: 'salary', date: '2026-11-25', deleted: true })).toEqual([])
    expect(asked({ id: 'salary-2026-11-25', source: 'salary', date: '2026-11-25', deleted: true, reasked: true })).toEqual(['2026-11-25'])
    // A hand-logged entry that was deleted was only a mistake: the salary is still to come.
    expect(asked({ date: '2026-11-25', deleted: true })).toEqual(['2026-11-25'])
  })

  it('keeps asking about a payday when an earlier one is answered late, in its cycle', () => {
    const data = setup({ startDate: '2026-10-01', transactions: [{ id: 'salary-2026-10-25', source: 'salary', date: '2026-11-26' }] })
    expect(dates(data, '2026-11-30')).toEqual(['2026-11-25'])
  })

  it('still counts a salary after the payday moved', () => {
    const data = setup({ salary: { payday: 28 }, startDate: '2026-10-01', transactions: [{ id: 'salary-2026-10-25', source: 'salary', date: '2026-10-25' }] })
    expect(dates(data, '2026-11-01')).toEqual([])
  })

  it('expects nothing before setup is finished, without a salary, or with irregular pay', () => {
    expect(dates(setup({ onboarded: false }), '2026-11-30')).toEqual([])
    expect(dates(setup({ salary: { amount: 0 } }), '2026-11-30')).toEqual([])
    expect(dates(setup({ salary: { frequency: 'irregular' } }), '2026-11-30')).toEqual([])
  })

  it('leaves weekly pay with no date alone', () => {
    expect(dates(setup({ salary: { frequency: 'weekly' } }), '2026-11-30')).toEqual([])
  })

  it('walks weekly and biweekly paydays from their date', () => {
    const weekly = { frequency: 'weekly', anchor: '2026-11-03', amount: 15_000 } as const
    expect(dates(setup({ salary: weekly, startDate: '2026-11-01' }), '2026-11-18')).toEqual(['2026-11-03', '2026-11-10', '2026-11-17'])
    expect(dates(setup({ salary: { ...weekly, frequency: 'biweekly' }, startDate: '2026-11-01' }), '2026-11-18')).toEqual(['2026-11-03', '2026-11-17'])
  })

  it('expects income sources from their start date, each payday its own answer', () => {
    const data = setup({ startDate: '2026-11-20', incomes: [{ startDate: '2026-10-06' }] })
    expect(dates(data, '2026-12-06')).toEqual(['2026-11-05', '2026-11-25', '2026-12-05'])
    const [first] = expectedPays(data, '2026-12-06')
    expect(first).toMatchObject({ id: 'income-i0-2026-11-05', sourceId: 'i0', name: 'Second job', amount: 20_000 })
  })

  it('stops expecting a deleted source, and a source answer only counts for its own payday', () => {
    expect(dates(setup({ startDate: '2026-11-20', incomes: [{ deleted: true }] }), '2026-11-24')).toEqual([])
    const data = setup({ startDate: '2026-11-20', incomes: [{ startDate: '2026-10-06' }], transactions: [{ id: 'income-i0-2026-11-05', incomeId: 'i0', date: '2026-11-05', categoryId: 'inc-side' }] })
    expect(dates(data, '2026-12-06')).toEqual(['2026-11-25', '2026-12-05'])
  })

  it('a source in the salary category never answers the salary', () => {
    const data = setup({ startDate: '2026-11-01', transactions: [{ id: 'income-i0-2026-11-25', incomeId: 'i0', date: '2026-11-25' }] })
    expect(dates(data, '2026-11-30')).toEqual(['2026-11-25'])
  })
})

describe('after the pay schedule changes', () => {
  const since = { frequency: 'weekly', anchor: '2026-11-03', amount: 15_000, since: '2026-11-05' } as const

  it('asks nothing about paydays before the change, only those after', () => {
    expect(dates(setup({ salary: since }), '2026-11-05')).toEqual([])
    expect(dates(setup({ salary: since }), '2026-11-20')).toEqual(['2026-11-10', '2026-11-17'])
  })

  it('takes the salary of the cycle it changed in from settings, like the cycle of setup', () => {
    const data = setup({ salary: since })
    expect(budgetSummary(data, '2026-11-05')).toMatchObject({ salary: 15_000, waitingFor: 0 })
    expect(budgetSummary(data, '2026-11-10')).toMatchObject({ salary: 0, waitingFor: 15_000 })
  })

  it('ignores a change from before setup', () => {
    expect(dates(setup({ salary: { since: '2026-01-01' }, startDate: '2026-11-10' }), '2026-11-30')).toEqual(['2026-11-25'])
  })
})

describe('scheduledPays', () => {
  it('lists what is due after today in the range', () => {
    const data = setup({ startDate: '2026-11-20', incomes: [{}] })
    expect(scheduledPays(data, { start: '2026-11-26', end: '2026-12-24' }, '2026-11-26').map((p) => p.payDate)).toEqual(['2026-12-05'])
    expect(scheduledPays(data, { start: '2026-11-26', end: '2026-12-01' }, '2026-11-26')).toEqual([])
  })
})

describe('salaryCountedOn', () => {
  it('moves a salary a little early to its payday, and leaves the rest', () => {
    expect(salaryCountedOn({ date: '2026-11-23' }, MONTHLY)).toBe('2026-11-25')
    expect(salaryCountedOn({ date: '2026-11-26' }, MONTHLY)).toBe('2026-11-26')
    expect(salaryCountedOn({ date: '2026-11-20' }, MONTHLY)).toBe('2026-11-20')
    expect(salaryCountedOn({ date: '2026-11-23' }, { ...MONTHLY, frequency: 'irregular' })).toBe('2026-11-23')
  })
})

describe('left to spend starts from what arrived', () => {
  const bills = [{ amount: 8_500, dueDay: 1 }]
  const TODAY = '2026-11-26'

  it('shows nothing to spend while the salary is on its way', () => {
    const summary = budgetSummary(setup({ bills }), TODAY)
    expect(summary).toMatchObject({ salary: 0, waitingFor: 60_000, leftToSpend: -8_500, safePerDay: 0 })
    expect(leftShown(summary)).toBe(0)
    expect(summary.leftToSpend + summary.waitingFor).toBe(51_500)
  })

  it('counts it once it arrives, at the amount that arrived', () => {
    const summary = budgetSummary(setup({ bills, transactions: [{ id: 'salary-2026-11-25', source: 'salary', date: '2026-11-26', amount: 55_000 }] }), TODAY)
    expect(summary).toMatchObject({ salary: 55_000, waitingFor: 0, leftToSpend: 46_500 })
  })

  it('shows an unpaid month as it is, and says so', () => {
    const summary = budgetSummary(setup({ bills, transactions: [{ id: 'salary-2026-11-25', source: 'salary', date: '2026-11-25', deleted: true }] }), TODAY)
    expect(summary).toMatchObject({ salary: 0, waitingFor: 0, leftToSpend: -8_500 })
    expect(leftShown(summary)).toBe(-8_500)
  })

  it('never counts a salary and its hand-logged twin as anything but what arrived', () => {
    const summary = budgetSummary(setup({ transactions: [{ date: '2026-11-25' }] }), TODAY)
    expect(summary).toMatchObject({ salary: 60_000, otherIncome: 0, waitingFor: 0 })
  })

  it('counts a salary a little early in the cycle it pays for, not the one ending', () => {
    const data = setup({ transactions: [{ date: '2026-11-23', amount: 60_000 }] })
    expect(budgetSummary(data, TODAY).salary).toBe(60_000)
    expect(budgetSummary(data, '2026-11-24').salary).toBe(0)
  })

  it('counts a very late salary when it arrives, because that is when it can be spent', () => {
    const data = setup({ transactions: [{ id: 'salary-2026-10-25', source: 'salary', date: '2026-11-26' }] })
    expect(budgetSummary(data, TODAY)).toMatchObject({ salary: 60_000, waitingFor: 60_000 })
  })

  it('uses what was really paid in past cycles, not today\'s salary', () => {
    const data = setup({ salary: { amount: 90_000 }, transactions: [{ id: 'salary-2026-10-25', source: 'salary', date: '2026-10-25', amount: 60_000 }] })
    const past = budgetSummary(data, TODAY, { start: '2026-10-25', end: '2026-11-24', days: 31 })
    expect(past).toMatchObject({ salary: 60_000, waitingFor: 0, leftToSpend: 60_000 })
  })

  it('waits for nothing when looking at a past cycle with no answer', () => {
    const past = budgetSummary(setup(), TODAY, { start: '2026-10-25', end: '2026-11-24', days: 31 })
    expect(past).toMatchObject({ salary: 0, waitingFor: 0 })
  })

  it('in the cycle of setup, takes the salary from settings: it came before the starting balances', () => {
    const data = setup({ startDate: '2026-11-10' })
    const first = budgetSummary(data, '2026-11-12')
    expect(first).toMatchObject({ salary: 60_000, waitingFor: 0, leftToSpend: 60_000 })
    expect(budgetSummary(data, '2026-11-25')).toMatchObject({ salary: 0, waitingFor: 60_000 })
  })

  it('adds income sources when they arrive, and notes what is still to come', () => {
    const data = setup({ incomes: [{}] })
    const before = budgetSummary({ ...data, transactions: [{ id: 'salary-2026-11-25', createdAt: '', updatedAt: '', type: 'income', source: 'salary', categoryId: 'inc-salary', amount: 60_000, date: '2026-11-25', accountId: 'acc-bank' }] }, TODAY)
    expect(before).toMatchObject({ salary: 60_000, otherIncome: 0, stillExpected: 20_000, leftToSpend: 60_000 })
    const after = budgetSummary(
      {
        ...data,
        transactions: [
          { id: 'salary-2026-11-25', createdAt: '', updatedAt: '', type: 'income', source: 'salary', categoryId: 'inc-salary', amount: 60_000, date: '2026-11-25', accountId: 'acc-bank' },
          { id: 'income-i0-2026-12-05', createdAt: '', updatedAt: '', type: 'income', incomeId: 'i0', categoryId: 'inc-side', amount: 18_000, date: '2026-12-05', accountId: 'acc-bank' },
        ],
      },
      '2026-12-05',
    )
    expect(after).toMatchObject({ salary: 60_000, otherIncome: 18_000, stillExpected: 0, waitingFor: 0, leftToSpend: 78_000 })
  })

  it('leaves another currency out of the budget altogether', () => {
    const data = setup({ incomes: [{ currency: 'USD', amount: 500, payday: 26 }], transactions: [{ id: 'salary-2026-11-25', source: 'salary', date: '2026-11-25' }] })
    expect(expectedPays(data, TODAY).map((p) => p.currency)).toEqual(expect.arrayContaining(['USD']))
    expect(budgetSummary(data, TODAY)).toMatchObject({ salary: 60_000, waitingFor: 0, stillExpected: 0 })
    expect(monthlyIncomes(data.incomes, 'DZD')).toBe(0)
  })

  it('leaves "over budget" alone while pay is on its way', () => {
    const data = setup({ transactions: [{ amount: 5_000, categoryId: 'inc-side', date: TODAY }, { type: 'expense', amount: 9_000, categoryId: 'cat-groceries', date: TODAY, accountId: 'acc-cash' }] })
    const summary = budgetSummary(data, TODAY)
    expect(summary.waitingFor).toBe(60_000)
    expect(budgetAlerts(summary, 80).filter((a) => a.id.startsWith('budget') || a.id === 'too-fast')).toEqual([])
  })
})

describe('irregular pay', () => {
  const irregular = { frequency: 'irregular', payday: 1, amount: 0 } as const
  const TODAY = '2026-11-15'

  it('budgets from what is received so far', () => {
    const data = setup({ salary: irregular, transactions: [{ amount: 12_000, categoryId: 'inc-side', date: '2026-11-03' }, { amount: 5_000, categoryId: 'inc-other', date: '2026-11-10' }] })
    expect(budgetSummary(data, TODAY)).toMatchObject({ hasPay: true, irregular: true, onEstimate: false, salary: 17_000, otherIncome: 0, leftToSpend: 17_000, waitingFor: 0 })
  })

  it('has a budget screen before anything arrives', () => {
    expect(budgetSummary(setup({ salary: irregular }), TODAY)).toMatchObject({ hasPay: true, salary: 0, leftToSpend: 0 })
  })

  it('budgets from an estimate, until more than that has arrived', () => {
    const estimate = { ...irregular, amount: 40_000 }
    expect(budgetSummary(setup({ salary: estimate, transactions: [{ amount: 12_000, categoryId: 'inc-side', date: '2026-11-03' }] }), TODAY)).toMatchObject({ onEstimate: true, salary: 40_000, received: 12_000, leftToSpend: 40_000 })
    expect(budgetSummary(setup({ salary: estimate, transactions: [{ amount: 55_000, categoryId: 'inc-side', date: '2026-11-03' }] }), TODAY)).toMatchObject({ salary: 55_000, received: 55_000 })
  })

  it('leaves money from a cash count out, as with any pay', () => {
    const data = setup({ salary: irregular, transactions: [{ amount: 900, categoryId: 'inc-other', date: '2026-11-03', source: 'cash-count' }] })
    expect(budgetSummary(data, TODAY).salary).toBe(0)
  })

  it('still gets a pending source on top of what is received', () => {
    const data = setup({ salary: irregular, incomes: [{ payday: 10 }] })
    expect(budgetSummary(data, TODAY)).toMatchObject({ waitingFor: 20_000, salary: 0 })
  })

  it('has no one waiting on an estimate', () => {
    const data = setup({ salary: { ...irregular, amount: 40_000 }, incomes: [{ payday: 10 }] })
    expect(budgetSummary(data, TODAY)).toMatchObject({ waitingFor: 0, stillExpected: 0, salary: 40_000 })
  })
})

describe('weekly and biweekly pay', () => {
  const weekly = { frequency: 'weekly', anchor: '2026-11-03', amount: 15_000 } as const
  const paid = { id: 'salary-2026-11-10', source: 'salary', date: '2026-11-10', amount: 15_000 } as const

  it('runs the budget over the week, with a share of the monthly bills, goals and limits', () => {
    const data = setup({ salary: weekly, startDate: '2026-10-01', bills: [{ amount: 52_000 }], transactions: [paid] })
    data.goals = [{ id: 'g', createdAt: '', updatedAt: '', name: 'Trip', icon: 'plane', target: 100_000, monthlyContribution: 5_200, archived: false }]
    data.categories = data.categories.map((c) => (c.id === 'cat-groceries' ? { ...c, monthlyBudget: 26_000 } : c))
    const summary = budgetSummary(data, '2026-11-12')
    expect(summary.cycle).toEqual({ start: '2026-11-10', end: '2026-11-16', days: 7 })
    expect(summary).toMatchObject({ salary: 15_000, billsReserved: 12_000, savingsReserved: 1_200, leftToSpend: 1_800 })
    // Shares come out in whole money, however the month divides.
    expect(budgetSummary({ ...data, bills: [{ ...data.bills[0], amount: 8_500 }] }, '2026-11-12').billsReserved).toBe(1_962)
    expect(summary.share).toBeCloseTo(12 / 52)
    expect(summary.categories[0].budget).toBe(6_000)
  })

  it('reserves the same share whichever week the rent falls in', () => {
    const data = setup({ salary: weekly, startDate: '2026-10-01', bills: [{ amount: 52_000, dueDay: 12 }], transactions: [paid] })
    expect(budgetSummary(data, '2026-11-12').billsReserved).toBe(12_000)
    expect(budgetSummary(data, '2026-11-18').billsReserved).toBe(12_000)
  })

  it('keeps a bill reserved in its share when it gets paid, and out of everyday spending', () => {
    const data = setup({ salary: weekly, startDate: '2026-10-01', bills: [{ amount: 52_000 }], transactions: [paid, { type: 'expense', amount: 52_000, billId: 'b0', categoryId: 'cat-bills', date: '2026-11-11' }] })
    expect(budgetSummary(data, '2026-11-12')).toMatchObject({ billsReserved: 12_000, flexibleSpent: 0, leftToSpend: 3_000 })
  })

  it('stays on calendar months and the salary from settings until the date is set, and asks for it', () => {
    const data = setup({ salary: { frequency: 'weekly', amount: 15_000 }, startDate: '2026-10-01' })
    const summary = budgetSummary(data, '2026-11-12')
    expect(summary.cycle.days).toBe(30)
    expect(summary).toMatchObject({ salary: 65_000, waitingFor: 0, share: 1 })
    expect(homeAlerts(data, '2026-11-12').map((a) => a.kind)).toContain('set-payday')
    expect(homeAlerts(setup({ salary: weekly, startDate: '2026-10-01' }), '2026-11-12').map((a) => a.kind)).not.toContain('set-payday')
  })
})

describe('what income sources add to the monthly plan', () => {
  it('counts sources in the main currency, per month', () => {
    const data = setup({ incomes: [{ amount: 20_000 }, { amount: 12_000, frequency: 'weekly', anchor: '2026-11-03' }, { amount: 100, currency: 'USD' }, { amount: 9, deleted: true }] })
    expect(monthlyIncomes(data.incomes, 'DZD')).toBe(72_000)
    expect(plannedFreeToSpend(data.profile, [], [], 0, 72_000)).toBe(132_000)
    expect(monthlyRoomForGoal(data.profile, [], [], undefined, 0, 72_000)).toBe(132_000)
  })

  it('leaves a goal unlimited with no pay planned at all, and limited by a source alone', () => {
    const none = setup({ salary: { frequency: 'irregular', amount: 0 } })
    expect(monthlyRoomForGoal(none.profile, [], [])).toBeNull()
    expect(monthlyRoomForGoal(none.profile, [], [], undefined, 0, 20_000)).toBe(20_000)
  })
})
