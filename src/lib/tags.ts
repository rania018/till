import type { ID, ISODate, Transaction, TransactionType } from '../types'
import { isMainCurrency, otherCurrencyTotals, type OtherCurrencyTotal } from './currency'
import { live } from './id'
import { roundMoney } from './money'
import { isSpending, spentAmount } from './spending'

/**
 * Tags group entries across categories and pay cycles, for an event like a wedding or a trip:
 * "what did it cost in total?". A tag is only a name on entries, so there's nothing to set up:
 * typing a new name makes a tag, and a tag with no entries left is gone. Names match whatever
 * their case or spacing, and keep the spelling they were first given.
 */

export const MAX_TAGS = 10
export const MAX_TAG_LENGTH = 40

/** Spending, money back for it, and income: what an event costs and what came in for it, like wedding gifts. */
export function canTag(type: TransactionType): boolean {
  return type === 'expense' || type === 'refund' || type === 'income'
}

/** How names are compared: "wedding " and "Wedding" are one tag. */
export function tagKey(name: string): string {
  return cleanName(name).toLocaleLowerCase()
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function hasTag(t: Pick<Transaction, 'tags'>, name: string): boolean {
  const key = tagKey(name)
  return !!t.tags?.some((tag) => tagKey(tag) === key)
}

/** Every tag in use, the most recently used first, each in the spelling it was first given. */
export function knownTags(transactions: Transaction[]): string[] {
  const spelling = new Map<string, string>()
  const lastUsed = new Map<string, string>()
  const oldest = live(transactions)
    .filter((t) => t.tags?.length)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  oldest.forEach((t, order) => {
    for (const tag of t.tags!) {
      if (!spelling.has(tagKey(tag))) spelling.set(tagKey(tag), tag)
      lastUsed.set(tagKey(tag), String(order).padStart(9, '0'))
    }
  })
  return [...spelling].sort(([a], [b]) => lastUsed.get(b)!.localeCompare(lastUsed.get(a)!)).map(([, name]) => name)
}

/** Trimmed, each once, in the spelling a tag already has. `undefined` when there are none. */
export function normalizeTags(tags: string[] | undefined, known: string[]): string[] | undefined {
  const spelling = new Map(known.map((name) => [tagKey(name), name]))
  const out = new Map<string, string>()
  for (const tag of tags ?? []) {
    const name = cleanName(tag)
    if (name && !out.has(tagKey(name))) out.set(tagKey(name), spelling.get(tagKey(name)) ?? name)
  }
  return out.size > 0 ? [...out.values()] : undefined
}

export interface TagSummary {
  name: string
  count: number
  first: ISODate
  last: ISODate
  /** In the main currency: spending less money back. */
  spent: number
  /** In the main currency. */
  received: number
  /** Spending and income in other currencies, never added in. */
  otherCurrencies: OtherCurrencyTotal[]
  /** Main-currency spending per category, biggest first. Categories with nothing left after refunds are left out. */
  byCategory: { categoryId: ID; spent: number }[]
}

/** What one tag's entries add up to. `null` when nothing has it. */
export function tagSummary(transactions: Transaction[], name: string, main: string): TagSummary | null {
  const tagged = live(transactions).filter((t) => hasTag(t, name))
  if (tagged.length === 0) return null
  let spent = 0
  let received = 0
  const byCategory = new Map<ID, number>()
  for (const t of tagged) {
    if (!isMainCurrency(t, main)) continue
    if (t.type === 'income') received += t.amount
    if (isSpending(t)) {
      spent += spentAmount(t)
      if (t.categoryId) byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + spentAmount(t))
    }
  }
  const dates = tagged.map((t) => t.date).sort()
  return {
    name: knownTags(tagged).find((known) => tagKey(known) === tagKey(name)) ?? name,
    count: tagged.length,
    first: dates[0],
    last: dates[dates.length - 1],
    spent: roundMoney(spent),
    received: roundMoney(received),
    otherCurrencies: otherCurrencyTotals(tagged, undefined, main),
    byCategory: [...byCategory]
      .map(([categoryId, amount]) => ({ categoryId, spent: roundMoney(amount) }))
      .filter((row) => row.spent > 0)
      .sort((a, b) => b.spent - a.spent),
  }
}

/** Every tag with what it adds up to, the most recently used first. */
export function tagSummaries(transactions: Transaction[], main: string): TagSummary[] {
  return knownTags(transactions)
    .map((name) => tagSummary(transactions, name, main))
    .filter((summary): summary is TagSummary => summary !== null)
}
