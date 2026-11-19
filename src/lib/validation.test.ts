import { describe, expect, it } from 'vitest'
import { createInitialData } from '../store/defaults'
import { previewExample } from '../test/previewExample'
import { checkBill, checkIncomeSource, checkProfile, checkPutAsideRoom, checkTransaction, isValidDate } from './validation'

describe('checkTransaction', () => {
  const data = previewExample()
  const expense = { type: 'expense', amount: 500, date: '2026-11-15', accountId: 'acc-cash', categoryId: 'cat-groceries' } as const

  it('accepts a valid expense', () => {
    expect(checkTransaction(expense, data)).toBeNull()
  })

  it('explains what is wrong', () => {
    expect(checkTransaction({ ...expense, amount: 0 }, data)).toBe('Enter an amount above 0.')
    expect(checkTransaction({ ...expense, amount: Number.NaN }, data)).toBe('Enter an amount above 0.')
    expect(checkTransaction({ ...expense, date: '2026-02-30' }, data)).toBe('Enter a valid date.')
    expect(checkTransaction({ ...expense, accountId: 'nope' }, data)).toBe('Pick a wallet.')
    expect(checkTransaction({ ...expense, categoryId: undefined }, data)).toBe('Pick a category.')
    expect(checkTransaction({ ...expense, categoryId: 'inc-salary' }, data)).toBe('Pick an expense category.')
  })

  it('checks transfers and goal deposits', () => {
    const transfer = { type: 'transfer', amount: 5_000, date: '2026-11-12', accountId: 'acc-bank' } as const
    expect(checkTransaction({ ...transfer, toAccountId: 'acc-cash' }, data)).toBeNull()
    expect(checkTransaction({ ...transfer, toAccountId: 'acc-bank' }, data)).toBe('Pick two different wallets.')
    expect(checkTransaction({ type: 'goal-deposit', amount: 1_000, date: '2026-11-12', accountId: 'acc-bank' }, data)).toBe('Pick a goal.')
  })

  // The trip has 40,000 of 80,000; the bank holds 9,450 on 15 November.
  const putAside = { type: 'goal-deposit', date: '2026-11-15', accountId: 'acc-bank', goalId: 'goal-trip' } as const

  it('never puts aside more than a goal still needs', () => {
    expect(checkTransaction({ ...putAside, accountId: 'acc-cash', amount: 40_001 }, data)).toBe('This goal only needs 40,000 DA more.')
    const reached = { ...data, goals: data.goals.map((g) => (g.id === 'goal-trip' ? { ...g, target: 40_000 } : g)) }
    expect(checkTransaction({ ...putAside, amount: 1 }, reached)).toBe('This goal has reached its target. Raise the target to put more aside.')
  })

  it('never puts aside more than the wallet holds', () => {
    expect(checkTransaction({ ...putAside, amount: 9_450 }, data)).toBeNull()
    expect(checkTransaction({ ...putAside, amount: 9_451 }, data)).toMatch(/^Only 9,450 DA is in /)
    // Editing one counts without its own earlier amount.
    const deposit = data.transactions.find((t) => t.type === 'goal-deposit' && t.goalId === 'goal-trip')!
    expect(checkTransaction({ ...deposit, amount: deposit.amount + 9_450 }, data)).toBeNull()
  })

  it('never puts aside more than the pay cycle has left', () => {
    // 9,700 is left to spend, and the emergency fund's 2,000 for this cycle isn't put aside yet.
    const emergency = { ...putAside, goalId: 'goal-emergency' }
    expect(checkPutAsideRoom({ ...emergency, amount: 11_700 }, data)).toBeNull()
    expect(checkPutAsideRoom({ ...emergency, amount: 11_701 }, data)).toBe('Only 11,700 DA is left this pay cycle after bills, goals and spending. Put aside that or less.')
    // The trip's 3,000 is already in, so only what's left to spend can go on top.
    expect(checkPutAsideRoom({ ...putAside, amount: 9_701 }, data)).toMatch(/^Only 9,700 DA is left/)
  })
})

describe('other checks', () => {
  const data = createInitialData()

  it('rejects impossible dates', () => {
    expect(isValidDate('2026-11-15')).toBe(true)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('15/11/2026')).toBe(false)
  })

  it('checks bill due days for the bill frequency', () => {
    const bill = { name: 'Gym', amount: 2_000, categoryId: 'cat-health', accountId: 'acc-cash', frequency: 'monthly', dueDay: 0, startDate: '2026-11-01', active: true } as const
    expect(checkBill(bill, data)).toBe('Pick a due day between 1 and 31.')
    expect(checkBill({ ...bill, frequency: 'weekly', dueDay: 0 }, data)).toBeNull()
    expect(checkBill({ ...bill, frequency: 'weekly', dueDay: 7 }, data)).toBe('Pick the weekday it is due.')
    expect(checkBill({ ...bill, name: '  ' }, data)).toBe('Enter a name for the bill.')
  })

  it('checks the payday and working time', () => {
    expect(checkProfile(data.profile, data)).toBeNull()
    expect(checkProfile({ ...data.profile, salary: { ...data.profile.salary, payday: 32 } }, data)).toBe('Pick a payday between 1 and 31.')
    expect(checkProfile({ ...data.profile, work: { hoursPerDay: 25, daysPerWeek: 5 } }, data)).toBe('Hours a day must be between 0 and 24.')
  })
})

describe('checkIncomeSource', () => {
  const data = previewExample()
  const source = { name: 'Rent', amount: 20_000, frequency: 'monthly', payday: 5, startDate: '2026-11-01', accountId: 'acc-bank', categoryId: 'inc-other' } as const

  it('accepts a monthly source, and a weekly one with a date', () => {
    expect(checkIncomeSource(source, data)).toBeNull()
    expect(checkIncomeSource({ ...source, frequency: 'weekly', anchor: '2026-11-03' }, data)).toBeNull()
  })

  it('refuses what it could not work with', () => {
    expect(checkIncomeSource({ ...source, name: '  ' }, data)).toBeTruthy()
    expect(checkIncomeSource({ ...source, amount: 0 }, data)).toBeTruthy()
    expect(checkIncomeSource({ ...source, payday: 40 }, data)).toBeTruthy()
    expect(checkIncomeSource({ ...source, frequency: 'biweekly' }, data)).toBeTruthy()
    expect(checkIncomeSource({ ...source, frequency: 'weekly', anchor: 'soon' }, data)).toBeTruthy()
    expect(checkIncomeSource({ ...source, accountId: 'gone' }, data)).toBeTruthy()
    expect(checkIncomeSource({ ...source, categoryId: 'cat-groceries' }, data)).toBeTruthy()
  })
})
