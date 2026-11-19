import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import type { StateStorage } from 'zustand/middleware'
import { budgetSummary } from '../lib/budget'
import { todayISO } from '../lib/dates'
import { debtOwed, dueRepeats } from '../lib/debts'
import { expectedPays } from '../lib/income'
import { walletBalance } from '../lib/wallets'
import type { AppData } from '../types'
import { ACCOUNT_IDS, CATEGORY_IDS } from './defaults'
import { createIdbStorage, STORAGE_KEY } from './storage'
import { migrate } from './migrations'
import { createAppStore, pickData, whenHydrated } from './store'

const TODAY = '2026-11-15'

function memoryStorage(): StateStorage {
  const saved = new Map<string, string>()
  return {
    getItem: (name) => saved.get(name) ?? null,
    setItem: (name, value) => void saved.set(name, value),
    removeItem: (name) => void saved.delete(name),
  }
}

async function openStore(storage: StateStorage = memoryStorage()) {
  const store = createAppStore(storage)
  await whenHydrated(store)
  return store
}

describe('transactions', () => {
  it('adds a transaction with an id, timestamps and today’s date', async () => {
    const store = await openStore()
    const tx = store.getState().addTransaction({ type: 'expense', amount: 1_450, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-groceries' })
    expect(tx.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(tx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(store.getState().transactions).toEqual([tx])
  })

  it('rejects invalid input with a message for the user', async () => {
    const store = await openStore()
    expect(() => store.getState().addTransaction({ type: 'expense', amount: -5, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-groceries' })).toThrow(
      'Enter an amount above 0.',
    )
    expect(store.getState().transactions).toEqual([])
  })

  it('edits, deletes and restores', async () => {
    const store = await openStore()
    const { id } = store.getState().addTransaction({ type: 'expense', amount: 100, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-groceries', date: TODAY })

    store.getState().updateTransaction(id, { amount: 150, note: 'Bread' })
    expect(store.getState().transactions[0]).toMatchObject({ amount: 150, note: 'Bread' })
    expect(() => store.getState().updateTransaction(id, { amount: 0 })).toThrow('Enter an amount above 0.')

    store.getState().deleteTransaction(id)
    expect(store.getState().transactions[0].deleted).toBe(true)
    store.getState().restoreTransaction(id)
    expect(store.getState().transactions[0].deleted).toBe(false)
  })
})

describe('bills', () => {
  it('logs a bill payment as an expense linked to the bill', async () => {
    const store = await openStore()
    const bill = store.getState().addBill({
      name: 'Internet',
      amount: 2_000,
      categoryId: 'cat-bills',
      accountId: ACCOUNT_IDS.bank,
      frequency: 'monthly',
      dueDay: 17,
      startDate: '2026-10-25',
      active: true,
    })
    const paid = store.getState().markBillPaid(bill.id, { date: TODAY })
    expect(paid).toMatchObject({ type: 'expense', amount: 2_000, categoryId: 'cat-bills', accountId: ACCOUNT_IDS.bank, billId: bill.id, note: 'Internet' })
    expect(store.getState().markBillPaid(bill.id, { date: TODAY, amount: 2_150, accountId: ACCOUNT_IDS.cash })).toMatchObject({
      amount: 2_150,
      accountId: ACCOUNT_IDS.cash,
    })
  })
})

describe('goals', () => {
  it('takes money out of a goal, but never more than it holds', async () => {
    const store = await openStore()
    // Wallets start counting today, so the entries are dated today too.
    const today = todayISO()
    const goal = store.getState().addGoal({ name: 'Trip', icon: 'plane', target: 80_000, monthlyContribution: 3_000, startingAmount: 2_000, archived: false })
    store.getState().addTransaction({ type: 'income', amount: 3_000, accountId: ACCOUNT_IDS.bank, categoryId: 'inc-other', date: today })
    store.getState().addTransaction({ type: 'goal-deposit', amount: 3_000, accountId: ACCOUNT_IDS.bank, goalId: goal.id, date: today })
    const out = { type: 'goal-withdrawal', accountId: ACCOUNT_IDS.bank, goalId: goal.id, date: today } as const

    expect(() => store.getState().addTransaction({ ...out, amount: 5_001 })).toThrow('Only 5,000 DA is saved in this goal.')
    const withdrawal = store.getState().addTransaction({ ...out, amount: 5_000 })
    // Editing it checks against what's saved without it.
    expect(() => store.getState().updateTransaction(withdrawal.id, { amount: 4_000 })).not.toThrow()
    expect(() => store.getState().addTransaction({ ...out, amount: 1_001 })).toThrow('Only 1,000 DA is saved in this goal.')
  })

  it('keeps the monthly amounts within what the salary leaves after bills', async () => {
    const store = await openStore()
    const goal = (name: string, monthlyContribution: number) => ({ name, icon: 'target', target: 100_000, monthlyContribution, archived: false })
    // No salary yet: nothing to measure against.
    const trip = store.getState().addGoal(goal('Trip', 40_000))

    store.getState().updateProfile({ salary: { amount: 50_000, frequency: 'monthly', payday: 15, accountId: ACCOUNT_IDS.bank } })
    store.getState().addBill({ name: 'Rent', amount: 10_000, categoryId: 'cat-housing', accountId: ACCOUNT_IDS.bank, frequency: 'monthly', dueDay: 1, startDate: '2026-01-01', active: true })
    expect(() => store.getState().addGoal(goal('TV', 1))).toThrow('Bills, instalments and your other goals already take all of your salary.')

    store.getState().updateGoal(trip.id, { monthlyContribution: 30_000 })
    expect(() => store.getState().addGoal(goal('TV', 10_001))).toThrow('Your salary leaves 10,000 DA a month after bills, instalments and your other goals.')
    const tv = store.getState().addGoal(goal('TV', 10_000))
    expect(() => store.getState().updateGoal(trip.id, { monthlyContribution: 30_001 })).toThrow('leaves 30,000 DA')

    // A finished goal leaves the plan, which frees its amount for the others.
    store.getState().updateGoal(tv.id, { archived: true })
    expect(() => store.getState().updateGoal(trip.id, { monthlyContribution: 40_000 })).not.toThrow()
    expect(() => store.getState().updateGoal(tv.id, { archived: false })).toThrow('Bills, instalments and your other goals already take all of your salary.')
  })

  it('deletes a goal and brings it back', async () => {
    const store = await openStore()
    const goal = store.getState().addGoal({ name: 'Trip', icon: 'plane', target: 80_000, monthlyContribution: 0, archived: false })
    store.getState().deleteGoal(goal.id)
    expect(store.getState().goals[0].deleted).toBe(true)
    store.getState().restoreGoal(goal.id)
    expect(store.getState().goals[0].deleted).toBe(false)
  })
})

describe('wishlist', () => {
  it('saves a checked price, records the decision, and can be undone', async () => {
    const store = await openStore()
    expect(() => store.getState().addWishlistItem({ name: 'Earbuds', price: 0, status: 'thinking' })).toThrow('Enter a price above 0.')
    const item = store.getState().addWishlistItem({ name: '  Earbuds ', price: 8_900, categoryId: 'cat-shopping', status: 'thinking', remindAt: '2026-11-17T20:00:00.000Z' })
    expect(item.name).toBe('Earbuds')

    store.getState().decideWishlistItem(item.id, 'skipped')
    expect(store.getState().wishlist[0]).toMatchObject({ status: 'skipped', decidedAt: expect.any(String) })
    store.getState().deleteWishlistItem(item.id)
    expect(store.getState().wishlist[0].deleted).toBe(true)
    store.getState().restoreWishlistItem(item.id)
    expect(store.getState().wishlist[0].deleted).toBe(false)
  })
})

describe('cash count', () => {
  async function storeWithCash(startingBalance: number) {
    const store = await openStore()
    store.getState().updateAccount(ACCOUNT_IDS.cash, { startingBalance, startDate: '2026-10-25' })
    return store
  }
  const cash = (store: Awaited<ReturnType<typeof storeWithCash>>) =>
    walletBalance(store.getState().accounts.find((a) => a.id === ACCOUNT_IDS.cash)!, store.getState().transactions, TODAY)

  it('logs missing cash as untracked spending', async () => {
    const store = await storeWithCash(4_250)
    const adjustment = store.getState().recordCashCount(ACCOUNT_IDS.cash, 3_900, TODAY)
    expect(adjustment).toMatchObject({ type: 'expense', amount: 350, categoryId: CATEGORY_IDS.untracked, source: 'cash-count', date: TODAY })
    expect(cash(store)).toBe(3_900)
    expect(store.getState().accounts.find((a) => a.id === ACCOUNT_IDS.cash)!.lastCountedAt).toBeDefined()
  })

  it('logs extra cash as income, and nothing when the count matches', async () => {
    const store = await storeWithCash(4_250)
    expect(store.getState().recordCashCount(ACCOUNT_IDS.cash, 4_250, TODAY)).toBeNull()
    expect(store.getState().recordCashCount(ACCOUNT_IDS.cash, 4_500, TODAY)).toMatchObject({ type: 'income', amount: 250, categoryId: CATEGORY_IDS.otherIncome })
    expect(cash(store)).toBe(4_500)
  })
})

describe('salary', () => {
  async function paidStore() {
    const store = await openStore()
    store.getState().updateProfile({
      salary: { amount: 60_000, frequency: 'monthly', payday: 25, accountId: ACCOUNT_IDS.bank },
      startDate: '2026-10-01',
      onboardingCompleted: true,
    })
    store.getState().updateAccount(ACCOUNT_IDS.bank, { startDate: '2026-01-01' })
    const pays = () => expectedPays(store.getState(), '2026-11-30')
    const bank = () => walletBalance(store.getState().accounts.find((a) => a.id === ACCOUNT_IDS.bank)!, store.getState().transactions)
    return { store, pays, bank }
  }

  it('logs nothing until told: each payday waits for an answer', async () => {
    const { store, pays, bank } = await paidStore()
    expect(pays().map((p) => p.payDate)).toEqual(['2026-10-25', '2026-11-25'])
    expect(store.getState().transactions).toEqual([])
    expect(bank()).toBe(0)
  })

  it('confirms pay as expected, into the wallet, once', async () => {
    const { store, pays, bank } = await paidStore()
    store.getState().confirmPay(pays()[0])
    expect(store.getState().transactions).toHaveLength(1)
    expect(store.getState().transactions[0]).toMatchObject({ id: 'salary-2026-10-25', type: 'income', amount: 60_000, date: '2026-10-25', accountId: ACCOUNT_IDS.bank, source: 'salary' })
    expect(pays().map((p) => p.payDate)).toEqual(['2026-11-25'])
    expect(bank()).toBe(60_000)
  })

  it('confirms a different amount, day and wallet', async () => {
    const { store, pays } = await paidStore()
    store.getState().confirmPay(pays()[0], { amount: 41_000, date: '2026-10-28', accountId: ACCOUNT_IDS.cash })
    expect(store.getState().transactions[0]).toMatchObject({ amount: 41_000, date: '2026-10-28', accountId: ACCOUNT_IDS.cash })
    expect(pays().map((p) => p.payDate)).toEqual(['2026-11-25'])
  })

  it('refuses a confirmed amount that makes no sense, and logs nothing', async () => {
    const { store, pays } = await paidStore()
    expect(() => store.getState().confirmPay(pays()[0], { amount: 0 })).toThrow()
    expect(store.getState().transactions).toEqual([])
  })

  it('marks pay as not received, with no money moved, and stops asking', async () => {
    const { store, pays, bank } = await paidStore()
    store.getState().skipPay(pays()[0])
    expect(pays().map((p) => p.payDate)).toEqual(['2026-11-25'])
    expect(bank()).toBe(0)
  })

  it('asks again after either answer is undone', async () => {
    const { store, pays, bank } = await paidStore()
    const undoConfirm = store.getState().confirmPay(pays()[0])
    undoConfirm()
    expect(pays().map((p) => p.payDate)).toEqual(['2026-10-25', '2026-11-25'])
    expect(bank()).toBe(0)
    const undoSkip = store.getState().skipPay(pays()[0])
    undoSkip()
    expect(pays().map((p) => p.payDate)).toEqual(['2026-10-25', '2026-11-25'])
    // Answering again after an undo reuses the same record.
    store.getState().confirmPay(pays()[0])
    expect(store.getState().transactions).toHaveLength(1)
    expect(store.getState().transactions[0]).toMatchObject({ amount: 60_000 })
    expect(store.getState().transactions[0].deleted).toBeUndefined()
    expect(store.getState().transactions[0].reasked).toBeUndefined()
    expect(bank()).toBe(60_000)
  })

  it('treats deleting a confirmed salary as not received, and restoring it as received', async () => {
    const { store, pays, bank } = await paidStore()
    store.getState().confirmPay(pays()[0])
    store.getState().deleteTransaction('salary-2026-10-25')
    expect(pays().map((p) => p.payDate)).toEqual(['2026-11-25'])
    expect(bank()).toBe(0)
    store.getState().restoreTransaction('salary-2026-10-25')
    expect(bank()).toBe(60_000)
  })

  it('keeps income sources: wallet currency, answers by payday, delete and undo', async () => {
    const { store } = await paidStore()
    const usd = store.getState().addAccount({ name: 'USD', kind: 'bank', currency: 'USD', startingBalance: 0, startDate: '2026-10-01', archived: false })
    const source = store.getState().addIncomeSource({ name: ' Rent ', amount: 500, frequency: 'monthly', payday: 5, startDate: '2026-11-01', accountId: usd.id, categoryId: CATEGORY_IDS.otherIncome })
    expect(source).toMatchObject({ name: 'Rent', currency: 'USD' })

    const pay = expectedPays(store.getState(), '2026-11-06').find((p) => p.sourceId === source.id)!
    store.getState().confirmPay(pay)
    expect(store.getState().transactions[0]).toMatchObject({ id: `income-${source.id}-2026-11-05`, incomeId: source.id, currency: 'USD', note: 'Rent', amount: 500 })
    expect(store.getState().transactions[0].source).toBeUndefined()

    store.getState().updateIncomeSource(source.id, { accountId: ACCOUNT_IDS.bank, amount: 30_000 })
    expect(store.getState().incomes[0].currency).toBeUndefined()
    expect(() => store.getState().updateIncomeSource(source.id, { name: '' })).toThrow()

    store.getState().deleteIncomeSource(source.id)
    expect(expectedPays(store.getState(), '2026-12-06').some((p) => p.sourceId === source.id)).toBe(false)
    expect(store.getState().transactions[0].deleted).toBeUndefined()
    store.getState().restoreIncomeSource(source.id)
    expect(expectedPays(store.getState(), '2026-12-06').some((p) => p.sourceId === source.id)).toBe(true)
  })

  it('asks nothing about old paydays after a change of schedule', async () => {
    const { store, pays } = await paidStore()
    const { salary } = store.getState().profile
    store.getState().updateProfile({ salary: { ...salary, amount: 70_000 } })
    expect(store.getState().profile.salary.since).toBeUndefined()
    store.getState().updateProfile({ salary: { ...salary, frequency: 'weekly', anchor: '2026-11-03' } })
    expect(store.getState().profile.salary.since).toBe(todayISO())
    expect(pays().every((p) => p.payDate > todayISO())).toBe(true)
  })

  it('starts asking from setting a salary, not from setup', async () => {
    const store = await openStore()
    store.getState().finishOnboarding('2026-01-01')
    const { salary } = store.getState().profile
    store.getState().updateProfile({ salary: { ...salary, amount: 60_000, payday: 25 } })
    expect(expectedPays(store.getState(), todayISO()).filter((p) => p.payDate < todayISO())).toEqual([])
  })

  it('asks nothing again about a source whose payday changed', async () => {
    const { store } = await paidStore()
    const source = store.getState().addIncomeSource({ name: 'Rent', amount: 500, frequency: 'monthly', payday: 5, startDate: '2026-01-01', accountId: ACCOUNT_IDS.bank, categoryId: CATEGORY_IDS.otherIncome })
    store.getState().updateIncomeSource(source.id, { name: 'Flat', amount: 600 })
    expect(store.getState().incomes[0].startDate).toBe('2026-01-01')
    store.getState().updateIncomeSource(source.id, { payday: 10 })
    expect(store.getState().incomes[0].startDate).toBe(todayISO())
    expect(expectedPays(store.getState(), todayISO()).filter((p) => p.sourceId && p.payDate < todayISO())).toEqual([])
  })

  it('won\'t close a wallet an income source lands in', async () => {
    const { store } = await paidStore()
    const wallet = store.getState().addAccount({ name: 'CCP', kind: 'bank', startingBalance: 0, startDate: '2026-10-01', archived: false })
    const source = store.getState().addIncomeSource({ name: 'Rent', amount: 500, frequency: 'monthly', payday: 5, startDate: '2026-11-01', accountId: wallet.id, categoryId: CATEGORY_IDS.otherIncome })
    expect(() => store.getState().closeAccount(wallet.id)).toThrow()
    store.getState().deleteIncomeSource(source.id)
    expect(store.getState().closeAccount(wallet.id)).toBe('removed')
  })

  it('rejects an impossible payday', async () => {
    const store = await openStore()
    expect(() => store.getState().updateProfile({ salary: { ...store.getState().profile.salary, payday: 40 } })).toThrow(
      'Pick a payday between 1 and 31.',
    )
  })
})

describe('reset and restore', () => {
  it('resets to a fresh install but keeps the device id', async () => {
    const store = await openStore()
    const { deviceId } = store.getState()
    store.getState().addTransaction({ type: 'expense', amount: 100, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-groceries' })
    store.getState().resetAll()
    expect(store.getState().transactions).toEqual([])
    expect(store.getState().deviceId).toBe(deviceId)
  })

  it('replaces everything when restoring a backup, but keeps its own device id', async () => {
    const source = await openStore()
    source.getState().addTransaction({ type: 'expense', amount: 100, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-groceries' })
    const target = await openStore()
    const { deviceId } = target.getState()
    target.getState().replaceData(pickData(source.getState()))
    expect(pickData(target.getState())).toEqual({ ...pickData(source.getState()), deviceId })
  })
})

describe('saving to IndexedDB', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })

  /** IndexedDB storage that remembers its writes, so the test can wait for them. */
  function trackedIdbStorage() {
    const idb = createIdbStorage()
    const writes: Promise<unknown>[] = []
    const storage: StateStorage = {
      ...idb,
      setItem: (name, value) => {
        const write = Promise.resolve(idb.setItem(name, value))
        writes.push(write)
        return write
      },
    }
    return { storage, saved: () => Promise.all(writes) }
  }

  it('keeps data after the app is closed and reopened', async () => {
    const { storage, saved } = trackedIdbStorage()
    const first = await openStore(storage)
    first.getState().updateProfile({ salary: { amount: 60_000, frequency: 'monthly', payday: 25, accountId: ACCOUNT_IDS.bank } })
    first.getState().updateCategory(CATEGORY_IDS.pets, { enabled: true })
    first.getState().addTransaction({ type: 'expense', amount: 1_450, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-groceries', date: TODAY })
    await saved()

    // A new store on the same database is what reopening the app does.
    const reopened = await openStore(createIdbStorage())
    expect(pickData(reopened.getState())).toEqual(pickData(first.getState()))
    expect(reopened.getState().profile.salary.payday).toBe(25)
    expect(reopened.getState().categories.find((c) => c.id === CATEGORY_IDS.pets)!.enabled).toBe(true)
  })

  it('fills in settings that didn’t exist when the data was saved', async () => {
    const storage = createIdbStorage()
    const old = pickData(createAppStore(memoryStorage()).getState())
    const oldSettings: Partial<typeof old.settings> = { ...old.settings }
    delete oldSettings.alerts
    await storage.setItem(STORAGE_KEY, JSON.stringify({ state: { ...old, settings: oldSettings }, version: 1 }))

    const store = await openStore(storage)
    expect(store.getState().settings.alerts.warnAtPercent).toBe(80)
    expect(store.getState().deviceId).toBe(old.deviceId)
  })
})

describe('when saved data can’t be loaded', () => {
  it('reports the failure and doesn’t overwrite the saved data', async () => {
    const writes: string[] = []
    const broken: StateStorage = {
      getItem: () => Promise.reject(new Error('IndexedDB unavailable')),
      setItem: (_name, value) => void writes.push(value),
      removeItem: () => undefined,
    }
    const errors: unknown[] = []
    const consoleError = console.error
    console.error = (...args: unknown[]) => void errors.push(args)
    try {
      const store = createAppStore(broken)
      expect(store.loadStatus()).toBe('loading')
      await expect(whenHydrated(store)).rejects.toThrow('Saved data could not be loaded.')
      expect(store.loadStatus()).toBe('failed')
      expect(writes).toEqual([])
      expect(errors).toHaveLength(1)
    } finally {
      console.error = consoleError
    }
  })
})

describe('setup', () => {
  it('sets category limits and switches in one save', async () => {
    const store = await openStore()
    store.getState().setCategoryBudgets({
      'cat-groceries': { monthlyBudget: 16_000 },
      [CATEGORY_IDS.pets]: { enabled: true, monthlyBudget: 3_000 },
      'cat-travel': { enabled: false },
    })
    const find = (id: string) => store.getState().categories.find((c) => c.id === id)!
    expect(find('cat-groceries').monthlyBudget).toBe(16_000)
    expect(find(CATEGORY_IDS.pets)).toMatchObject({ enabled: true, monthlyBudget: 3_000 })
    expect(find('cat-travel').enabled).toBe(false)

    store.getState().setCategoryBudgets({ 'cat-groceries': { monthlyBudget: null } })
    expect(find('cat-groceries').monthlyBudget).toBeUndefined()
    expect(() => store.getState().setCategoryBudgets({ 'cat-groceries': { monthlyBudget: -1 } })).toThrow('The limit can’t be negative.')
  })

  it('sets the start date only the first time setup finishes', async () => {
    const store = await openStore()
    store.getState().finishOnboarding('2026-11-15')
    expect(store.getState().profile).toMatchObject({ onboardingCompleted: true, startDate: '2026-11-15' })
    store.getState().finishOnboarding('2026-12-01')
    expect(store.getState().profile.startDate).toBe('2026-11-15')
  })
})

describe('wallets', () => {
  const wallet = { name: 'BaridiMob', kind: 'bank', startingBalance: 0, startDate: TODAY, archived: false } as const

  it('adds a wallet that can be spent from and moved to', async () => {
    const store = await openStore()
    const added = store.getState().addAccount({ ...wallet, startingBalance: 1_000 })
    store.getState().addTransaction({ type: 'expense', amount: 100, accountId: added.id, categoryId: 'cat-groceries', date: TODAY })
    store.getState().addTransaction({ type: 'transfer', amount: 50, accountId: ACCOUNT_IDS.cash, toAccountId: added.id, date: TODAY })
    expect(walletBalance(store.getState().accounts.find((a) => a.id === added.id)!, store.getState().transactions)).toBe(950)
  })

  it('needs a name', async () => {
    const store = await openStore()
    expect(() => store.getState().addAccount({ ...wallet, name: ' ' })).toThrow('Enter a name for the wallet.')
  })

  it('closes a used wallet only once it’s empty, and keeps it as closed', async () => {
    const store = await openStore()
    const added = store.getState().addAccount({ ...wallet, startingBalance: 300 })
    expect(() => store.getState().closeAccount(added.id)).toThrow(/still holds .*300/)
    store.getState().addTransaction({ type: 'transfer', amount: 300, accountId: added.id, toAccountId: ACCOUNT_IDS.cash, date: TODAY })
    expect(store.getState().closeAccount(added.id)).toBe('closed')
    expect(store.getState().accounts.find((a) => a.id === added.id)).toMatchObject({ archived: true })
    expect(store.getState().accounts.find((a) => a.id === added.id)?.deleted).toBeFalsy()
  })

  it('removes a wallet of your own that was never used, and Undo brings it back', async () => {
    const store = await openStore()
    const added = store.getState().addAccount(wallet)
    expect(store.getState().closeAccount(added.id)).toBe('removed')
    expect(store.getState().accounts.find((a) => a.id === added.id)).toMatchObject({ archived: true, deleted: true })
    store.getState().reopenAccount(added.id)
    const back = store.getState().accounts.find((a) => a.id === added.id)
    expect(back?.archived).toBe(false)
    expect(back?.deleted).toBeFalsy()
  })

  it('keeps an empty built-in wallet as closed, so it can come back', async () => {
    const store = await openStore()
    expect(store.getState().closeAccount(ACCOUNT_IDS.cash)).toBe('closed')
    expect(store.getState().accounts.find((a) => a.id === ACCOUNT_IDS.cash)?.deleted).toBeFalsy()
  })

  it('refuses while the salary lands there', async () => {
    const store = await openStore()
    expect(() => store.getState().closeAccount(ACCOUNT_IDS.bank)).toThrow(/salary/)
  })

  it('refuses while an active bill is paid from it, and allows it once the bill moved', async () => {
    const store = await openStore()
    const added = store.getState().addAccount(wallet)
    const bill = store.getState().addBill({ name: 'Internet', amount: 2_000, categoryId: 'cat-bills', accountId: added.id, frequency: 'monthly', dueDay: 5, startDate: TODAY, active: true })
    expect(() => store.getState().closeAccount(added.id)).toThrow(/bill/)
    store.getState().updateBill(bill.id, { accountId: ACCOUNT_IDS.cash })
    expect(() => store.getState().closeAccount(added.id)).not.toThrow()
  })

  it('refuses to close the last open wallet', async () => {
    const store = await openStore()
    store.getState().closeAccount(ACCOUNT_IDS.cash)
    expect(() => store.getState().closeAccount(ACCOUNT_IDS.bank)).toThrow(/at least one/)
  })

  it('counts cash in any cash wallet', async () => {
    const store = await openStore()
    const home = store.getState().addAccount({ ...wallet, name: 'At home', kind: 'cash', startingBalance: 1_000 })
    const tx = store.getState().recordCashCount(home.id, 900, TODAY)
    expect(tx).toMatchObject({ type: 'expense', amount: 100, accountId: home.id })
  })
})

describe('debts', () => {
  const lent = { direction: 'lent', person: 'Sami', startingAmount: 0, date: TODAY, archived: false } as const

  it('logs the money that moved, in the same save', async () => {
    const store = await openStore()
    const debt = store.getState().addDebt(lent, { accountId: ACCOUNT_IDS.cash, amount: 500, date: TODAY })
    expect(store.getState().debts).toEqual([debt])
    expect(store.getState().transactions).toMatchObject([{ type: 'debt-out', amount: 500, accountId: ACCOUNT_IDS.cash, debtId: debt.id, date: TODAY }])
  })

  it('logs money coming in for borrowed money', async () => {
    const store = await openStore()
    const debt = store.getState().addDebt({ ...lent, direction: 'borrowed' }, { accountId: ACCOUNT_IDS.bank, amount: 500, date: TODAY })
    expect(store.getState().transactions).toMatchObject([{ type: 'debt-in', debtId: debt.id }])
  })

  it('moves no money for an older debt', async () => {
    const store = await openStore()
    store.getState().addDebt({ ...lent, direction: 'borrowed', startingAmount: 120_000 })
    expect(store.getState().transactions).toEqual([])
  })

  it('saves nothing at all if the money can’t be logged', async () => {
    const store = await openStore()
    expect(() => store.getState().addDebt(lent, { accountId: 'no-such-wallet', amount: 500, date: TODAY })).toThrow()
    expect(store.getState().debts).toEqual([])
    expect(store.getState().transactions).toEqual([])
  })

  it('needs an amount from somewhere', async () => {
    const store = await openStore()
    expect(() => store.getState().addDebt(lent)).toThrow('Enter an amount above 0.')
  })

  it('edits, closes, deletes and restores', async () => {
    const store = await openStore()
    const debt = store.getState().addDebt({ ...lent, startingAmount: 500 })
    store.getState().updateDebt(debt.id, { person: 'Samir', archived: true })
    expect(store.getState().debts[0]).toMatchObject({ person: 'Samir', archived: true })
    store.getState().deleteDebt(debt.id)
    expect(store.getState().debts[0].deleted).toBe(true)
    expect(() => store.getState().updateDebt(debt.id, { person: 'x' })).toThrow('That debt no longer exists.')
    store.getState().restoreDebt(debt.id)
    expect(store.getState().debts[0].deleted).toBe(false)
  })

  it('leaves entries in place when deleted, so wallets stay right', async () => {
    const store = await openStore()
    const debt = store.getState().addDebt(lent, { accountId: ACCOUNT_IDS.cash, amount: 500, date: TODAY })
    store.getState().deleteDebt(debt.id)
    expect(store.getState().transactions).toHaveLength(1)
  })

  it('refuses a goal plan that doesn’t leave room for instalments', async () => {
    const store = await openStore()
    store.getState().updateProfile({ salary: { amount: 60_000, frequency: 'monthly', payday: 25, accountId: ACCOUNT_IDS.bank } })
    store.getState().addDebt({ ...lent, direction: 'borrowed', startingAmount: 500_000, monthlyPayment: 50_000, firstPaymentDate: TODAY })
    const goal = { name: 'Trip', icon: 'plane', target: 100_000, archived: false }
    expect(() => store.getState().addGoal({ ...goal, monthlyContribution: 20_000 })).toThrow(/leaves 10,000/)
    expect(() => store.getState().addGoal({ ...goal, monthlyContribution: 10_000 })).not.toThrow()
  })
})

describe('data saved before debts existed', () => {
  it('loads, with no debts', async () => {
    const storage = memoryStorage()
    const old: Partial<AppData> = pickData((await openStore()).getState())
    delete old.debts
    await storage.setItem(STORAGE_KEY, JSON.stringify({ state: old, version: 1 }))
    const store = await openStore(storage)
    expect(store.getState().debts).toEqual([])
    expect(store.getState().accounts.length).toBe(old.accounts?.length)
  })
})

describe('recordDebt, from the Debt tab', () => {
  const base = { direction: 'lent', person: 'Sami', date: TODAY, amount: 500 } as const

  it('starts a debt and logs the money that moved', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt({ ...base, accountId: ACCOUNT_IDS.cash, note: 'Car' })
    expect(debt).toMatchObject({ person: 'Sami', startingAmount: 0, note: 'Car' })
    expect(store.getState().transactions).toMatchObject([{ type: 'debt-out', amount: 500, debtId: debt.id, accountId: ACCOUNT_IDS.cash }])
  })

  it('moves no money without a wallet', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt({ ...base, direction: 'borrowed', amount: 120_000, monthlyPayment: 10_000, firstPaymentDate: TODAY, dueDate: '2027-11-01' })
    expect(debt).toMatchObject({ startingAmount: 120_000, monthlyPayment: 10_000, firstPaymentDate: TODAY, dueDate: '2027-11-01' })
    expect(store.getState().transactions).toEqual([])
  })

  it('adds to the debt already there with that person, whatever the capitals', async () => {
    const store = await openStore()
    const first = store.getState().recordDebt({ ...base, accountId: ACCOUNT_IDS.cash }).debt
    const again = store.getState().recordDebt({ ...base, person: ' sami ', amount: 300, accountId: ACCOUNT_IDS.bank, note: 'Again' }).debt
    expect(again.id).toBe(first.id)
    expect(store.getState().debts).toHaveLength(1)
    expect(debtOwed(first, store.getState().transactions)).toBe(800)
    expect(store.getState().transactions[1]).toMatchObject({ note: 'Again', accountId: ACCOUNT_IDS.bank })
  })

  it('keeps lending and borrowing with one person apart, and starts over after closing', async () => {
    const store = await openStore()
    const lent = store.getState().recordDebt({ ...base, accountId: ACCOUNT_IDS.cash }).debt
    const borrowed = store.getState().recordDebt({ ...base, direction: 'borrowed', accountId: ACCOUNT_IDS.cash }).debt
    expect(borrowed.id).not.toBe(lent.id)
    store.getState().updateDebt(lent.id, { archived: true })
    expect(store.getState().recordDebt({ ...base, accountId: ACCOUNT_IDS.cash }).debt.id).not.toBe(lent.id)
  })

  it('adds to what’s owed when no money moved on an existing debt', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt(base)
    store.getState().recordDebt({ ...base, amount: 200 })
    expect(debtOwed(store.getState().debts.find((d) => d.id === debt.id)!, [])).toBe(700)
    expect(store.getState().transactions).toEqual([])
  })

  it('undo takes back a new debt and its entry', async () => {
    const store = await openStore()
    const { undo } = store.getState().recordDebt({ ...base, accountId: ACCOUNT_IDS.cash })
    undo()
    expect(store.getState().debts[0].deleted).toBe(true)
    expect(store.getState().transactions[0].deleted).toBe(true)
  })

  it('undo on a new debt leaves a payment logged since', async () => {
    const store = await openStore()
    const { debt, undo } = store.getState().recordDebt({ ...base, accountId: ACCOUNT_IDS.cash })
    const payment = store.getState().addTransaction({ type: 'debt-in', amount: 100, date: TODAY, accountId: ACCOUNT_IDS.cash, debtId: debt.id })
    undo()
    expect(store.getState().transactions.find((t) => t.id === payment.id)?.deleted).toBeFalsy()
    expect(store.getState().debts[0].deleted).toBe(true)
  })

  it('undo on an existing debt takes back only what was added', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt({ ...base, direction: 'borrowed', amount: 1_000 })
    const moved = store.getState().recordDebt({ ...base, direction: 'borrowed', amount: 300, accountId: ACCOUNT_IDS.cash, dueDate: '2027-01-01' })
    moved.undo()
    expect(store.getState().debts[0].deleted).toBeFalsy()
    expect(store.getState().debts[0].dueDate).toBeUndefined()
    expect(debtOwed(debt, store.getState().transactions)).toBe(1_000)
    const added = store.getState().recordDebt({ ...base, direction: 'borrowed', amount: 200 })
    added.undo()
    expect(store.getState().debts[0].startingAmount).toBe(1_000)
  })

  it('refuses an empty amount, and saves nothing', async () => {
    const store = await openStore()
    expect(() => store.getState().recordDebt({ ...base, amount: 0 })).toThrow('Enter an amount above 0.')
    expect(store.getState().debts).toEqual([])
  })
})

describe('currencies', () => {
  const usd = { name: 'USD card', kind: 'bank', currency: 'USD', startingBalance: 0, startDate: TODAY, archived: false } as const

  it('stores the main currency as nothing', async () => {
    const store = await openStore()
    const main = store.getState().addAccount({ ...usd, name: 'Other', currency: store.getState().profile.currency })
    expect(main.currency).toBeUndefined()
    expect(store.getState().addAccount(usd).currency).toBe('USD')
  })

  it('copies the wallet’s currency onto an entry, and follows it when the wallet changes', async () => {
    const store = await openStore()
    const wallet = store.getState().addAccount(usd)
    const entry = store.getState().addTransaction({ type: 'expense', amount: 15.99, accountId: wallet.id, categoryId: 'cat-subscriptions', date: TODAY })
    expect(entry.currency).toBe('USD')
    store.getState().updateTransaction(entry.id, { accountId: ACCOUNT_IDS.cash })
    expect(store.getState().transactions[0].currency).toBeUndefined()
  })

  it('locks a wallet’s currency once it has entries', async () => {
    const store = await openStore()
    const wallet = store.getState().addAccount(usd)
    store.getState().updateAccount(wallet.id, { currency: 'EUR' })
    expect(store.getState().accounts.find((a) => a.id === wallet.id)?.currency).toBe('EUR')
    store.getState().addTransaction({ type: 'income', amount: 10, accountId: wallet.id, categoryId: CATEGORY_IDS.otherIncome, date: TODAY })
    expect(() => store.getState().updateAccount(wallet.id, { currency: 'USD' })).toThrow(/currency can’t change/)
    expect(() => store.getState().updateAccount(wallet.id, { name: 'Renamed' })).not.toThrow()
  })

  it('records a transfer’s arrival only across currencies', async () => {
    const store = await openStore()
    const wallet = store.getState().addAccount(usd)
    const change = store.getState().addTransaction({ type: 'transfer', amount: 27_000, accountId: ACCOUNT_IDS.bank, toAccountId: wallet.id, toAmount: 100, date: TODAY })
    expect(change).toMatchObject({ toAmount: 100, toCurrency: 'USD' })
    const plain = store.getState().addTransaction({ type: 'transfer', amount: 500, accountId: ACCOUNT_IDS.bank, toAccountId: ACCOUNT_IDS.cash, toAmount: 999, date: TODAY })
    expect(plain.toAmount).toBeUndefined()
  })

  it('a borrowed USD debt: into the USD wallet, paid back in dinars or dollars', async () => {
    const store = await openStore()
    const wallet = store.getState().addAccount(usd)
    const { debt } = store.getState().recordDebt({ direction: 'borrowed', person: 'Karim', amount: 100, date: TODAY, accountId: wallet.id, currency: 'DZD' })
    expect(debt.currency).toBe('USD')
    expect(store.getState().transactions[0]).toMatchObject({ type: 'debt-in', currency: 'USD', amount: 100 })
    store.getState().addTransaction({ type: 'debt-out', amount: 13_500, accountId: ACCOUNT_IDS.bank, debtId: debt.id, debtAmount: 50, date: TODAY })
    expect(debtOwed(debt, store.getState().transactions)).toBe(50)
    store.getState().addTransaction({ type: 'debt-out', amount: 50, accountId: wallet.id, debtId: debt.id, debtAmount: 999, date: TODAY })
    expect(store.getState().transactions[2].debtAmount).toBeUndefined()
    expect(debtOwed(debt, store.getState().transactions)).toBe(0)
  })

  it('a USD debt with no wallet moves no money', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt({ direction: 'borrowed', person: 'Karim', amount: 15, date: TODAY, currency: 'USD' })
    expect(debt).toMatchObject({ currency: 'USD', startingAmount: 15 })
    expect(store.getState().transactions).toEqual([])
  })

  it('keeps debts with one person apart per currency', async () => {
    const store = await openStore()
    const dollars = store.getState().recordDebt({ direction: 'borrowed', person: 'Karim', amount: 15, date: TODAY, currency: 'USD' }).debt
    const dinars = store.getState().recordDebt({ direction: 'borrowed', person: 'Karim', amount: 500, date: TODAY }).debt
    expect(dinars.id).not.toBe(dollars.id)
    expect(store.getState().recordDebt({ direction: 'borrowed', person: 'karim', amount: 5, date: TODAY, currency: 'USD' }).debt.id).toBe(dollars.id)
  })

  it('reports a wallet’s money in its own currency when refusing to close it', async () => {
    const store = await openStore()
    const wallet = store.getState().addAccount({ ...usd, startingBalance: 20 })
    expect(() => store.getState().closeAccount(wallet.id)).toThrow(/20 USD/)
  })
})

describe('when saved data can’t be loaded', () => {
  const loadFrom = async (storage: StateStorage) => {
    const store = createAppStore(storage)
    await expect(whenHydrated(store)).rejects.toThrow()
    return store
  }

  it('says the app is out of date for data from a newer version, and leaves it alone', async () => {
    const storage = memoryStorage()
    const saved = JSON.stringify({ state: { profile: { name: 'Mine' } }, version: 99 })
    await storage.setItem(STORAGE_KEY, saved)
    const store = await loadFrom(storage)
    expect(store.loadStatus()).toBe('failed')
    expect(store.loadFailure()).toMatchObject({ reason: 'newer-data', message: expect.stringContaining('99') })
    expect(await storage.getItem(STORAGE_KEY)).toBe(saved)
  })

  it('says damaged for data it can’t read, and leaves it alone', async () => {
    const storage = memoryStorage()
    await storage.setItem(STORAGE_KEY, '{"state":{"profile":')
    const store = await loadFrom(storage)
    expect(store.loadFailure()?.reason).toBe('damaged')
    expect(await storage.getItem(STORAGE_KEY)).toBe('{"state":{"profile":')
  })

  it('blames storage only when storage fails', async () => {
    const store = await loadFrom({
      getItem: () => Promise.reject(new Error('The operation is insecure.')),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    })
    expect(store.loadFailure()).toEqual({ reason: 'storage', message: 'The operation is insecure.' })
  })

  it('reports nothing when loading works', async () => {
    expect((await openStore()).loadFailure()).toBeNull()
  })
})

describe('two tabs of the app', () => {
  const lent = { direction: 'lent', person: 'Karim', amount: 15, date: TODAY } as const

  async function twoTabs() {
    const storage = memoryStorage()
    const first = await openStore(storage)
    first.getState().updateSettings({ theme: 'dark' })
    return { first, second: await openStore(storage), storage }
  }

  it('a tab that was told keeps what the other saved when it saves', async () => {
    const { first, second } = await twoTabs()
    first.getState().recordDebt(lent)
    await second.takeInSaved()
    expect(second.getState().debts.map((d) => d.person)).toEqual(['Karim'])
    second.getState().recordDebt({ ...lent, person: 'Lina' })
    await first.takeInSaved()
    expect(first.getState().debts.map((d) => d.person).sort()).toEqual(['Karim', 'Lina'])
  })

  it('taking in saved data doesn’t write it back', async () => {
    const { first, second, storage } = await twoTabs()
    first.getState().recordDebt(lent)
    const before = await storage.getItem(STORAGE_KEY)
    await second.takeInSaved()
    expect(await storage.getItem(STORAGE_KEY)).toBe(before)
  })

  it('leaves a newer version’s data alone', async () => {
    const { first, storage } = await twoTabs()
    const newer = JSON.stringify({ state: { profile: { name: 'Newer' } }, version: 99 })
    await storage.setItem(STORAGE_KEY, newer)
    await first.takeInSaved()
    expect(first.getState().profile.name).not.toBe('Newer')
    expect(await storage.getItem(STORAGE_KEY)).toBe(newer)
  })
})

describe('adding to a debt with no money moved', () => {
  const karim = { direction: 'borrowed', person: 'Karim', date: TODAY, currency: 'USD' } as const

  it('keeps its own history line', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt({ ...karim, amount: 15 })
    store.getState().recordDebt({ ...karim, amount: 10, note: 'Domain name' })
    const saved = store.getState().debts[0]
    expect(saved.startingAmount).toBe(15)
    expect(saved.charges).toMatchObject([{ amount: 10, note: 'Domain name', date: TODAY }])
    expect(debtOwed(saved, store.getState().transactions)).toBe(25)
    expect(saved.id).toBe(debt.id)
  })

  it('undo takes back just that line', async () => {
    const store = await openStore()
    store.getState().recordDebt({ ...karim, amount: 15 })
    const added = store.getState().recordDebt({ ...karim, amount: 10 })
    added.undo()
    expect(debtOwed(store.getState().debts[0], [])).toBe(15)
  })
})

describe('repeating charges', () => {
  const sub = { direction: 'borrowed', person: 'Sami', date: '2026-09-05', currency: 'USD', amount: 15, note: 'Netflix', repeats: true } as const

  it('starts with this month added and moves no money, even with a wallet chosen', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt({ ...sub, accountId: ACCOUNT_IDS.cash })
    expect(debt.repeats).toMatchObject([{ name: 'Netflix', amount: 15, startDate: '2026-09-05' }])
    expect(debt.charges).toMatchObject([{ amount: 15, date: '2026-09-05', dueDate: '2026-09-05' }])
    expect(store.getState().transactions).toEqual([])
  })

  it('never adds a month by itself: it waits for a yes', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt(sub)
    expect(dueRepeats(store.getState().debts, '2026-11-15').map((d) => d.dueDate)).toEqual(['2026-10-05', '2026-11-05'])
    expect(debtOwed(store.getState().debts[0], [])).toBe(15)
    const repeatId = debt.repeats![0].id

    const undo = store.getState().approveRepeat({ debtId: debt.id, repeatId, dueDate: '2026-10-05' })
    expect(debtOwed(store.getState().debts[0], [])).toBe(30)
    expect(dueRepeats(store.getState().debts, '2026-11-15').map((d) => d.dueDate)).toEqual(['2026-11-05'])
    undo()
    expect(debtOwed(store.getState().debts[0], [])).toBe(15)
    expect(dueRepeats(store.getState().debts, '2026-11-15')).toHaveLength(2)
  })

  it('a no stops it asking about that month only, and can be taken back', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt(sub)
    const undo = store.getState().skipRepeat({ debtId: debt.id, repeatId: debt.repeats![0].id, dueDate: '2026-10-05' })
    expect(dueRepeats(store.getState().debts, '2026-11-15').map((d) => d.dueDate)).toEqual(['2026-11-05'])
    expect(debtOwed(store.getState().debts[0], [])).toBe(15)
    undo()
    expect(dueRepeats(store.getState().debts, '2026-11-15')).toHaveLength(2)
  })

  it('stopping ends the asking, and its history stays', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt(sub)
    store.getState().stopRepeat(debt.id, debt.repeats![0].id, '2026-09-20')
    expect(dueRepeats(store.getState().debts, '2026-12-15')).toEqual([])
    expect(debtOwed(store.getState().debts[0], [])).toBe(15)
  })

  it('groups a second subscription under the same person', async () => {
    const store = await openStore()
    const first = store.getState().recordDebt(sub).debt
    const second = store.getState().recordDebt({ ...sub, note: 'Spotify', amount: 10 }).debt
    expect(second.id).toBe(first.id)
    expect(store.getState().debts).toHaveLength(1)
    expect(store.getState().debts[0].repeats?.map((r) => r.name)).toEqual(['Netflix', 'Spotify'])
    expect(debtOwed(store.getState().debts[0], [])).toBe(25)
  })

  it('picking the same one again answers the oldest month waiting', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt(sub)
    store.getState().recordDebt({ ...sub, repeats: undefined, repeatId: debt.repeats![0].id, date: '2026-11-15' })
    expect(store.getState().debts[0].repeats).toHaveLength(1)
    expect(dueRepeats(store.getState().debts, '2026-11-15').map((d) => d.dueDate)).toEqual(['2026-11-05'])
  })

  it('stays out of the budget until money moves', async () => {
    const store = await openStore()
    store.getState().updateProfile({ salary: { amount: 60_000, frequency: 'monthly', payday: 25, accountId: ACCOUNT_IDS.bank } })
    store.getState().recordDebt(sub)
    expect(budgetSummary(store.getState(), TODAY)).toMatchObject({ debtOut: 0, leftToSpend: 60_000 })
  })

  it('leaves closed debts out of the asking', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt(sub)
    store.getState().updateDebt(debt.id, { archived: true })
    expect(dueRepeats(store.getState().debts, '2026-11-15')).toEqual([])
  })
})

describe('editing a debt', () => {
  it('can change who, and the currency', async () => {
    const store = await openStore()
    const { debt } = store.getState().recordDebt({ direction: 'lent', person: 'Sami', amount: 15, date: TODAY })
    store.getState().updateDebt(debt.id, { person: 'Samir', currency: 'EUR' })
    expect(store.getState().debts[0]).toMatchObject({ person: 'Samir', currency: 'EUR' })
    store.getState().updateDebt(debt.id, { currency: store.getState().profile.currency })
    expect(store.getState().debts[0].currency).toBeUndefined()
  })
})

describe('one-tap items', () => {
  const setUp = () => {
    const store = createAppStore(memoryStorage())
    const state = store.getState()
    return { store, category: state.categories.find((c) => c.kind === 'expense' && !c.system)!.id, wallet: ACCOUNT_IDS.cash }
  }

  it('saves one, trimmed, and it logs nothing by itself', () => {
    const { store, category, wallet } = setUp()
    const before = store.getState().transactions.length
    const item = store.getState().addQuickItem({ name: '  Coffee ', amount: 250, accountId: wallet, categoryId: category })
    expect(item.name).toBe('Coffee')
    expect(store.getState().quickItems).toHaveLength(1)
    expect(store.getState().transactions).toHaveLength(before)
  })

  it('refuses one with no name, no amount, or the wrong kind of category', () => {
    const { store, category, wallet } = setUp()
    const add = store.getState().addQuickItem
    const income = store.getState().categories.find((c) => c.kind === 'income')!.id
    expect(() => add({ name: ' ', amount: 250, accountId: wallet, categoryId: category })).toThrow()
    expect(() => add({ name: 'Coffee', amount: 0, accountId: wallet, categoryId: category })).toThrow()
    expect(() => add({ name: 'Coffee', amount: 250, accountId: wallet, categoryId: income })).toThrow()
    expect(() => add({ name: 'Coffee', amount: 250, accountId: 'gone', categoryId: category })).toThrow()
    expect(store.getState().quickItems).toEqual([])
  })

  it('takes its currency from the wallet, and follows a change of wallet', () => {
    const { store, category, wallet } = setUp()
    const usd = store.getState().addAccount({ name: 'USD', kind: 'bank', currency: 'USD', startingBalance: 0, startDate: '2026-01-01', archived: false })
    const item = store.getState().addQuickItem({ name: 'Sub', amount: 15.99, accountId: usd.id, categoryId: category })
    expect(store.getState().quickItems[0].currency).toBe('USD')
    store.getState().updateQuickItem(item.id, { accountId: wallet })
    expect(store.getState().quickItems[0].currency).toBeUndefined()
  })

  it('deleting keeps what it logged, and undo brings it back', () => {
    const { store, category, wallet } = setUp()
    const item = store.getState().addQuickItem({ name: 'Coffee', amount: 250, accountId: wallet, categoryId: category })
    const entry = store.getState().addTransaction({ type: 'expense', amount: 250, date: '2026-11-05', accountId: wallet, categoryId: category, note: 'Coffee' })
    store.getState().deleteQuickItem(item.id)
    expect(store.getState().quickItems[0].deleted).toBe(true)
    expect(store.getState().transactions.find((t) => t.id === entry.id)?.deleted).toBeFalsy()
    store.getState().restoreQuickItem(item.id)
    expect(store.getState().quickItems[0].deleted).toBe(false)
  })

  it('data saved before they existed loads with none', () => {
    const { store } = setUp()
    const { quickItems, ...old } = pickData(store.getState())
    expect(quickItems).toEqual([])
    expect(migrate(old, 5).quickItems).toEqual([])
  })
})
