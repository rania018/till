import { describe, expect, it } from 'vitest'
import type { StateStorage } from 'zustand/middleware'
import { createInitialData } from '../store/defaults'
import { createAppStore, whenHydrated } from '../store/store'
import type { AppData, Asset, Debt, Goal, Transaction } from '../types'
import { assetValueAt, netWorthChange, netWorthHistory, netWorthOn } from './netWorth'

const STAMP = { createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z' }

/** Set up on 1 Jul 2026: 50,000 DA in cash, 200,000 DA in the bank, 300 USD in a dollar wallet. */
function data(): AppData {
  const d = createInitialData(new Date(2026, 6, 1))
  d.profile.startDate = '2026-07-01'
  d.accounts = d.accounts.map((a) => ({ ...a, startDate: '2026-07-01', startingBalance: a.id === 'acc-cash' ? 50_000 : 200_000 }))
  d.accounts.push({ ...d.accounts[0], id: 'acc-usd', name: 'Dollars', currency: 'USD', startingBalance: 300 })
  return d
}

function tx(fields: Partial<Transaction>): Transaction {
  return { id: `t-${Math.random()}`, ...STAMP, type: 'expense', amount: 0, date: '2026-07-10', accountId: 'acc-cash', ...fields }
}

const gold: Asset = {
  id: 'gold',
  ...STAMP,
  name: 'Gold',
  kind: 'gold',
  grams: 40,
  values: [
    { id: 'v1', date: '2026-07-01', value: 800_000, perGram: 20_000 },
    { id: 'v2', date: '2026-09-15', value: 880_000, perGram: 22_000 },
  ],
}

describe('net worth', () => {
  it('adds wallets, goals, what you are owed and assets, and takes off what you owe', () => {
    const d = data()
    const goal: Goal = { id: 'g', ...STAMP, name: 'Trip', icon: 'plane', target: 100_000, monthlyContribution: 10_000, startingAmount: 20_000, archived: false }
    d.goals = [goal]
    const lent: Debt = { id: 'd1', ...STAMP, direction: 'lent', person: 'Amine', startingAmount: 0, date: '2026-07-05', archived: false }
    const borrowed: Debt = { id: 'd2', ...STAMP, direction: 'borrowed', person: 'Bank', startingAmount: 150_000, date: '2026-07-01', archived: false }
    d.debts = [lent, borrowed]
    d.assets = [gold]
    d.transactions = [
      tx({ type: 'expense', amount: 5_000, categoryId: 'cat-groceries' }),
      // Putting aside moves money from a wallet to a goal: net worth doesn't change.
      tx({ type: 'goal-deposit', amount: 10_000, goalId: 'g', accountId: 'acc-bank' }),
      // Lending moves money from a wallet to what you're owed.
      tx({ type: 'debt-out', amount: 15_000, debtId: 'd1', accountId: 'acc-cash' }),
    ]
    const [main, usd] = netWorthOn(d, '2026-07-31')
    expect(main).toEqual({ currency: 'DZD', wallets: 220_000, goals: 30_000, owedToYou: 15_000, youOwe: 150_000, assets: 800_000, total: 915_000 })
    // Other currencies are never added in: they get their own row.
    expect(usd).toEqual({ currency: 'USD', wallets: 300, goals: 0, owedToYou: 0, youOwe: 0, assets: 0, total: 300 })
  })

  it('counts each part only from when it was tracked', () => {
    const d = data()
    d.goals = [{ id: 'g', ...STAMP, createdAt: '2026-09-01T10:00:00.000Z', name: 'Car', icon: 'car', target: 1, monthlyContribution: 0, startingAmount: 40_000, archived: false }]
    d.assets = [gold]
    // A goal's starting amount counts from the day the goal was added.
    expect(netWorthOn(d, '2026-08-31')[0].goals).toBe(0)
    expect(netWorthOn(d, '2026-09-01')[0].goals).toBe(40_000)
    // Before a wallet's start date, nothing in it was tracked.
    expect(netWorthOn(d, '2026-06-30')[0].wallets).toBe(0)
  })

  it('values an asset by its latest value on that day, until it was sold', () => {
    expect(assetValueAt(gold, '2026-06-30')).toBeNull()
    expect(assetValueAt(gold, '2026-09-14')?.value).toBe(800_000)
    expect(assetValueAt(gold, '2026-09-15')?.value).toBe(880_000)
    const sold = { ...gold, soldAt: '2026-10-01' }
    expect(assetValueAt(sold, '2026-09-30')?.value).toBe(880_000)
    expect(assetValueAt(sold, '2026-10-01')).toBeNull()
  })

  it('leaves out closed debts and an empty other currency, but always has the main one', () => {
    const d = data()
    d.accounts = d.accounts.filter((a) => a.id !== 'acc-usd').map((a) => ({ ...a, startingBalance: 0 }))
    d.debts = [{ id: 'd', ...STAMP, direction: 'borrowed', person: 'Sami', startingAmount: 5_000, date: '2026-07-01', archived: true }]
    expect(netWorthOn(d, '2026-07-31')).toEqual([{ currency: 'DZD', wallets: 0, goals: 0, owedToYou: 0, youOwe: 0, assets: 0, total: 0 }])
  })

  it('has a point at the end of each month since setup, the last one today', () => {
    const d = data()
    d.assets = [gold]
    d.transactions = [tx({ type: 'expense', amount: 10_000, date: '2026-10-05', categoryId: 'cat-groceries' })]
    const points = netWorthHistory(d, '2026-11-06')
    expect(points.map((p) => p.date)).toEqual(['2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-06'])
    expect(points.map((p) => p.row.total)).toEqual([1_050_000, 1_050_000, 1_130_000, 1_120_000, 1_120_000])
    expect(netWorthChange(points[3].row, points[2].row)).toEqual({ total: -10_000, wallets: -10_000, goals: 0, owedToYou: 0, youOwe: 0, assets: 0 })
    // At most the last 12 months.
    expect(netWorthHistory({ ...d, profile: { ...d.profile, startDate: '2020-01-01' } }, '2026-11-06')).toHaveLength(12)
  })
})

function memoryStorage(): StateStorage {
  const saved = new Map<string, string>()
  return { getItem: (name) => saved.get(name) ?? null, setItem: (name, value) => void saved.set(name, value), removeItem: (name) => void saved.delete(name) }
}

describe('assets in the store', () => {
  it('adds one with its first value, and keeps grams only for gold', async () => {
    const store = createAppStore(memoryStorage())
    await whenHydrated(store)
    const asset = store.getState().addAsset({ name: ' Gold ', kind: 'gold', grams: 40, currency: 'DZD', value: { date: '2026-07-01', value: 800_000, perGram: 20_000 } })
    expect(asset).toMatchObject({ name: 'Gold', grams: 40, currency: undefined })
    expect(asset.values).toHaveLength(1)
    store.getState().updateAsset(asset.id, { kind: 'other' })
    expect(store.getState().assets[0].grams).toBeUndefined()
    expect(() => store.getState().addAsset({ name: '', kind: 'other', value: { date: '2026-07-01', value: 1 } })).toThrow()
    expect(() => store.getState().addAsset({ name: 'Car', kind: 'vehicle', value: { date: '2026-07-01', value: -1 } })).toThrow()
  })

  it('replaces a value on the same day, undoes a new value, and never removes the last one', async () => {
    const store = createAppStore(memoryStorage())
    await whenHydrated(store)
    const { id } = store.getState().addAsset({ name: 'Car', kind: 'vehicle', value: { date: '2026-07-01', value: 2_000_000 } })
    const values = () => store.getState().assets[0].values.map((v) => [v.date, v.value])
    store.getState().setAssetValue(id, { date: '2026-10-01', value: 1_900_000 })
    const undo = store.getState().setAssetValue(id, { date: '2026-10-01', value: 1_850_000 })
    expect(values()).toEqual([['2026-07-01', 2_000_000], ['2026-10-01', 1_850_000]])
    undo()
    expect(values()).toEqual([['2026-07-01', 2_000_000], ['2026-10-01', 1_900_000]])
    store.getState().deleteAssetValue(id, store.getState().assets[0].values[1].id)
    expect(() => store.getState().deleteAssetValue(id, store.getState().assets[0].values[0].id)).toThrow()
    // It can't stop being yours before it started counting.
    expect(() => store.getState().updateAsset(id, { soldAt: '2026-06-30' })).toThrow()
    store.getState().updateAsset(id, { soldAt: '2026-11-01' })
    store.getState().updateAsset(id, { soldAt: undefined })
    expect(store.getState().assets[0].soldAt).toBeUndefined()
  })
})
