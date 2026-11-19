import { describe, expect, it } from 'vitest'
import type { StateStorage } from 'zustand/middleware'
import { ACCOUNT_IDS } from '../store/defaults'
import { createAppStore, whenHydrated } from '../store/store'
import type { Transaction } from '../types'
import { knownTags, normalizeTags, tagSummaries, tagSummary } from './tags'
import { filterTransactions } from './transactions'

let n = 0
function tx(fields: Partial<Transaction>): Transaction {
  n++
  return { id: `t${n}`, createdAt: `2026-06-01T10:00:${String(n).padStart(2, '0')}.000Z`, updatedAt: '', type: 'expense', amount: 0, date: '2026-06-01', accountId: 'acc-cash', categoryId: 'cat-groceries', ...fields }
}

describe('tags', () => {
  it('are one tag whatever the case or spaces, in the spelling they already have', () => {
    expect(normalizeTags([' wedding ', 'WEDDING', 'Trip  to Oran', ''], ['Wedding'])).toEqual(['Wedding', 'Trip to Oran'])
    expect(normalizeTags(['  '], [])).toBeUndefined()
    const entries = [tx({ tags: ['Trip'], date: '2026-05-01' }), tx({ tags: ['Wedding'], date: '2026-06-10' })]
    expect(knownTags(entries)).toEqual(['Wedding', 'Trip'])
  })

  it('add up what an event cost across categories and pay cycles, less money back, with what came in apart', () => {
    const entries = [
      tx({ tags: ['Wedding'], amount: 120_000, date: '2026-03-02', categoryId: 'cat-shopping' }),
      tx({ tags: ['Wedding'], amount: 80_000, date: '2026-05-20', categoryId: 'cat-eating-out' }),
      tx({ tags: ['wedding'], amount: 20_000, date: '2026-05-25', type: 'refund', categoryId: 'cat-shopping' }),
      tx({ tags: ['Wedding'], amount: 50_000, date: '2026-05-21', type: 'income', categoryId: 'inc-other' }),
      tx({ tags: ['Wedding'], amount: 100, date: '2026-05-21', currency: 'EUR' }),
      tx({ amount: 9_999, date: '2026-05-21' }),
      tx({ tags: ['Wedding'], amount: 1_000_000, deleted: true }),
    ]
    const summary = tagSummary(entries, 'WEDDING', 'DZD')!
    expect(summary).toMatchObject({ name: 'Wedding', count: 5, first: '2026-03-02', last: '2026-05-25', spent: 180_000, received: 50_000 })
    expect(summary.byCategory).toEqual([
      { categoryId: 'cat-shopping', spent: 100_000 },
      { categoryId: 'cat-eating-out', spent: 80_000 },
    ])
    // Other currencies are never added in.
    expect(summary.otherCurrencies).toEqual([{ currency: 'EUR', spent: 100, received: 0 }])
    expect(tagSummary(entries, 'Trip', 'DZD')).toBeNull()
    expect(tagSummaries(entries, 'DZD').map((s) => s.name)).toEqual(['Wedding'])
  })

  it('filter Activity, and search finds them', () => {
    const names = { categories: [], accounts: [], goals: [], debts: [] }
    const entries = [tx({ tags: ['Wedding'] }), tx({ tags: ['Trip'] }), tx({})]
    expect(filterTransactions(entries, { tag: 'wedding' }, names)).toHaveLength(1)
    expect(filterTransactions(entries, { query: 'trip' }, names)).toHaveLength(1)
  })
})

function memoryStorage(): StateStorage {
  const saved = new Map<string, string>()
  return { getItem: (name) => saved.get(name) ?? null, setItem: (name, value) => void saved.set(name, value), removeItem: (name) => void saved.delete(name) }
}

async function openStore() {
  const store = createAppStore(memoryStorage())
  await whenHydrated(store)
  return store
}

describe('tags in the store', () => {
  it('join the spelling there is, stay off transfers, and go on every part of a split', async () => {
    const store = await openStore()
    store.getState().addTransaction({ type: 'expense', amount: 5_000, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-shopping', tags: ['Wedding'] })
    const second = store.getState().addTransaction({ type: 'expense', amount: 3_000, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-shopping', tags: [' wedding', 'Gifts', 'gifts'] })
    expect(second.tags).toEqual(['Wedding', 'Gifts'])
    const move = store.getState().addTransaction({ type: 'transfer', amount: 1_000, accountId: ACCOUNT_IDS.bank, toAccountId: ACCOUNT_IDS.cash, tags: ['Wedding'] })
    expect(move.tags).toBeUndefined()
    const { parts } = store.getState().saveSplit({ date: '2026-06-01', accountId: ACCOUNT_IDS.cash, tags: ['wedding'], parts: [{ categoryId: 'cat-groceries', amount: 2_000 }, { categoryId: 'cat-household', amount: 1_000 }] })
    expect(parts.map((p) => p.tags)).toEqual([['Wedding'], ['Wedding']])
    expect(() => store.getState().addTransaction({ type: 'expense', amount: 1, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-shopping', tags: ['x'.repeat(41)] })).toThrow()
  })

  it('rename on every entry, join another tag, and come off with Undo', async () => {
    const store = await openStore()
    const add = (tags: string[]) => store.getState().addTransaction({ type: 'expense', amount: 1_000, accountId: ACCOUNT_IDS.cash, categoryId: 'cat-shopping', tags })
    add(['Wedding'])
    add(['Wedding', 'Gifts'])
    add(['Trip'])
    const tagsNow = () => store.getState().transactions.map((t) => t.tags)

    const undoRename = store.getState().renameTag('wedding', 'Our wedding')
    expect(tagsNow()).toEqual([['Our wedding'], ['Our wedding', 'Gifts'], ['Trip']])
    undoRename()
    expect(tagsNow()).toEqual([['Wedding'], ['Wedding', 'Gifts'], ['Trip']])

    // Renaming to a tag that's there joins the two, once each.
    store.getState().renameTag('Gifts', 'wedding')
    expect(tagsNow()).toEqual([['Wedding'], ['Wedding'], ['Trip']])
    expect(() => store.getState().renameTag('Trip', '  ')).toThrow()

    const undoDelete = store.getState().deleteTag('Wedding')
    expect(tagsNow()).toEqual([undefined, undefined, ['Trip']])
    undoDelete()
    expect(tagsNow()).toEqual([['Wedding'], ['Wedding'], ['Trip']])
  })
})
