import { describe, expect, it } from 'vitest'
import type { Account, PaySchedule, Transaction } from '../types'
import { activityLinkFor, detailEntries, detailParams, readDetail, type Detail } from './detail'
import { categoryHistory, dailySpending } from './stats'
import { filterTransactions } from './transactions'

const tx = (id: string, fields: Partial<Transaction>): Transaction => ({
  id,
  createdAt: `2026-11-01T00:00:0${id.length}Z`,
  updatedAt: '',
  type: 'expense',
  amount: 100,
  date: '2026-11-02',
  accountId: 'acc-cash',
  categoryId: 'cat-groceries',
  ...fields,
})

const accounts: Pick<Account, 'id' | 'kind'>[] = [
  { id: 'acc-cash', kind: 'cash' },
  { id: 'acc-bank', kind: 'bank' },
]

const entries: Transaction[] = [
  tx('a', { amount: 450, date: '2026-11-02' }),
  tx('b', { amount: 1200, date: '2026-11-03', accountId: 'acc-bank', billId: 'bill-net', categoryId: 'cat-bills' }),
  tx('c', { type: 'refund', amount: 50, date: '2026-11-04' }),
  tx('d', { type: 'income', amount: 60000, date: '2026-10-25', categoryId: 'inc-salary', accountId: 'acc-bank' }),
  tx('e', { type: 'goal-deposit', amount: 5000, date: '2026-10-25', categoryId: undefined, goalId: 'goal-laptop' }),
  tx('f', { type: 'debt-out', amount: 2000, date: '2026-09-10', categoryId: undefined, debtId: 'debt-sami' }),
  tx('g', { amount: 300, date: '2026-11-08' }),
  tx('h', { amount: 999, date: '2026-11-02', deleted: true }),
]
const cycle = { start: '2026-10-25', end: '2026-11-24' }
const ids = (detail: Detail) => detailEntries(entries, accounts, detail).map((t) => t.id)

describe('the details panel', () => {
  it('lives in the URL and reads back what it wrote', () => {
    const detail: Detail = { target: { kind: 'category', id: 'cat-groceries' }, range: cycle }
    const params = new URLSearchParams(Object.entries(detailParams(detail)).filter((e): e is [string, string] => !!e[1]))
    expect(readDetail(params)).toEqual(detail)
    expect(readDetail(new URLSearchParams('detail=day:2026-11-02'))).toEqual({ target: { kind: 'day', date: '2026-11-02' }, range: { start: '2026-11-02', end: '2026-11-02' } })
    // A debt is shown over its whole life, whatever dates come with it.
    expect(readDetail(new URLSearchParams('detail=debt:debt-sami&dfrom=2026-11-01&dto=2026-11-30'))?.range).toBeNull()
    expect(readDetail(new URLSearchParams('detail=weekday:9'))).toBeNull()
    expect(readDetail(new URLSearchParams('detail=part:everything'))).toBeNull()
    expect(readDetail(new URLSearchParams('detail=day:soon'))).toBeNull()
    expect(readDetail(new URLSearchParams('detail=category:x&dfrom=2026-11-30&dto=2026-11-01'))?.range).toBeNull()
  })

  it('lists exactly the entries behind what was clicked', () => {
    expect(ids({ target: { kind: 'category', id: 'cat-groceries' }, range: cycle })).toEqual(['g', 'c', 'a'])
    expect(ids({ target: { kind: 'day', date: '2026-11-02' }, range: { start: '2026-11-02', end: '2026-11-02' } })).toEqual(['a'])
    // Everyday spending on Mondays (2 Nov 2026 is a Monday): bills fall on fixed days, so they're left out.
    expect(ids({ target: { kind: 'weekday', day: 1 }, range: cycle })).toEqual(['a'])
    expect(ids({ target: { kind: 'debt', id: 'debt-sami' }, range: null })).toEqual(['f'])
    expect(ids({ target: { kind: 'part', part: 'bills' }, range: cycle })).toEqual(['b'])
    expect(ids({ target: { kind: 'part', part: 'everyday' }, range: cycle })).toEqual(['g', 'c', 'a'])
    expect(ids({ target: { kind: 'part', part: 'cash' }, range: cycle })).toEqual(['g', 'c', 'a'])
    expect(ids({ target: { kind: 'part', part: 'card' }, range: cycle })).toEqual(['b'])
    expect(ids({ target: { kind: 'part', part: 'income' }, range: cycle })).toEqual(['d'])
    expect(ids({ target: { kind: 'part', part: 'goals' }, range: cycle })).toEqual(['e'])
  })

  it('opens the same entries in Activity where it can show them', () => {
    const salary = { amount: 60000, frequency: 'monthly', payday: 25, accountId: 'acc-bank' } as PaySchedule
    expect(activityLinkFor({ target: { kind: 'category', id: 'cat-groceries' }, range: cycle }, salary)).toBe('/activity/list?category=cat-groceries&cycle=2026-10-25')
    expect(activityLinkFor({ target: { kind: 'day', date: '2026-11-02' }, range: { start: '2026-11-02', end: '2026-11-02' } }, salary)).toBe('/activity/list?from=2026-11-02&to=2026-11-02')
    expect(activityLinkFor({ target: { kind: 'debt', id: 'debt-sami' }, range: null }, salary)).toBe('/activity/list?debt=debt-sami')
    expect(activityLinkFor({ target: { kind: 'part', part: 'goals' }, range: cycle }, salary)).toBe('/activity/list?kind=goal&cycle=2026-10-25')
    expect(activityLinkFor({ target: { kind: 'part', part: 'cash' }, range: cycle }, salary)).toBeNull()
    expect(activityLinkFor({ target: { kind: 'weekday', day: 1 }, range: cycle }, salary)).toBeNull()
  })

  it('filters Activity to one debt', () => {
    const names = { categories: [], accounts: [], goals: [], debts: [] }
    expect(filterTransactions(entries, { debtId: 'debt-sami' }, names).map((t) => t.id)).toEqual(['f'])
  })
})

describe('day by day, and each category over the cycles', () => {
  it('adds up each day, refunds taken off, with days to come left empty', () => {
    const days = dailySpending(entries, { start: '2026-11-02', end: '2026-11-06' }, '2026-11-04')
    expect(days).toEqual([
      { date: '2026-11-02', spent: 450 },
      { date: '2026-11-03', spent: 1200 },
      // A refund on a day with nothing spent doesn't make it negative.
      { date: '2026-11-04', spent: 0 },
      { date: '2026-11-05', spent: null },
      { date: '2026-11-06', spent: null },
    ])
  })

  it('gives each category one figure per pay cycle, oldest first', () => {
    const cycles = [
      { start: '2026-09-25', end: '2026-10-24' },
      { start: '2026-10-25', end: '2026-11-24' },
    ]
    const history = categoryHistory(entries, cycles)
    expect(history.get('cat-groceries')).toEqual([0, 700])
    expect(history.get('cat-bills')).toEqual([0, 1200])
    expect(history.has('inc-salary')).toBe(false)
  })
})
