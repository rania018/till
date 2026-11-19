import { endOfMonth, subMonths } from 'date-fns'
import type { AppData, Asset, AssetValue, ISODate } from '../types'
import { fromISODate, toISODate } from './dates'
import { debtOwed } from './debts'
import { goalSaved } from './goals'
import { live } from './id'
import { roundMoney } from './money'
import { walletBalance } from './wallets'

/**
 * Net worth: money in wallets and goals, plus what's owed to you and what assets are worth, minus
 * what you owe. There are no exchange rates (src/lib/currency.ts), so it's one total per currency.
 * Every part is counted from the day it started being tracked: a wallet from its start date, a
 * goal's starting amount from the day the goal was added, a debt from its date, an asset from its
 * first value.
 */

export type NetWorthData = Pick<AppData, 'profile' | 'accounts' | 'transactions' | 'goals' | 'debts' | 'assets'>

export interface NetWorthRow {
  currency: string
  wallets: number
  goals: number
  owedToYou: number
  /** What you owe, as a positive amount: it's taken off the total. */
  youOwe: number
  assets: number
  total: number
}

const PARTS = ['wallets', 'goals', 'owedToYou', 'youOwe', 'assets'] as const
export type NetWorthPart = (typeof PARTS)[number]

/** The value in force on `date`: the latest one on or before it. `null` before the first, and from the day it was sold. */
export function assetValueAt(asset: Pick<Asset, 'values' | 'soldAt'>, date: ISODate): AssetValue | null {
  if (asset.soldAt && asset.soldAt <= date) return null
  let found: AssetValue | null = null
  for (const v of asset.values) if (v.date <= date && (!found || v.date > found.date)) found = v
  return found
}

/** Its most recent value, whatever the date. */
export function latestAssetValue(asset: Pick<Asset, 'values'>): AssetValue {
  return asset.values.reduce((latest, v) => (v.date > latest.date ? v : latest), asset.values[0])
}

/** Its first value: when it started counting. */
export function firstAssetValue(asset: Pick<Asset, 'values'>): AssetValue {
  return asset.values.reduce((first, v) => (v.date < first.date ? v : first), asset.values[0])
}

/** The day a record was added, in local time. */
function addedOn(createdAt: string): ISODate {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? '0000-01-01' : toISODate(date)
}

/** Net worth on `date`, one row per currency, the main currency first and always there. */
export function netWorthOn(data: NetWorthData, date: ISODate): NetWorthRow[] {
  const main = data.profile.currency
  const rows = new Map<string, NetWorthRow>()
  const add = (currency: string | undefined, part: NetWorthPart, amount: number) => {
    const code = currency ?? main
    const row = rows.get(code) ?? { currency: code, wallets: 0, goals: 0, owedToYou: 0, youOwe: 0, assets: 0, total: 0 }
    row[part] = roundMoney(row[part] + amount)
    rows.set(code, row)
  }

  // Closed wallets too: editing an old entry can leave money in one.
  for (const account of live(data.accounts)) {
    if (account.startDate <= date) add(account.currency, 'wallets', walletBalance(account, data.transactions, date))
  }
  // Finished goals too: what's in them is still put aside until it's taken out.
  for (const goal of live(data.goals)) {
    const saved = goalSaved(goal, data.transactions, date) - (addedOn(goal.createdAt) > date ? (goal.startingAmount ?? 0) : 0)
    add(undefined, 'goals', saved)
  }
  // A closed debt was forgiven or stopped counting, and there's no record of when, so it's left out.
  for (const debt of live(data.debts)) {
    if (debt.archived || debt.date > date) continue
    add(debt.currency, debt.direction === 'lent' ? 'owedToYou' : 'youOwe', debtOwed(debt, data.transactions, date))
  }
  for (const asset of live(data.assets)) {
    const value = assetValueAt(asset, date)
    if (value) add(asset.currency, 'assets', value.value)
  }

  const list = [...rows.values()].map((row) => ({ ...row, total: roundMoney(row.wallets + row.goals + row.owedToYou + row.assets - row.youOwe) }))
  const empty = (row: NetWorthRow) => PARTS.every((part) => row[part] === 0)
  const mainRow = list.find((row) => row.currency === main) ?? { currency: main, wallets: 0, goals: 0, owedToYou: 0, youOwe: 0, assets: 0, total: 0 }
  const others = list.filter((row) => row.currency !== main && !empty(row)).sort((a, b) => a.currency.localeCompare(b.currency))
  return [mainRow, ...others]
}

export interface NetWorthPoint {
  /** The last day of a month, or today for the month running now. */
  date: ISODate
  /** In the main currency only: other currencies can't be added in. */
  row: NetWorthRow
}

/**
 * Net worth at the end of each month, the last `months` of them, ending today. It starts with the
 * month the app was set up: before that, almost nothing was tracked, so the line would only climb.
 */
export function netWorthHistory(data: NetWorthData, today: ISODate, months = 12): NetWorthPoint[] {
  const points: NetWorthPoint[] = []
  const firstMonthEnd = toISODate(endOfMonth(fromISODate(data.profile.startDate)))
  for (let back = months - 1; back >= 0; back--) {
    const monthEnd = toISODate(endOfMonth(subMonths(fromISODate(today), back)))
    if (monthEnd < firstMonthEnd) continue
    const date = monthEnd > today ? today : monthEnd
    points.push({ date, row: netWorthOn(data, date)[0] })
  }
  return points
}

/** What changed since `before`, part by part, in the main currency. */
export function netWorthChange(now: NetWorthRow, before: NetWorthRow): Record<NetWorthPart | 'total', number> {
  const change = { total: roundMoney(now.total - before.total) } as Record<NetWorthPart | 'total', number>
  for (const part of PARTS) change[part] = roundMoney(now[part] - before[part])
  return change
}
