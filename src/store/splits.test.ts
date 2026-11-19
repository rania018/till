import { describe, expect, it } from 'vitest'
import type { StateStorage } from 'zustand/middleware'
import { live } from '../lib/id'
import { spentByCategory } from '../lib/budget'
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

async function openStore() {
  const store = createAppStore(memoryStorage())
  await whenHydrated(store)
  return store
}

const RANGE = { start: '2026-11-01', end: '2026-11-30' }
const receipt = { date: '2026-11-10', accountId: ACCOUNT_IDS.cash, note: 'Supermarket' }

describe('a purchase split across categories', () => {
  it('is one expense per category, sharing one id', async () => {
    const store = await openStore()
    store.getState().saveSplit({ ...receipt, parts: [{ categoryId: 'cat-groceries', amount: 7_450 }, { categoryId: 'cat-household', amount: 2_000 }] })
    const parts = live(store.getState().transactions)
    expect(parts).toHaveLength(2)
    expect(new Set(parts.map((p) => p.splitId)).size).toBe(1)
    expect(parts[0].splitId).toBeTruthy()
    expect(parts.every((p) => p.note === 'Supermarket' && p.type === 'expense')).toBe(true)
    const spent = spentByCategory(store.getState().transactions, RANGE)
    expect(spent.get('cat-groceries')).toBe(7_450)
    expect(spent.get('cat-household')).toBe(2_000)
  })

  it('changes, adds and removes parts when saved again, and Undo puts it back', async () => {
    const store = await openStore()
    const { parts } = store.getState().saveSplit({ ...receipt, parts: [{ categoryId: 'cat-groceries', amount: 7_450 }, { categoryId: 'cat-household', amount: 2_000 }] })
    const splitId = parts[0].splitId!
    const { undo } = store.getState().saveSplit({
      splitId,
      ...receipt,
      parts: [
        { id: parts[0].id, categoryId: 'cat-groceries', amount: 6_000 },
        { categoryId: 'cat-personal-care', amount: 3_450 },
      ],
    })
    const now = live(store.getState().transactions)
    expect(now.map((p) => [p.categoryId, p.amount])).toEqual([
      ['cat-groceries', 6_000],
      ['cat-personal-care', 3_450],
    ])
    expect(now.find((p) => p.id === parts[0].id)).toBeTruthy()
    undo()
    expect(live(store.getState().transactions).map((p) => [p.categoryId, p.amount])).toEqual([
      ['cat-groceries', 7_450],
      ['cat-household', 2_000],
    ])
  })

  it('is a plain expense again with one part left, and an expense can become a split', async () => {
    const store = await openStore()
    const single = store.getState().addTransaction({ type: 'expense', amount: 9_450, ...receipt, categoryId: 'cat-groceries' })
    const { parts } = store.getState().saveSplit({ ...receipt, parts: [{ id: single.id, categoryId: 'cat-groceries', amount: 7_450 }, { categoryId: 'cat-household', amount: 2_000 }] })
    expect(parts[0].id).toBe(single.id)
    expect(live(store.getState().transactions)).toHaveLength(2)
    store.getState().saveSplit({ splitId: parts[0].splitId, ...receipt, parts: [{ id: single.id, categoryId: 'cat-groceries', amount: 9_450 }] })
    const left = live(store.getState().transactions)
    expect(left).toHaveLength(1)
    expect(left[0].splitId).toBeUndefined()
  })

  it('is checked whole: a bad part saves nothing', async () => {
    const store = await openStore()
    expect(() => store.getState().saveSplit({ ...receipt, parts: [{ categoryId: 'cat-groceries', amount: 5_000 }, { categoryId: 'inc-salary', amount: 1_000 }] })).toThrow('Pick an expense category.')
    expect(store.getState().transactions).toHaveLength(0)
  })

  it('is deleted whole, and brought back whole', async () => {
    const store = await openStore()
    const { parts } = store.getState().saveSplit({ ...receipt, parts: [{ categoryId: 'cat-groceries', amount: 7_450 }, { categoryId: 'cat-household', amount: 2_000 }] })
    const restore = store.getState().deleteSplit(parts[0].splitId!)
    expect(live(store.getState().transactions)).toHaveLength(0)
    restore()
    expect(live(store.getState().transactions)).toHaveLength(2)
  })
})

describe('a refund in the store', () => {
  it('keeps only what a refund has: no fund, no split', async () => {
    const store = await openStore()
    const shoes = store.getState().addTransaction({ type: 'expense', amount: 8_000, date: '2026-11-02', accountId: ACCOUNT_IDS.cash, categoryId: 'cat-shopping' })
    const back = store.getState().addTransaction({ type: 'refund', amount: 3_000, date: '2026-11-05', accountId: ACCOUNT_IDS.cash, categoryId: 'cat-shopping', refundOf: shoes.id, splitId: 'x', goalId: 'g', fundAmount: 100 })
    expect(back).toMatchObject({ type: 'refund', refundOf: shoes.id })
    expect(back.splitId).toBeUndefined()
    expect(back.fundAmount).toBeUndefined()
    // An expense never says what it's money back for.
    const plain = store.getState().addTransaction({ type: 'expense', amount: 100, date: '2026-11-05', accountId: ACCOUNT_IDS.cash, categoryId: 'cat-shopping', refundOf: shoes.id })
    expect(plain.refundOf).toBeUndefined()
    expect(() => store.getState().addTransaction({ type: 'refund', amount: 5_001, date: '2026-11-06', accountId: ACCOUNT_IDS.cash, categoryId: 'cat-shopping', refundOf: shoes.id })).toThrow('Only 5,000 DA')
  })
})
