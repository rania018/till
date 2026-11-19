import { describe, expect, it } from 'vitest'
import { PREVIEW_TODAY, previewExample } from '../test/previewExample'
import type { Transaction } from '../types'
import { pressKeypadKey, type KeypadKey } from './amountText'
import { noMoneyEntries } from './debts'
import { categoriesByUsage, direction, mainsByUsage, filterNoMoneyEntries, filterTransactions, groupByDay, recentNotes, totals } from './transactions'

const data = previewExample()
const cycle = { start: '2026-10-25', end: '2026-11-24' }
const find = (filter: Parameters<typeof filterTransactions>[1]) => filterTransactions(data.transactions, filter, data)

describe('filterTransactions', () => {
  it('lists the cycle newest first', () => {
    const list = find({ range: cycle })
    expect(list[0]).toMatchObject({ date: PREVIEW_TODAY, note: 'Coffee' })
    expect(list.at(-1)!.date).toBe('2026-10-25')
    expect(list).toHaveLength(data.transactions.length)
  })

  it('filters by kind', () => {
    expect(find({ kind: 'income' }).map((t) => t.amount)).toEqual([60_000])
    expect(find({ kind: 'transfer' })).toHaveLength(3)
    expect(find({ kind: 'goal' })).toHaveLength(2)
  })

  it('includes transfers in and out when filtering by wallet', () => {
    const cash = find({ accountId: 'acc-cash' })
    expect(cash.filter((t) => t.type === 'transfer')).toHaveLength(3)
    expect(cash.every((t) => t.accountId === 'acc-cash' || t.toAccountId === 'acc-cash')).toBe(true)
  })

  it('searches notes, category names and amounts', () => {
    expect(find({ query: 'coffee' }).map((t) => t.amount)).toEqual([250, 4_350])
    expect(find({ query: 'MARKET' })).toHaveLength(1)
    expect(find({ query: '2,350' }).map((t) => t.note)).toEqual(['Market'])
    expect(find({ query: 'groceries' })).toHaveLength(2)
    expect(find({ query: 'nothing like this' })).toEqual([])
  })

  it('skips deleted transactions', () => {
    const withDeleted = [...data.transactions, { ...data.transactions[0], id: 'gone', deleted: true }]
    expect(filterTransactions(withDeleted, {}, data)).toHaveLength(data.transactions.length)
  })
})

describe('debt amounts with no money moved', () => {
  const debt = { id: 'd', createdAt: '', updatedAt: '', direction: 'borrowed', person: 'Karim', date: '2026-10-28', archived: false, startingAmount: 3_000, note: 'Old loan', charges: [{ id: 'c', date: '2026-11-02', amount: 1_500, note: 'Netflix' }] } as const
  const entries = noMoneyEntries([{ ...debt, charges: [...debt.charges] }])
  const ids = (filter: Parameters<typeof filterNoMoneyEntries>[1]) => filterNoMoneyEntries(entries, filter).map((e) => e.id)

  it('lists what a debt started with and each charge, newest first', () => {
    expect(ids({})).toEqual(['c', 'd-start'])
    expect(entries.find((e) => e.id === 'd-start')).toMatchObject({ date: '2026-10-28', amount: 3_000, note: 'Old loan' })
  })

  it('skips a starting amount of 0 and deleted debts', () => {
    expect(noMoneyEntries([{ ...debt, startingAmount: 0, charges: [] }])).toEqual([])
    expect(noMoneyEntries([{ ...debt, charges: [...debt.charges], deleted: true }])).toEqual([])
  })

  it('keeps a closed debt: its history stays', () => {
    expect(noMoneyEntries([{ ...debt, charges: [...debt.charges], archived: true }])).toHaveLength(2)
  })

  it('shows under the Debts kind, and not under other kinds, wallets or categories', () => {
    expect(ids({ kind: 'debt' })).toHaveLength(2)
    expect(ids({ kind: 'expense' })).toEqual([])
    expect(ids({ accountId: 'acc-cash' })).toEqual([])
    expect(ids({ categoryId: 'food' })).toEqual([])
  })

  it('stays in its date range', () => {
    expect(ids({ range: { start: '2026-11-01', end: '2026-11-30' } })).toEqual(['c'])
  })

  it('is found by person, note or amount', () => {
    expect(ids({ query: 'karim' })).toHaveLength(2)
    expect(ids({ query: 'netflix' })).toEqual(['c'])
    expect(ids({ query: '3000' })).toEqual(['d-start'])
    expect(ids({ query: 'nothing like it' })).toEqual([])
  })

  it('gets its own day, sits under that day\'s transactions, and is never counted as spent', () => {
    const groups = groupByDay([{ ...data.transactions[0], id: 'x', type: 'expense', amount: 200, date: '2026-11-02', currency: undefined }], 'DZD', entries)
    expect(groups.map((g) => g.date)).toEqual(['2026-11-02', '2026-10-28'])
    expect(groups[0]).toMatchObject({ spent: 200, transactions: [{ id: 'x' }], noMoney: [{ id: 'c' }] })
    expect(groups[1]).toMatchObject({ spent: 0, transactions: [], noMoney: [{ id: 'd-start' }] })
  })
})

describe('groupByDay and totals', () => {
  it('groups by day with what was spent that day', () => {
    const groups = groupByDay(find({ range: cycle }))
    expect(groups[0]).toMatchObject({ date: '2026-11-15', spent: 250 })
    expect(groups.find((g) => g.date === '2026-10-25')).toMatchObject({ spent: 3_000 })
    expect(groups.map((g) => g.date)).toEqual([...new Set(groups.map((g) => g.date))])
  })

  it('totals spending and income', () => {
    expect(totals(find({ range: cycle }))).toEqual({ spent: 38_300, received: 60_000 })
  })
})

describe('categoriesByUsage', () => {
  it('puts the most used categories first, then the usual order', () => {
    const order = categoriesByUsage(data.categories, data.transactions, 'expense', '2026-10-01').map((c) => c.id)
    expect(order.slice(0, 3)).toEqual(['cat-groceries', 'cat-eating-out', 'cat-shopping'])
    expect(order).not.toContain('cat-pets')
    expect(order).not.toContain('cat-untracked')
  })

  it('puts categories with a limit first before anything is logged', () => {
    const order = categoriesByUsage(data.categories, [], 'expense', '2026-10-01').map((c) => c.id)
    expect(order.slice(0, 4)).toEqual(['cat-household', 'cat-groceries', 'cat-eating-out', 'cat-personal-care'])
    // Main categories that hold subcategories aren't offered: entries go on a subcategory.
    expect(order).not.toContain('cat-g-food')
    expect(order).toContain('cat-transport')
    // It only holds the app's hidden Untracked cash, so it's still somewhere to put things.
    expect(order).toContain('cat-other')
    expect(order.indexOf('cat-housing')).toBeGreaterThan(order.indexOf('cat-other'))
  })

  it('lists income categories for income', () => {
    expect(categoriesByUsage(data.categories, data.transactions, 'income', '2026-10-01')[0].id).toBe('inc-salary')
  })
})

describe('mainsByUsage', () => {
  const since = '2026-10-01'
  const choices = (kind: 'expense' = 'expense') => categoriesByUsage(data.categories, data.transactions, kind, since)
  const entry = (id: string, categoryId: string): Transaction => ({ id, createdAt: '', updatedAt: '', type: 'expense', amount: 10, date: '2026-10-05', accountId: 'a', categoryId })

  it('counts what is logged under a main category, not just one subcategory', () => {
    const logged = [entry('1', 'cat-transport'), entry('2', 'cat-transport'), entry('3', 'cat-transport'), entry('4', 'cat-groceries'), entry('5', 'cat-groceries'), entry('6', 'cat-eating-out'), entry('7', 'cat-eating-out')]
    expect(mainsByUsage(choices(), data.categories, logged, since).slice(0, 2)).toEqual(['cat-g-food', 'cat-transport'])
  })

  it('offers main categories only, once each', () => {
    const order = mainsByUsage(choices(), data.categories, data.transactions, since)
    expect(new Set(order).size).toBe(order.length)
    expect(order).toContain('cat-g-food')
    expect(order).not.toContain('cat-groceries')
  })

  it('puts the chosen ones first and fills the rest from use, skipping any that are gone', () => {
    const logged = [entry('1', 'cat-groceries'), entry('2', 'cat-groceries')]
    const order = mainsByUsage(choices(), data.categories, logged, since, ['cat-shopping', 'missing', 'cat-shopping', 'cat-g-leisure'])
    expect(order.slice(0, 3)).toEqual(['cat-shopping', 'cat-g-leisure', 'cat-g-food'])
    expect(order).not.toContain('missing')
  })
})

describe('recentNotes', () => {
  it('offers the names used before in a category, newest first, once each', () => {
    const named = (note: string, date: string, extra: Partial<Transaction> = {}): Transaction => ({
      id: note + date,
      createdAt: '',
      updatedAt: '',
      type: 'expense',
      amount: 100,
      date,
      accountId: 'acc-cash',
      categoryId: 'cat-groceries',
      note,
      ...extra,
    })
    const transactions = [
      named('Ardis\nshampoo\nbread', '2026-11-01'),
      named('market', '2026-11-02'),
      named('Market', '2026-10-20'),
      named('Bakery', '2026-10-30', { deleted: true }),
      named('Pharmacy', '2026-10-31', { categoryId: 'cat-health' }),
      named('Refund', '2026-10-31', { type: 'income', categoryId: 'cat-groceries' }),
      named('', '2026-10-29'),
    ]
    expect(recentNotes(transactions, 'expense', 'cat-groceries', 5)).toEqual(['market', 'Ardis'])
    expect(recentNotes(transactions, 'expense', 'cat-groceries', 1)).toEqual(['market'])
    expect(recentNotes(transactions, 'expense', 'cat-travel', 5)).toEqual([])
  })
})

describe('direction', () => {
  const transfer = data.transactions.find((t) => t.type === 'transfer') as Transaction

  it('shows a transfer as out of one wallet and into the other', () => {
    expect(direction(transfer, 'acc-bank')).toBe('out')
    expect(direction(transfer, 'acc-cash')).toBe('in')
    expect(direction(transfer)).toBe('move')
    expect(direction(data.transactions.find((t) => t.type === 'expense')!)).toBe('out')
  })
})

describe('pressKeypadKey', () => {
  const press = (...keys: KeypadKey[]) => keys.reduce(pressKeypadKey, '')

  it('types cents: one point, two digits at most', () => {
    expect(press('1', '5', '.', '9', '9')).toBe('15.99')
    expect(press('.', '5')).toBe('0.5')
    expect(press('1', '.', '.', '5')).toBe('1.5')
    expect(press('1', '.', '2', '3', '4')).toBe('1.23')
    expect(press('1', '.', '2', 'back', 'back')).toBe('1')
  })

  it('types whole amounts', () => {
    expect(press('1', '4', '5', '0')).toBe('1450')
    expect(press('6', '000', '0')).toBe('60000')
    expect(press('1', '4', 'back', '5')).toBe('15')
  })

  it('ignores leading zeros and 000 on an empty amount', () => {
    expect(press('0', '0', '7')).toBe('7')
    expect(press('000')).toBe('')
    expect(press('back')).toBe('')
  })

  it('stops at 12 digits', () => {
    // A fourth 000 would make 13 digits, so it's refused; single digits still fit up to 12.
    expect(press('9', '000', '000', '000', '000')).toBe('9000000000')
    expect(press('9', '000', '000', '000', '000', '5', '5', '5')).toBe('900000000055')
    expect(press(...Array<KeypadKey>(14).fill('9'))).toHaveLength(12)
  })
})
