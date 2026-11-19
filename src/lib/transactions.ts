import { toLatinDigits } from './amountText'
import type { Account, Category, CategoryKind, Debt, Goal, ID, ISODate, Transaction } from '../types'
import { familyIds, mainIdOf } from './categoryTree'
import { isMainCurrency } from './currency'
import type { NoMoneyEntry } from './debts'
import { isWithin } from './dates'
import { live } from './id'
import { sumAmounts } from './money'
import { isSpending, spentAmount } from './spending'
import { hasTag } from './tags'

export type TransactionKindFilter = 'expense' | 'income' | 'transfer' | 'goal' | 'debt'

export interface TransactionFilter {
  range?: { start: ISODate; end: ISODate }
  kind?: TransactionKindFilter
  /** Money that left or arrived in this wallet, transfers included. */
  accountId?: ID
  categoryId?: ID
  /** Matches notes, category and goal names, who a debt is with, tags, or digits of the amount. */
  query?: string
  /** Entries with this tag, whatever its case. */
  tag?: string
  /** Money that moved for this debt. */
  debtId?: ID
}

export interface Names {
  categories: Pick<Category, 'id' | 'name' | 'parentId'>[]
  accounts: Pick<Account, 'id' | 'name'>[]
  goals: Pick<Goal, 'id' | 'name'>[]
  debts: Pick<Debt, 'id' | 'person'>[]
}

export function nameOf(list: { id: ID; name: string }[], id: ID | undefined): string {
  return list.find((r) => r.id === id)?.name ?? ''
}

/** Newest first: by date, then by when it was entered. */
export function newestFirst(a: Transaction, b: Transaction): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

function matchesKind(t: Transaction, kind: TransactionKindFilter): boolean {
  if (kind === 'goal') return t.type === 'goal-deposit' || t.type === 'goal-withdrawal'
  if (kind === 'debt') return t.type === 'debt-out' || t.type === 'debt-in'
  // Money back for a purchase belongs with what was spent.
  if (kind === 'expense') return isSpending(t)
  return t.type === kind
}

/** Whether some text or an amount matches what was typed in search. Nothing typed matches everything. */
function searchMatcher(typed: string | undefined): (text: string, amount: number) => boolean {
  const query = typed?.trim().toLowerCase() ?? ''
  const digits = toLatinDigits(query).replace(/[\s,]/g, '')
  const searchesAmount = /^\d+$/.test(digits)
  return (text, amount) => text.toLowerCase().includes(query) || (searchesAmount && String(amount).includes(digits))
}

export function filterTransactions(transactions: Transaction[], filter: TransactionFilter, names: Names): Transaction[] {
  const query = filter.query?.trim() ?? ''
  const matches = searchMatcher(query)
  // A main category takes in its subcategories.
  const family = filter.categoryId ? familyIds(names.categories, filter.categoryId) : null

  return live(transactions)
    .filter((t) => {
      if (filter.range && !isWithin(t.date, filter.range)) return false
      if (filter.kind && !matchesKind(t, filter.kind)) return false
      if (filter.accountId && t.accountId !== filter.accountId && t.toAccountId !== filter.accountId) return false
      if (family && (!t.categoryId || !family.has(t.categoryId))) return false
      if (filter.tag && !hasTag(t, filter.tag)) return false
      if (filter.debtId && t.debtId !== filter.debtId) return false
      if (query) {
        const person = t.debtId ? names.debts.find((d) => d.id === t.debtId)?.person : undefined
        if (!matches([t.note, nameOf(names.categories, t.categoryId), nameOf(names.goals, t.goalId), person, ...(t.tags ?? [])].join(' '), t.amount)) return false
      }
      return true
    })
    .sort(newestFirst)
}

/** The same filter for debt amounts with no money moved: they have no wallet or category, so filtering by one leaves them out. */
export function filterNoMoneyEntries(entries: NoMoneyEntry[], filter: TransactionFilter): NoMoneyEntry[] {
  if (filter.accountId || filter.categoryId || filter.tag || (filter.kind && filter.kind !== 'debt')) return []
  const matches = searchMatcher(filter.query)
  return entries
    .filter((e) => (!filter.range || isWithin(e.date, filter.range)) && (!filter.debtId || e.debt.id === filter.debtId) && matches([e.note, e.debt.person].join(' '), e.amount))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export interface DayGroup {
  date: ISODate
  transactions: Transaction[]
  /** Amounts added to debts that day, with no money moved. Never part of `spent`. */
  noMoney: NoMoneyEntry[]
  /** Expenses that day, less refunds. */
  spent: number
}

/** Groups entries into days, newest first. A day's total only adds up the main currency. */
export function groupByDay(sorted: Transaction[], main?: string, noMoney: NoMoneyEntry[] = []): DayGroup[] {
  const days = new Map<ISODate, DayGroup>()
  const dayOf = (date: ISODate) => {
    const day = days.get(date) ?? { date, transactions: [], noMoney: [], spent: 0 }
    days.set(date, day)
    return day
  }
  for (const t of sorted) dayOf(t.date).transactions.push(t)
  for (const entry of noMoney) dayOf(entry.date).noMoney.push(entry)
  const groups = [...days.values()].sort((a, b) => b.date.localeCompare(a.date))
  for (const group of groups) group.spent = sumAmounts(group.transactions.filter((t) => isMainCurrency(t, main)).map(spentAmount))
  return groups
}

/** Spent (less refunds) and received. A refund is never income. */
export function totals(transactions: Transaction[]): { spent: number; received: number } {
  return { spent: sumAmounts(transactions.map(spentAmount)), received: sumAmounts(transactions.filter((t) => t.type === 'income').map((t) => t.amount)) }
}

/**
 * Categories you can pick for a new transaction: most used since `since` first,
 * then ones with a spending limit (everyday spending, not bills), then the usual
 * order. Puts the likely category within one tap, even before anything is logged.
 */
export function categoriesByUsage(categories: Category[], transactions: Transaction[], kind: CategoryKind, since: ISODate): Category[] {
  const uses = new Map<ID, number>()
  for (const t of live(transactions)) {
    if (t.type === kind && t.categoryId && t.date >= since) uses.set(t.categoryId, (uses.get(t.categoryId) ?? 0) + 1)
  }
  // A main category with subcategories only holds them: entries go on a subcategory. Switching a main one off hides its group.
  // The app's own hidden ones don't count: Other holds Untracked cash, and can still be picked.
  const containers = new Set(live(categories).filter((c) => c.parentId && !c.archived && !c.system).map((c) => c.parentId))
  const off = new Set(live(categories).filter((c) => !c.enabled || c.archived).map((c) => c.id))
  return live(categories)
    .filter((c) => c.kind === kind && c.enabled && !c.system && !c.archived && !containers.has(c.id) && !(c.parentId && off.has(c.parentId)))
    .sort(
      (a, b) =>
        (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) ||
        Number((b.monthlyBudget ?? 0) > 0) - Number((a.monthlyBudget ?? 0) > 0) ||
        a.order - b.order,
    )
}

/**
 * The main categories that can be picked from `choices`, in the order to offer them: the ones
 * someone chose, then the most used since `since` (what's logged under one counts for it), then
 * those with a spending limit, then the usual order.
 */
export function mainsByUsage(choices: Category[], categories: Category[], transactions: Transaction[], since: ISODate, chosen: ID[] = []): ID[] {
  const mains = new Set(choices.map((c) => mainIdOf(categories, c.id)))
  const uses = new Map<ID, number>()
  for (const t of live(transactions)) {
    if (t.type !== 'expense' || !t.categoryId || t.date < since) continue
    const main = mainIdOf(categories, t.categoryId)
    uses.set(main, (uses.get(main) ?? 0) + 1)
  }
  const limited = new Set(choices.filter((c) => (c.monthlyBudget ?? 0) > 0).map((c) => mainIdOf(categories, c.id)))
  const orderOf = (id: ID) => categories.find((c) => c.id === id)?.order ?? 0
  const picked = [...new Set(chosen)].filter((id) => mains.has(id))
  const others = [...mains]
    .filter((id) => !picked.includes(id))
    .sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0) || Number(limited.has(b)) - Number(limited.has(a)) || orderOf(a) - orderOf(b))
  return [...picked, ...others]
}

/**
 * Names given to recent entries of this kind in a category, newest first and
 * without repeats: one tap names the next one. Only a note's first line counts.
 */
export function recentNotes(transactions: Transaction[], type: 'expense' | 'income', categoryId: ID, limit: number): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const t of live(transactions)
    .filter((t) => t.type === type && t.categoryId === categoryId && t.note)
    .sort(newestFirst)) {
    const first = t.note!.split('\n').map((line) => line.trim()).find(Boolean)
    if (!first || seen.has(first.toLowerCase())) continue
    seen.add(first.toLowerCase())
    names.push(first)
    if (names.length >= limit) break
  }
  return names
}

export type Direction = 'out' | 'in' | 'move'

/**
 * Which way money went, seen from a wallet if one is given: a transfer is
 * money out of one wallet and into the other, and just a move otherwise.
 */
export function direction(t: Transaction, viewAccountId?: ID): Direction {
  switch (t.type) {
    case 'expense':
    case 'goal-deposit':
    case 'debt-out':
      return 'out'
    case 'income':
    case 'refund':
    case 'goal-withdrawal':
    case 'debt-in':
      return 'in'
    case 'transfer':
      if (viewAccountId === t.accountId) return 'out'
      if (viewAccountId === t.toAccountId) return 'in'
      return 'move'
  }
}
