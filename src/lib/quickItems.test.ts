import { describe, expect, it } from 'vitest'
import { createInitialData } from '../store/defaults'
import type { QuickItem, Transaction } from '../types'
import { isQuickItemUsable, OFTEN_COUNT, quickItemsByUse, quickSuggestions } from './quickItems'

const TODAY = '2026-11-05'
const data = createInitialData(new Date(2026, 0, 1, 9))
const refs = { accounts: data.accounts, categories: data.categories }
const CAT = data.categories.find((c) => c.kind === 'expense' && !c.system)!.id
const WALLET = data.accounts[0].id

let next = 0
const entry = (note: string | undefined, amount = 250, fields: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++next}`, createdAt: '', updatedAt: '', type: 'expense', amount, date: '2026-11-01', accountId: WALLET, categoryId: CAT, note, ...fields }) as Transaction
const many = (count: number, note: string, amount = 250, fields: Partial<Transaction> = {}) => Array.from({ length: count }, () => entry(note, amount, fields))
const item = (id: string, name: string, createdAt = '2026-01-01', fields: Partial<QuickItem> = {}): QuickItem =>
  ({ id, createdAt, updatedAt: createdAt, name, amount: 250, accountId: WALLET, categoryId: CAT, ...fields }) as QuickItem

describe('quickItemsByUse', () => {
  it('puts what was logged most lately first, ignoring case', () => {
    const items = [item('a', 'Bread', '2026-01-01'), item('b', 'Coffee', '2026-01-02')]
    const sorted = quickItemsByUse(items, [...many(1, 'bread'), ...many(3, 'COFFEE')], TODAY)
    expect(sorted.map((i) => i.name)).toEqual(['Coffee', 'Bread'])
  })

  it('keeps the saved order when there is nothing to go on', () => {
    const items = [item('b', 'Coffee', '2026-01-02'), item('a', 'Bread', '2026-01-01')]
    expect(quickItemsByUse(items, [], TODAY).map((i) => i.name)).toEqual(['Bread', 'Coffee'])
  })

  it('leaves out deleted items and does not count old or deleted entries', () => {
    const items = [item('a', 'Bread', '2026-01-01'), item('b', 'Coffee', '2026-01-02'), item('c', 'Gone', '2026-01-03', { deleted: true })]
    const old = many(5, 'Coffee', 250, { date: '2026-01-05' })
    const deleted = many(5, 'Coffee', 250, { deleted: true })
    expect(quickItemsByUse(items, [...old, ...deleted], TODAY).map((i) => i.name)).toEqual(['Bread', 'Coffee'])
  })
})

describe('isQuickItemUsable', () => {
  it('needs its wallet and category to still be there', () => {
    expect(isQuickItemUsable({ accountId: WALLET, categoryId: CAT }, refs)).toBe(true)
    expect(isQuickItemUsable({ accountId: 'gone', categoryId: CAT }, refs)).toBe(false)
    expect(isQuickItemUsable({ accountId: WALLET, categoryId: 'gone' }, refs)).toBe(false)
  })

  it('refuses a closed wallet and an income category', () => {
    const closed = { ...refs, accounts: refs.accounts.map((a) => ({ ...a, archived: true })) }
    expect(isQuickItemUsable({ accountId: WALLET, categoryId: CAT }, closed)).toBe(false)
    const income = data.categories.find((c) => c.kind === 'income')!.id
    expect(isQuickItemUsable({ accountId: WALLET, categoryId: income }, refs)).toBe(false)
  })
})

describe('quickSuggestions', () => {
  it('offers what was logged the same way, often enough', () => {
    const found = quickSuggestions([], many(OFTEN_COUNT, 'Coffee'), refs, TODAY)
    expect(found).toMatchObject([{ name: 'Coffee', amount: 250, count: OFTEN_COUNT, accountId: WALLET, categoryId: CAT }])
  })

  it('needs enough of them', () => {
    expect(quickSuggestions([], many(OFTEN_COUNT - 1, 'Coffee'), refs, TODAY)).toEqual([])
  })

  it('treats a different amount as a different thing', () => {
    const entries = [...many(2, 'Taxi', 300), ...many(2, 'Taxi', 500)]
    expect(quickSuggestions([], entries, refs, TODAY)).toEqual([])
  })

  it('leaves out what is saved already, whatever the case', () => {
    expect(quickSuggestions([item('a', 'coffee')], many(4, 'Coffee'), refs, TODAY)).toEqual([])
  })

  it('stops suggesting a saved item once it is deleted', () => {
    expect(quickSuggestions([item('a', 'Coffee', '2026-01-01', { deleted: true })], many(4, 'Coffee'), refs, TODAY)).toHaveLength(1)
  })

  it('leaves out bills, baskets, entries with no note, and other kinds of entry', () => {
    const entries = [
      ...many(4, 'Rent', 22_000, { billId: 'b1' }),
      ...many(4, 'bread\nmilk'),
      ...Array.from({ length: 4 }, () => entry(undefined)),
      ...many(4, 'Pay', 100, { type: 'income' }),
    ]
    expect(quickSuggestions([], entries, refs, TODAY)).toEqual([])
  })

  it('looks at the last 90 days only, and not at the future', () => {
    expect(quickSuggestions([], many(4, 'Old', 250, { date: '2026-08-01' }), refs, TODAY)).toEqual([])
    expect(quickSuggestions([], many(4, 'Later', 250, { date: '2026-11-20' }), refs, TODAY)).toEqual([])
  })

  it('skips entries whose wallet has closed', () => {
    expect(quickSuggestions([], many(4, 'Coffee', 250, { accountId: 'gone' }), refs, TODAY)).toEqual([])
  })

  it('offers the most repeated first, three at most', () => {
    const entries = [...many(3, 'A'), ...many(6, 'B'), ...many(5, 'C'), ...many(4, 'D')]
    expect(quickSuggestions([], entries, refs, TODAY).map((s) => s.name)).toEqual(['B', 'C', 'D'])
  })
})
