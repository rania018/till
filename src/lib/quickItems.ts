import { subDays } from 'date-fns'
import type { Account, Category, ID, ISODate, QuickItem, Transaction } from '../types'
import { fromISODate, toISODate } from './dates'
import { live } from './id'
import { newestFirst } from './transactions'

/** What "often" looks back over. */
const WINDOW_DAYS = 90
/** Logged this many times, the same each time, it's worth saving. */
export const OFTEN_COUNT = 3
const MAX_SUGGESTIONS = 3

type Refs = { accounts: Account[]; categories: Category[] }

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

const recentExpenses = (transactions: Transaction[], today: ISODate) => {
  const since = toISODate(subDays(fromISODate(today), WINDOW_DAYS))
  return live(transactions).filter((t) => t.type === 'expense' && t.date >= since && t.date <= today)
}

/** The one a person reaches for most comes first, from what was logged lately. Ties keep the order they were saved in. */
export function quickItemsByUse(items: QuickItem[], transactions: Transaction[], today: ISODate): QuickItem[] {
  const recent = recentExpenses(transactions, today)
  const uses = new Map(live(items).map((item) => [item.id, recent.filter((t) => t.note && sameName(t.note, item.name)).length]))
  return live(items).sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.createdAt.localeCompare(b.createdAt))
}

/** One tap can only log it if its wallet and category are still there. A closed wallet or deleted category needs a look first. */
export function isQuickItemUsable(item: Pick<QuickItem, 'accountId' | 'categoryId'>, { accounts, categories }: Refs): boolean {
  const usableWallet = live(accounts).some((a) => a.id === item.accountId && !a.archived)
  const usableCategory = live(categories).some((c) => c.id === item.categoryId && c.kind === 'expense')
  return usableWallet && usableCategory
}

export interface QuickSuggestion {
  name: string
  amount: number
  categoryId: ID
  accountId: ID
  currency?: string
  count: number
}

/**
 * Things logged again and again, the same each time, that aren't saved yet. Bills have their own
 * place, and a note of several lines is a basket, not one thing bought again.
 */
export function quickSuggestions(items: QuickItem[], transactions: Transaction[], refs: Refs, today: ISODate): QuickSuggestion[] {
  const saved = live(items)
  const groups = new Map<string, QuickSuggestion>()
  for (const t of recentExpenses(transactions, today).sort(newestFirst)) {
    const name = t.note?.trim()
    if (!name || name.includes('\n') || t.billId || !t.categoryId) continue
    if (saved.some((item) => sameName(item.name, name))) continue
    if (!isQuickItemUsable({ accountId: t.accountId, categoryId: t.categoryId }, refs)) continue
    const key = [name.toLowerCase(), t.amount, t.categoryId, t.accountId].join('|')
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { name, amount: t.amount, categoryId: t.categoryId, accountId: t.accountId, currency: t.currency, count: 1 })
  }
  return [...groups.values()]
    .filter((g) => g.count >= OFTEN_COUNT)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_SUGGESTIONS)
}
