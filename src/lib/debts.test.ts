import { describe, expect, it } from 'vitest'
import { createInitialData } from '../store/defaults'
import type { AppData, Debt, Transaction } from '../types'
import { homeAlerts } from './alerts'
import { budgetSummary, monthlyRoomForGoal, plannedFreeToSpend } from './budget'
import { getPayCycle } from './dates'
import { debtMoveType, debtOwed, debtPlan, debtTotals, debtView, debtViews, findDebtWith, isRepayment, monthlyDebtPayments } from './debts'
import { periodTotals } from './stats'
import { checkDebt, checkTransaction } from './validation'
import { walletBalance } from './wallets'

// Pay cycle 25 Oct – 24 Nov.
const TODAY = '2026-11-15'
const SALARY = { amount: 60_000, frequency: 'monthly', payday: 25, accountId: 'acc-bank' } as const
const CYCLE = getPayCycle(TODAY, SALARY)

const debt = (fields: Partial<Debt> = {}): Debt => ({
  id: 'd1',
  createdAt: '',
  updatedAt: '',
  direction: 'lent',
  person: 'Sami',
  startingAmount: 0,
  date: '2026-10-01',
  archived: false,
  ...fields,
})

const move = (type: 'debt-in' | 'debt-out', amount: number, date = TODAY, fields: Partial<Transaction> = {}): Transaction => ({
  id: `${type}-${amount}-${date}`,
  createdAt: '',
  updatedAt: '',
  type,
  amount,
  date,
  accountId: 'acc-bank',
  debtId: 'd1',
  ...fields,
})

function setup(debts: Debt[], transactions: Transaction[]): AppData {
  const data = createInitialData(new Date(2026, 9, 25))
  data.profile.salary = SALARY
  return { ...data, debts, transactions }
}

describe('which way a move goes', () => {
  it('mirrors between lending and borrowing', () => {
    expect(isRepayment({ direction: 'lent' }, 'debt-in')).toBe(true)
    expect(isRepayment({ direction: 'lent' }, 'debt-out')).toBe(false)
    expect(isRepayment({ direction: 'borrowed' }, 'debt-out')).toBe(true)
    expect(isRepayment({ direction: 'borrowed' }, 'debt-in')).toBe(false)
    expect(debtMoveType({ direction: 'lent' }, true)).toBe('debt-in')
    expect(debtMoveType({ direction: 'lent' }, false)).toBe('debt-out')
    expect(debtMoveType({ direction: 'borrowed' }, true)).toBe('debt-out')
    expect(debtMoveType({ direction: 'borrowed' }, false)).toBe('debt-in')
  })
})

describe('findDebtWith', () => {
  it('matches the person and side, ignoring capitals and spaces', () => {
    const sami = debt()
    expect(findDebtWith([sami], ' SAMI ', 'lent')).toBe(sami)
    expect(findDebtWith([sami], 'Sami', 'borrowed')).toBeUndefined()
    expect(findDebtWith([sami], 'Sam', 'lent')).toBeUndefined()
  })

  it('skips closed and deleted debts, and includes a settled one', () => {
    expect(findDebtWith([debt({ archived: true })], 'Sami', 'lent')).toBeUndefined()
    expect(findDebtWith([debt({ deleted: true })], 'Sami', 'lent')).toBeUndefined()
    expect(findDebtWith([debt({ startingAmount: 0 })], 'Sami', 'lent')).toBeDefined()
  })
})

describe('debtOwed', () => {
  it('adds money lent and takes off what came back', () => {
    expect(debtOwed(debt(), [move('debt-out', 20_000), move('debt-in', 5_000)])).toBe(15_000)
  })

  it('does the same the other way round for borrowed money', () => {
    expect(debtOwed(debt({ direction: 'borrowed' }), [move('debt-in', 20_000), move('debt-out', 5_000)])).toBe(15_000)
  })

  it('starts from what was already owed', () => {
    expect(debtOwed(debt({ direction: 'borrowed', startingAmount: 120_000 }), [move('debt-out', 10_000)])).toBe(110_000)
  })

  it('ignores deleted entries and other debts', () => {
    const deleted = move('debt-in', 1_000, TODAY, { deleted: true })
    const other = move('debt-in', 2_000, TODAY, { debtId: 'd2' })
    expect(debtOwed(debt({ startingAmount: 5_000 }), [deleted, other])).toBe(5_000)
  })

  it('never goes below zero', () => {
    expect(debtOwed(debt({ startingAmount: 1_000 }), [move('debt-in', 5_000)])).toBe(0)
  })

  it('can be read as of a date', () => {
    expect(debtOwed(debt({ startingAmount: 5_000 }), [move('debt-in', 1_000, '2026-11-20')], TODAY)).toBe(5_000)
  })
})

describe('instalments', () => {
  const fridge = (fields: Partial<Debt> = {}) => debt({ direction: 'borrowed', person: 'Condor', startingAmount: 120_000, monthlyPayment: 10_000, firstPaymentDate: '2026-10-28', ...fields })

  it('asks for one payment a month, on the day of the first one', () => {
    expect(debtPlan(fridge(), [], CYCLE)).toEqual({ planned: 10_000, paid: 0, unpaid: 10_000, nextDate: '2026-10-28' })
  })

  it('counts payments made this cycle', () => {
    expect(debtPlan(fridge(), [move('debt-out', 4_000, '2026-11-01')], CYCLE)).toEqual({ planned: 10_000, paid: 4_000, unpaid: 6_000, nextDate: '2026-10-28' })
    expect(debtPlan(fridge(), [move('debt-out', 10_000, '2026-11-01')], CYCLE)).toEqual({ planned: 10_000, paid: 10_000, unpaid: 0, nextDate: undefined })
  })

  it('ignores payments from another cycle', () => {
    expect(debtPlan(fridge(), [move('debt-out', 10_000, '2026-10-01')], CYCLE).unpaid).toBe(10_000)
  })

  it('never asks for more than is owed', () => {
    expect(debtPlan(fridge({ startingAmount: 3_000 }), [], CYCLE).planned).toBe(3_000)
  })

  it('finishes when the debt is paid off', () => {
    expect(debtPlan(fridge({ startingAmount: 10_000 }), [move('debt-out', 10_000, '2026-10-01')], CYCLE).planned).toBe(0)
  })

  it('asks for nothing before the first payment', () => {
    expect(debtPlan(fridge({ firstPaymentDate: '2026-12-05' }), [], CYCLE).planned).toBe(0)
  })

  it('stops for a closed or deleted debt, and money lent has no plan', () => {
    expect(debtPlan(fridge({ archived: true }), [], CYCLE).planned).toBe(0)
    expect(debtPlan(fridge({ deleted: true }), [], CYCLE).planned).toBe(0)
    expect(debtPlan(fridge({ direction: 'lent' }), [], CYCLE).planned).toBe(0)
  })

  it('comes off what is free for limits and goals', () => {
    const debts = [fridge(), fridge({ id: 'd2', monthlyPayment: 5_000 }), fridge({ id: 'd3', archived: true }), fridge({ id: 'd4', startingAmount: 0 })]
    const payments = monthlyDebtPayments(debts, [])
    expect(payments).toBe(15_000)
    expect(plannedFreeToSpend({ salary: SALARY }, [], [], payments)).toBe(45_000)
    expect(monthlyRoomForGoal({ salary: SALARY }, [], [], undefined, payments)).toBe(45_000)
  })
})

describe('debtView', () => {
  it('reports progress on what was ever owed', () => {
    const view = debtView(debt(), [move('debt-out', 20_000), move('debt-in', 5_000)], CYCLE, TODAY)
    expect(view).toMatchObject({ owed: 15_000, total: 20_000, repaid: 5_000, progress: 0.25, status: 'open' })
  })

  it('is settled once nothing is owed, closed when closed', () => {
    expect(debtView(debt(), [move('debt-out', 500), move('debt-in', 500)], CYCLE, TODAY).status).toBe('settled')
    expect(debtView(debt({ startingAmount: 500, archived: true }), [], CYCLE, TODAY).status).toBe('closed')
  })

  it('follows its due date', () => {
    const owing = { startingAmount: 500 }
    expect(debtView(debt({ ...owing, dueDate: '2026-11-14' }), [], CYCLE, TODAY)).toMatchObject({ status: 'overdue', nextDate: '2026-11-14', nextAmount: 500 })
    expect(debtView(debt({ ...owing, dueDate: '2026-11-18' }), [], CYCLE, TODAY).status).toBe('due-soon')
    expect(debtView(debt({ ...owing, dueDate: '2026-11-19' }), [], CYCLE, TODAY).status).toBe('open')
  })

  it('puts an unpaid instalment before the due date', () => {
    const borrowed = debt({ direction: 'borrowed', startingAmount: 50_000, dueDate: '2027-06-01', monthlyPayment: 10_000, firstPaymentDate: '2026-11-17' })
    expect(debtView(borrowed, [], CYCLE, TODAY)).toMatchObject({ status: 'due-soon', nextDate: '2026-11-17', nextAmount: 10_000 })
  })

  it('goes back to the due date once this cycle is paid', () => {
    const borrowed = debt({ direction: 'borrowed', startingAmount: 50_000, dueDate: '2027-06-01', monthlyPayment: 10_000, firstPaymentDate: '2026-11-17' })
    expect(debtView(borrowed, [move('debt-out', 10_000)], CYCLE, TODAY)).toMatchObject({ status: 'open', nextDate: '2027-06-01', nextAmount: 40_000 })
  })
})

describe('debtViews and debtTotals', () => {
  const debts = [
    debt({ id: 'open', person: 'Open', startingAmount: 100 }),
    debt({ id: 'late', person: 'Late', direction: 'borrowed', startingAmount: 200, dueDate: '2026-11-01' }),
    debt({ id: 'closed', person: 'Closed', startingAmount: 400, archived: true }),
    debt({ id: 'gone', person: 'Gone', startingAmount: 800, deleted: true }),
  ]

  it('lists what needs attention first and leaves out deleted debts', () => {
    expect(debtViews(debts, [], CYCLE, TODAY).map((v) => v.debt.id)).toEqual(['late', 'open', 'closed'])
  })

  it('adds up each side, without closed debts', () => {
    expect(debtTotals(debtViews(debts, [], CYCLE, TODAY), 'DZD')).toEqual({ iOwe: [{ currency: 'DZD', amount: 200 }], owedToMe: [{ currency: 'DZD', amount: 100 }] })
  })
})

describe('debts and the budget', () => {
  it('lending takes from left to spend, being paid back adds to it', () => {
    const lent = budgetSummary(setup([debt()], [move('debt-out', 5_000)]), TODAY)
    expect(lent).toMatchObject({ debtOut: 5_000, debtIn: 0, flexibleBudget: 55_000, leftToSpend: 55_000 })
    const back = budgetSummary(setup([debt()], [move('debt-out', 5_000, '2026-10-01'), move('debt-in', 2_000)]), TODAY)
    expect(back).toMatchObject({ debtOut: 0, debtIn: 2_000, flexibleBudget: 62_000 })
  })

  it('borrowing adds, repaying takes away', () => {
    const borrowed = debt({ direction: 'borrowed' })
    expect(budgetSummary(setup([borrowed], [move('debt-in', 10_000)]), TODAY).flexibleBudget).toBe(70_000)
    expect(budgetSummary(setup([borrowed], [move('debt-in', 10_000, '2026-10-01'), move('debt-out', 3_000)]), TODAY).flexibleBudget).toBe(57_000)
  })

  it('reserves an unpaid instalment like a bill, and counts it once when paid', () => {
    const fridge = debt({ direction: 'borrowed', startingAmount: 120_000, monthlyPayment: 10_000, firstPaymentDate: '2026-10-28' })
    expect(budgetSummary(setup([fridge], []), TODAY)).toMatchObject({ debtOut: 10_000, flexibleBudget: 50_000 })
    expect(budgetSummary(setup([fridge], [move('debt-out', 4_000)]), TODAY)).toMatchObject({ debtOut: 10_000, flexibleBudget: 50_000 })
    expect(budgetSummary(setup([fridge], [move('debt-out', 10_000)]), TODAY)).toMatchObject({ debtOut: 10_000, flexibleBudget: 50_000 })
    expect(budgetSummary(setup([fridge], [move('debt-out', 15_000)]), TODAY)).toMatchObject({ debtOut: 15_000, flexibleBudget: 45_000 })
  })

  it('still counts money that moved for a deleted debt', () => {
    expect(budgetSummary(setup([debt({ deleted: true })], [move('debt-out', 5_000)]), TODAY).debtOut).toBe(5_000)
  })

  it('is neither spending nor income', () => {
    const data = setup([debt()], [move('debt-out', 5_000), move('debt-in', 2_000)])
    const summary = budgetSummary(data, TODAY)
    expect(summary).toMatchObject({ spent: 0, income: 0, saved: 0, flexibleSpent: 0 })
    expect(periodTotals(data.transactions, data.accounts, CYCLE)).toMatchObject({ spent: 0, income: 0, saved: 0 })
  })
})

describe('debts and wallets', () => {
  it('moves the wallet the money went through', () => {
    const data = setup([debt()], [move('debt-out', 5_000), move('debt-in', 2_000)])
    const bank = data.accounts.find((a) => a.id === 'acc-bank')!
    expect(walletBalance({ ...bank, startingBalance: 10_000, startDate: '2026-01-01' }, data.transactions)).toBe(7_000)
  })
})

describe('checkTransaction for debts', () => {
  const entry = { accountId: 'acc-bank', date: TODAY, debtId: 'd1' }

  it('needs a debt that still exists', () => {
    expect(checkTransaction({ ...entry, type: 'debt-out', amount: 100, debtId: undefined }, setup([], []))).toMatch(/Choose a debt/)
    expect(checkTransaction({ ...entry, type: 'debt-out', amount: 100 }, setup([debt({ deleted: true })], []))).toMatch(/Choose a debt/)
  })

  it('refuses to repay more than is owed', () => {
    const data = setup([debt({ startingAmount: 500 })], [])
    expect(checkTransaction({ ...entry, type: 'debt-in', amount: 500 }, data)).toBeNull()
    expect(checkTransaction({ ...entry, type: 'debt-in', amount: 501 }, data)).toMatch(/Only .*500.* is still owed/)
    expect(checkTransaction({ ...entry, type: 'debt-in', amount: 1 }, setup([debt()], []))).toMatch(/Nothing is owed/)
  })

  it('lets a debt grow by any amount', () => {
    expect(checkTransaction({ ...entry, type: 'debt-out', amount: 1_000_000 }, setup([debt()], []))).toBeNull()
  })

  it('leaves a payment’s own earlier amount out when it is edited', () => {
    const paid = move('debt-in', 400)
    const data = setup([debt({ startingAmount: 500 })], [paid])
    expect(checkTransaction({ ...paid, amount: 500 }, data)).toBeNull()
    expect(checkTransaction({ ...paid, amount: 501 }, data)).toMatch(/still owed/)
  })
})

describe('checkDebt', () => {
  it('needs a person and sensible amounts', () => {
    expect(checkDebt(debt())).toBeNull()
    expect(checkDebt(debt({ person: '  ' }))).toMatch(/who this debt is with/)
    expect(checkDebt(debt({ startingAmount: -1 }))).toBeTruthy()
    expect(checkDebt(debt({ monthlyPayment: -1 }))).toMatch(/negative/)
  })

  it('needs a first payment date with a monthly payment', () => {
    expect(checkDebt(debt({ monthlyPayment: 1_000 }))).toMatch(/first payment/)
    expect(checkDebt(debt({ monthlyPayment: 1_000, firstPaymentDate: TODAY }))).toBeNull()
  })
})

describe('debt alerts', () => {
  const alerts = (debts: Debt[]) => homeAlerts(setup(debts, []), TODAY).filter((a) => a.kind === 'debt-due' || a.kind === 'debt-overdue')

  it('warns about what you owe more firmly than what you’re owed', () => {
    expect(alerts([debt({ direction: 'borrowed', startingAmount: 500, dueDate: '2026-11-01' })])[0]).toMatchObject({ kind: 'debt-overdue', tone: 'crit', amount: 500, person: 'Sami' })
    expect(alerts([debt({ startingAmount: 500, dueDate: '2026-11-01' })])[0]).toMatchObject({ kind: 'debt-overdue', tone: 'warn' })
    expect(alerts([debt({ startingAmount: 500, dueDate: '2026-11-16' })])[0]).toMatchObject({ kind: 'debt-due', tone: 'info' })
  })

  it('stays quiet when it isn’t close, is settled or closed', () => {
    expect(alerts([debt({ startingAmount: 500, dueDate: '2026-12-20' })])).toEqual([])
    expect(alerts([debt({ dueDate: '2026-11-01' })])).toEqual([])
    expect(alerts([debt({ startingAmount: 500, dueDate: '2026-11-01', archived: true })])).toEqual([])
  })
})
