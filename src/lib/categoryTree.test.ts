import { describe, expect, it } from 'vitest'
import { createInitialData, defaultCategories, groupCategories, GROUPED_AT } from '../store/defaults'
import { migrate } from '../store/migrations'
import type { Category, Transaction } from '../types'
import { categoryBudgets } from './budget'
import { categoryColor, familyIds, freeColor, mainCategories, mainIdOf, rollUp } from './categoryTree'
import { getPayCycle } from './dates'
import { comparePeriods, incomeBreakdown, itemEntries, itemHistory, mainCategoryBreakdown, mainCategoryHistory, subcategoryBreakdown, topItems, walletFlows } from './stats'
import { filterTransactions } from './transactions'
import { checkCategoryTree } from './validation'

const OLD = '2026-10-01T00:00:00.000Z'

/** Categories as an install from before main categories had them: no groups, no parents, no colours. */
function before11(): Category[] {
  return defaultCategories(OLD)
    .filter((c) => !c.id.startsWith('cat-g-'))
    .map((c) => {
      const old = { ...c }
      delete old.parentId
      delete old.color
      return old
    })
}

const tx = (id: string, fields: Partial<Transaction>): Transaction => ({
  id,
  createdAt: `2026-11-01T00:00:${id.padStart(2, '0')}Z`,
  updatedAt: '',
  type: 'expense',
  amount: 100,
  date: '2026-11-02',
  accountId: 'acc-cash',
  ...fields,
})

describe('grouping older categories into main ones', () => {
  it('adds the main categories, puts each built-in one under its own, and colours the main ones', () => {
    const grouped = groupCategories(before11())
    const byId = new Map(grouped.map((c) => [c.id, c]))
    expect(byId.get('cat-groceries')?.parentId).toBe('cat-g-food')
    expect(byId.get('cat-housing')?.parentId).toBe('cat-g-home')
    expect(byId.get('cat-untracked')?.parentId).toBe('cat-other')
    expect(byId.get('cat-transport')?.parentId).toBeUndefined()
    expect(byId.get('cat-transport')?.color).toBe(7)
    expect(byId.get('cat-g-food')).toMatchObject({ kind: 'expense', color: 5, createdAt: GROUPED_AT })
    expect(byId.get('inc-salary')?.parentId).toBeUndefined()
    expect(mainCategories(grouped).map((c) => c.id)).toEqual(['cat-g-home', 'cat-g-food', 'cat-transport', 'cat-g-health', 'cat-shopping', 'cat-g-leisure', 'cat-g-family', 'cat-other'])
  })

  it('gives every device the same records and the same time, so sync has nothing to send back and forth', () => {
    const a = groupCategories(before11())
    const b = groupCategories(before11())
    expect(a).toEqual(b)
    expect(a.find((c) => c.id === 'cat-groceries')?.updatedAt).toBe(GROUPED_AT)
    // Running it again changes nothing.
    expect(groupCategories(a)).toEqual(a)
  })

  it('puts someone’s own category under Other, keeps a later edit’s time, and leaves a group alone', () => {
    const own: Category = { ...before11()[0], id: 'cat-car', name: 'Car', updatedAt: '2026-11-07T10:00:00.000Z' }
    const grouped = groupCategories([...before11(), own])
    expect(grouped.find((c) => c.id === 'cat-car')).toMatchObject({ parentId: 'cat-other', updatedAt: '2026-11-07T10:00:00.000Z' })
    const already = groupCategories(grouped).find((c) => c.id === 'cat-car')
    expect(already?.parentId).toBe('cat-other')
  })

  it('happens when older saved data is loaded', () => {
    const old = { ...createInitialData(new Date(2026, 9, 1)), categories: before11() }
    const migrated = migrate(old, 10)
    expect(migrated.categories.find((c) => c.id === 'cat-eating-out')?.parentId).toBe('cat-g-food')
    expect(migrated.categories.filter((c) => c.id.startsWith('cat-g-'))).toHaveLength(5)
  })
})

describe('main categories and their subcategories', () => {
  const categories = defaultCategories(OLD)

  it('finds a category’s main one, its family, and its colour', () => {
    expect(mainIdOf(categories, 'cat-groceries')).toBe('cat-g-food')
    expect(mainIdOf(categories, 'cat-transport')).toBe('cat-transport')
    expect([...familyIds(categories, 'cat-g-food')].sort()).toEqual(['cat-eating-out', 'cat-g-food', 'cat-groceries'])
    expect(categoryColor(categories, 'cat-groceries')).toBe('var(--cat-5)')
    expect(categoryColor(categories, 'cat-other')).toBe('var(--cat-other)')
    expect(rollUp(new Map([['cat-groceries', 300], ['cat-eating-out', 200], ['cat-transport', 50]]), categories)).toEqual(new Map([['cat-g-food', 500], ['cat-transport', 50]]))
    // A new main category gets the colour nobody uses yet.
    expect(freeColor(categories)).toBe(2)
  })

  it('only lets a spending category sit under a main spending one, one level deep', () => {
    expect(checkCategoryTree(categories, 'cat-transport', 'cat-g-food')).toBeNull()
    expect(checkCategoryTree(categories, null, 'cat-groceries')).not.toBeNull()
    expect(checkCategoryTree(categories, 'cat-g-food', 'cat-g-home')).not.toBeNull()
    expect(checkCategoryTree(categories, 'cat-transport', 'cat-transport')).not.toBeNull()
    expect(checkCategoryTree(categories, 'inc-bonus', 'cat-g-food', 'income')).not.toBeNull()
    expect(checkCategoryTree(categories, 'cat-groceries', undefined)).toBeNull()
  })

  it('a main category’s limit counts its subcategories, and a subcategory keeps its own', () => {
    const limited = categories.map((c) => (c.id === 'cat-g-food' ? { ...c, monthlyBudget: 10_000 } : c.id === 'cat-eating-out' ? { ...c, monthlyBudget: 3_000 } : c))
    const spent = [tx('1', { categoryId: 'cat-groceries', amount: 4_000 }), tx('2', { categoryId: 'cat-eating-out', amount: 2_500 })]
    const rows = categoryBudgets(limited, spent, getPayCycle('2026-11-02', { frequency: 'monthly', payday: 1 } as Parameters<typeof getPayCycle>[1]), 80)
    expect(rows.find((r) => r.categoryId === 'cat-g-food')).toMatchObject({ spent: 6_500, remaining: 3_500 })
    expect(rows.find((r) => r.categoryId === 'cat-eating-out')).toMatchObject({ spent: 2_500, remaining: 500 })
  })

  it('filtering by a main category takes in its subcategories', () => {
    const entries = [tx('1', { categoryId: 'cat-groceries' }), tx('2', { categoryId: 'cat-eating-out' }), tx('3', { categoryId: 'cat-transport' })]
    const names = { categories, accounts: [], goals: [], debts: [] }
    expect(filterTransactions(entries, { categoryId: 'cat-g-food' }, names).map((t) => t.id).sort()).toEqual(['1', '2'])
    expect(filterTransactions(entries, { categoryId: 'cat-groceries' }, names).map((t) => t.id)).toEqual(['1'])
  })
})

describe('stats by main category, income, wallets, what is bought most, and two pay cycles', () => {
  const categories = defaultCategories(OLD)
  const november = { start: '2026-11-01', end: '2026-11-30' }
  const october = { start: '2026-10-01', end: '2026-10-31' }
  const entries = [
    tx('1', { categoryId: 'cat-groceries', amount: 450, note: 'Bread' }),
    tx('2', { categoryId: 'cat-groceries', amount: 550, note: 'bread\nand milk' }),
    tx('3', { categoryId: 'cat-eating-out', amount: 250, note: 'Coffee', accountId: 'acc-bank' }),
    tx('4', { categoryId: 'cat-transport', amount: 1_200, note: 'Taxi' }),
    tx('5', { categoryId: 'cat-groceries', amount: 300, date: '2026-10-05' }),
    tx('6', { type: 'income', categoryId: 'inc-salary', amount: 60_000, accountId: 'acc-bank' }),
    tx('7', { type: 'income', categoryId: 'inc-side', amount: 20_000, accountId: 'acc-bank' }),
  ]

  it('adds subcategories into their main category, and lists one main category’s subcategories', () => {
    expect(mainCategoryBreakdown(entries, november, october, categories).map((r) => [r.categoryId, r.spent, r.previous])).toEqual([
      ['cat-g-food', 1_250, 300],
      ['cat-transport', 1_200, 0],
    ])
    expect(subcategoryBreakdown(entries, november, october, categories, 'cat-g-food').map((r) => [r.categoryId, r.spent])).toEqual([
      ['cat-groceries', 1_000],
      ['cat-eating-out', 250],
    ])
    expect(mainCategoryHistory(entries, [october, november], categories).get('cat-g-food')).toEqual([300, 1_250])
  })

  it('says where income came from, and what each wallet spent and received', () => {
    expect(incomeBreakdown(entries, november)).toEqual([
      { categoryId: 'inc-salary', received: 60_000, share: 0.75 },
      { categoryId: 'inc-side', received: 20_000, share: 0.25 },
    ])
    const accounts = createInitialData(new Date(2026, 9, 1)).accounts
    expect(walletFlows(entries, accounts, november)).toEqual([
      { accountId: 'acc-cash', spent: 2_200, received: 0 },
      { accountId: 'acc-bank', spent: 250, received: 80_000 },
    ])
  })

  it('counts the same note as the same thing, whatever its case, and puts the costliest first', () => {
    const items = topItems(entries, november)
    expect(items[0]).toEqual({ name: 'Taxi', count: 1, total: 1_200, categoryId: 'cat-transport' })
    expect(items[1]).toEqual({ name: 'Bread', count: 2, total: 1_000, categoryId: 'cat-groceries' })
  })

  it('follows one item across pay cycles, the same way the top list counts it', () => {
    const yogurt = [
      tx('50', { note: 'Yogurt', amount: 1_250, date: '2026-10-05' }),
      tx('51', { note: 'yogurt', amount: 100, date: '2026-11-03' }),
      tx('52', { note: ' YOGURT \nfor the kids', amount: 150, date: '2026-11-04' }),
      tx('53', { note: 'Yogurt drink', amount: 999, date: '2026-11-04' }),
      tx('54', { note: 'Yogurt', amount: 999, date: '2026-11-05', type: 'refund' }),
      tx('55', { note: 'Yogurt', amount: 999, date: '2026-11-06', deleted: true }),
    ]
    const bought = itemEntries(yogurt, ' yogurt ')
    expect(bought.map((t) => t.id)).toEqual(['50', '51', '52'])
    expect(itemHistory(bought, [october, november]).map(({ count, amount }) => [count, amount])).toEqual([
      [1, 1_250],
      [2, 250],
    ])
    expect(itemHistory(bought, [november])[0].amount).toBe(topItems(yogurt, november).find((i) => i.name.toLowerCase() === 'yogurt')?.total)
    expect(itemEntries(yogurt, '  ')).toEqual([])
  })

  it('counts how many were bought, and says when some entries do not say', () => {
    const yogurt = [
      tx('60', { note: 'Yogurt', amount: 1_250, quantity: 25, date: '2026-11-03' }),
      tx('61', { note: 'Yogurt', amount: 100, quantity: 2, date: '2026-11-04' }),
      tx('62', { note: 'yogurt', amount: 300, date: '2026-11-05' }),
      tx('63', { note: 'Yogurt', amount: 1_250, date: '2026-10-05' }),
    ]
    const [october, soFar] = itemHistory(itemEntries(yogurt, 'Yogurt'), [{ start: '2026-10-01', end: '2026-10-31' }, november])
    expect(soFar).toMatchObject({ count: 3, amount: 1_650, units: 27, unitSpent: 1_350, uncounted: 1 })
    expect(october).toMatchObject({ count: 1, amount: 1_250, units: 0, unitSpent: 0, uncounted: 1 })
    expect(topItems(yogurt, november)[0]).toMatchObject({ count: 3, total: 1_650, units: 27, unitSpent: 1_350 })
  })

  it('compares two periods per main category, the biggest change first', () => {
    expect(comparePeriods(entries, october, november, categories)).toEqual([
      { categoryId: 'cat-transport', a: 0, b: 1_200 },
      { categoryId: 'cat-g-food', a: 300, b: 1_250 },
    ])
  })
})
