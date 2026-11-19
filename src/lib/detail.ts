import type { Account, Category, ID, ISODate, PaySchedule, Transaction } from '../types'
import { familyIds } from './categoryTree'
import { getPayCycle, isWithin, fromISODate } from './dates'
import { live } from './id'
import { isSpending } from './spending'
import { newestFirst } from './transactions'
import { isValidDate } from './validation'

type Range = { start: ISODate; end: ISODate }

/** Parts of the money that Stats shows as a whole: the pay flow's lines and the splits. */
export const DETAIL_PARTS = ['bills', 'everyday', 'goals', 'income', 'cash', 'card'] as const
export type DetailPart = (typeof DETAIL_PARTS)[number]

/** What was clicked: a category, a day, a weekday, a debt, or one part of the money. */
export type DetailTarget =
  | { kind: 'category'; id: ID }
  | { kind: 'day'; date: ISODate }
  | { kind: 'weekday'; day: number }
  | { kind: 'debt'; id: ID }
  | { kind: 'part'; part: DetailPart }

/** A target and the dates it covers. A day is its own range, and a debt is shown over all its life. */
export interface Detail {
  target: DetailTarget
  range: Range | null
}

/** The search params the panel lives in, so Back closes it and a link can open it. */
export const DETAIL_KEYS = ['detail', 'dfrom', 'dto'] as const

export function readDetail(params: URLSearchParams): Detail | null {
  const raw = params.get('detail')
  if (!raw) return null
  const at = raw.indexOf(':')
  if (at < 1) return null
  const kind = raw.slice(0, at)
  const value = raw.slice(at + 1)
  const from = params.get('dfrom')
  const to = params.get('dto')
  const range = from && to && isValidDate(from) && isValidDate(to) && from <= to ? { start: from, end: to } : null
  if (kind === 'category' && value) return { target: { kind, id: value }, range }
  if (kind === 'debt' && value) return { target: { kind, id: value }, range: null }
  if (kind === 'day' && isValidDate(value)) return { target: { kind, date: value }, range: { start: value, end: value } }
  if (kind === 'weekday' && /^[0-6]$/.test(value)) return { target: { kind, day: Number(value) }, range }
  if (kind === 'part' && (DETAIL_PARTS as readonly string[]).includes(value)) return { target: { kind, part: value as DetailPart }, range }
  return null
}

function targetValue(target: DetailTarget): string {
  switch (target.kind) {
    case 'category':
    case 'debt':
      return target.id
    case 'day':
      return target.date
    case 'weekday':
      return String(target.day)
    case 'part':
      return target.part
  }
}

/** The params for a detail, to put next to the page's own. */
export function detailParams(detail: Detail): Record<(typeof DETAIL_KEYS)[number], string | undefined> {
  const ranged = detail.target.kind !== 'day' && detail.target.kind !== 'debt' && detail.range
  return {
    detail: `${detail.target.kind}:${targetValue(detail.target)}`,
    dfrom: ranged ? detail.range!.start : undefined,
    dto: ranged ? detail.range!.end : undefined,
  }
}

/** Whether an entry belongs to what was clicked, before the dates are looked at. */
function matches(t: Transaction, target: DetailTarget, cashIds: Set<ID>, family: Set<ID>): boolean {
  switch (target.kind) {
    case 'category':
      return !!t.categoryId && family.has(t.categoryId) && (isSpending(t) || t.type === 'income')
    case 'day':
      return true
    case 'weekday':
      // The same entries as "busiest day": everyday spending, since a bill's day is fixed.
      return t.type === 'expense' && !t.billId && fromISODate(t.date).getDay() === target.day
    case 'debt':
      return t.debtId === target.id
    case 'part':
      switch (target.part) {
        case 'bills':
          return isSpending(t) && !!t.billId
        case 'everyday':
          return isSpending(t) && !t.billId
        case 'goals':
          return t.type === 'goal-deposit' || t.type === 'goal-withdrawal'
        case 'income':
          return t.type === 'income'
        case 'cash':
          return isSpending(t) && cashIds.has(t.accountId)
        case 'card':
          return isSpending(t) && !cashIds.has(t.accountId)
      }
  }
}

/** Every entry behind a detail, newest first, in any currency: the totals are left to the caller. */
export function detailEntries(transactions: Transaction[], accounts: Pick<Account, 'id' | 'kind'>[], detail: Detail, categories: Pick<Category, 'id' | 'parentId'>[] = []): Transaction[] {
  const cashIds = new Set(accounts.filter((a) => a.kind === 'cash').map((a) => a.id))
  // A main category takes in its subcategories.
  const family = detail.target.kind === 'category' ? familyIds(categories, detail.target.id) : new Set<ID>()
  return live(transactions)
    .filter((t) => (!detail.range || isWithin(t.date, detail.range)) && matches(t, detail.target, cashIds, family))
    .sort(newestFirst)
}

/**
 * The same entries in Activity, where it can show exactly them; `null` where it can't
 * (Activity has no filter for a weekday, bills or cash). A range that is one pay cycle
 * opens as that cycle, so it can be stepped from there.
 */
export function activityLinkFor(detail: Detail, salary: PaySchedule): string | null {
  const params = new URLSearchParams()
  const { target, range } = detail
  if (target.kind === 'category') params.set('category', target.id)
  else if (target.kind === 'debt') params.set('debt', target.id)
  else if (target.kind === 'part' && (target.part === 'goals' || target.part === 'income')) params.set('kind', target.part === 'goals' ? 'goal' : 'income')
  else if (target.kind !== 'day') return null
  if (range && target.kind !== 'debt') {
    const cycle = getPayCycle(range.start, salary)
    if (cycle.start === range.start && cycle.end === range.end) params.set('cycle', cycle.start)
    else {
      params.set('from', range.start)
      params.set('to', range.end)
    }
  }
  return `/activity/list?${params}`
}
