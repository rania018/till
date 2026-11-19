import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateStorage } from 'zustand/middleware'
import { budgetSummary } from '../lib/budget'
import { goalSaved } from '../lib/goals'
import { live } from '../lib/id'
import { ACCOUNT_IDS } from './defaults'
import { createAppStore, whenHydrated } from './store'

function memoryStorage(): StateStorage {
  const saved = new Map<string, string>()
  return {
    getItem: (name) => saved.get(name) ?? null,
    setItem: (name, value) => void saved.set(name, value),
    removeItem: (name) => void saved.delete(name),
  }
}

/** Set up with 60,000 DA paid on the 25th, on 15 November 2026, and 100,000 DA in the bank to put aside from. */
async function openStore() {
  const store = createAppStore(memoryStorage())
  await whenHydrated(store)
  const { profile, accounts } = store.getState()
  store.setState({
    profile: { ...profile, onboardingCompleted: true, startDate: '2026-01-01', salary: { ...profile.salary, amount: 60_000, payday: 25 } },
    accounts: accounts.map((a) => (a.id === ACCOUNT_IDS.bank ? { ...a, startingBalance: 100_000, startDate: '2026-01-01' } : a)),
  })
  return store
}

/** The pay of 25 October arrived, so there's budget to put aside more than the plan. */
function paid(store: Awaited<ReturnType<typeof openStore>>) {
  store.getState().addTransaction({ type: 'income', amount: 60_000, categoryId: 'inc-salary', source: 'salary', date: '2026-10-25', accountId: ACCOUNT_IDS.bank })
}

const insurance = { name: 'Car insurance', amount: 24_000, categoryId: 'cat-transport', accountId: ACCOUNT_IDS.bank, frequency: 'yearly' as const, dueDay: 20, startDate: '2027-03-01', active: true }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 15, 12))
})
afterEach(() => vi.useRealTimers())

describe('a bill with a fund', () => {
  it('starts a fund that’s ready by the next due date', async () => {
    const store = await openStore()
    const bill = store.getState().addBill(insurance, { fund: true })
    const fund = live(store.getState().goals).find((g) => g.fund?.billId === bill.id)
    // This month and the paydays on 25 Nov, Dec, Jan and Feb before 20 March: 24,000 ÷ 5.
    expect(fund).toMatchObject({ name: 'Car insurance', target: 24_000, monthlyContribution: 4_800, icon: 'receipt', archived: false })
  })

  it('plans the bill’s monthly cost when it’s due too soon to catch up', async () => {
    const store = await openStore()
    store.getState().addBill({ ...insurance, startDate: '2026-11-01' }, { fund: true })
    expect(store.getState().goals[0].monthlyContribution).toBe(2_000)
  })

  it('refuses a fund that doesn’t fit, and saves nothing', async () => {
    const store = await openStore()
    store.getState().addGoal({ name: 'House', icon: 'house', target: 1_000_000, monthlyContribution: 59_000, archived: false })
    expect(() => store.getState().addBill(insurance, { fund: true })).toThrow(/leaves/)
    expect(store.getState().bills).toHaveLength(0)
  })

  it('follows the bill’s amount, stops and starts again', async () => {
    const store = await openStore()
    const bill = store.getState().addBill(insurance, { fund: true })
    store.getState().updateBill(bill.id, { amount: 26_000 })
    expect(store.getState().goals[0].target).toBe(26_000)
    store.getState().updateBill(bill.id, {}, { fund: false })
    expect(store.getState().goals[0].archived).toBe(true)
    store.getState().updateBill(bill.id, {}, { fund: true })
    expect(store.getState().goals).toHaveLength(1)
    expect(store.getState().goals[0].archived).toBe(false)
  })

  it('pays the bill from what the fund holds', async () => {
    const store = await openStore()
    const bill = store.getState().addBill(insurance, { fund: true })
    const fund = store.getState().goals[0]
    paid(store)
    store.getState().putAside([{ goalId: fund.id, amount: 10_000 }], ACCOUNT_IDS.bank, '2026-11-01')
    const payment = store.getState().markBillPaid(bill.id)
    expect(payment).toMatchObject({ amount: 24_000, goalId: fund.id, fundAmount: 10_000 })
    expect(goalSaved(fund, store.getState().transactions)).toBe(0)
    // Nothing in it: paid from the wallet as before.
    const again = store.getState().markBillPaid(bill.id)
    expect(again.goalId).toBeUndefined()
    expect(again.fundAmount).toBeUndefined()
  })
})

describe('paying from a fund', () => {
  it('only an expense says which fund paid, and how much', async () => {
    const store = await openStore()
    const goal = store.getState().addGoal({ name: 'Ramadan', icon: 'moon', target: 30_000, monthlyContribution: 0, archived: false, fund: { repeat: 'hijri-yearly' }, deadline: '2027-02-08' })
    paid(store)
    store.getState().putAside([{ goalId: goal.id, amount: 5_000 }], ACCOUNT_IDS.bank)
    const unlinked = store.getState().addTransaction({ type: 'expense', amount: 1_000, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-groceries', goalId: goal.id })
    expect(unlinked.goalId).toBeUndefined()
    const income = store.getState().addTransaction({ type: 'income', amount: 1_000, accountId: ACCOUNT_IDS.cash, categoryId: 'inc-other', goalId: goal.id, fundAmount: 500 })
    expect(income.fundAmount).toBeUndefined()
    expect(income.goalId).toBeUndefined()
    const shop = store.getState().addTransaction({ type: 'expense', amount: 4_000, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-groceries', goalId: goal.id, fundAmount: 4_000 })
    // Editing can use what it took before, but no more than the fund held.
    store.getState().updateTransaction(shop.id, { amount: 5_000, fundAmount: 5_000 })
    expect(() => store.getState().updateTransaction(shop.id, { amount: 6_000, fundAmount: 6_000 })).toThrow('Only 5,000 DA is in this fund.')
    // Unticked: back to a plain expense.
    store.getState().updateTransaction(shop.id, { fundAmount: undefined })
    expect(store.getState().transactions.find((t) => t.id === shop.id)?.goalId).toBeUndefined()
  })

  it('puts aside for several funds at once, and takes it all back', async () => {
    const store = await openStore()
    const a = store.getState().addGoal({ name: 'School', icon: 'backpack', target: 20_000, monthlyContribution: 2_000, archived: false, fund: { repeat: 'yearly' }, deadline: '2027-09-01' })
    const b = store.getState().addGoal({ name: 'Eid', icon: 'gift', target: 40_000, monthlyContribution: 6_000, archived: false, fund: { repeat: 'hijri-yearly' }, deadline: '2027-05-16' })
    const before = budgetSummary(store.getState(), '2026-11-15').leftToSpend
    const undo = store.getState().putAside(
      [
        { goalId: a.id, amount: 2_000 },
        { goalId: b.id, amount: 6_000 },
      ],
      ACCOUNT_IDS.bank,
    )
    expect(live(store.getState().transactions).filter((t) => t.type === 'goal-deposit')).toHaveLength(2)
    // Already planned, so what's left to spend doesn't move.
    expect(budgetSummary(store.getState(), '2026-11-15').leftToSpend).toBe(before)
    undo()
    expect(live(store.getState().transactions)).toHaveLength(0)
  })
})
