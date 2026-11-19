import type { ID, ISODate, Transaction } from '../types'
import { live } from './id'
import { formatMoney, roundMoney } from './money'

/**
 * There are no exchange rates in this app: amounts in different currencies are never
 * added together or converted. The budget and the main Stats count the main currency
 * (`profile.currency`), and anything else is listed per currency. A record without a
 * currency is in the main currency.
 */

export interface CurrencyAmount {
  currency: string
  amount: number
}

export function isMainCurrency(record: { currency?: string }, main?: string): boolean {
  return !record.currency || record.currency === main
}

/** Only what's counted in the budget and the main Stats. */
export function inMainCurrency(transactions: Transaction[], main: string): Transaction[] {
  return transactions.filter((t) => isMainCurrency(t, main))
}

/** Adds up per currency, main currency first, leaving out zeros. */
export function byCurrency(amounts: CurrencyAmount[], main: string): CurrencyAmount[] {
  const totals = new Map<string, number>()
  for (const { currency, amount } of amounts) totals.set(currency, roundMoney((totals.get(currency) ?? 0) + amount))
  return [...totals]
    .filter(([, amount]) => amount !== 0)
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => Number(b.currency === main) - Number(a.currency === main) || a.currency.localeCompare(b.currency))
}

/** `105,000 DA · 100 USD`, or zero in the main currency when there's nothing. */
export function formatAmounts(amounts: CurrencyAmount[], main: string): string {
  if (amounts.length === 0) return formatMoney(0, main)
  return amounts.map(({ amount, currency }) => formatMoney(amount, currency)).join(' · ')
}

/**
 * The amount a list shows for an entry: seen from the wallet money arrived in, what arrived. Seen
 * from a wallet, an expense a fund paid part of shows only what left the wallet.
 */
export function entryMoney(t: Transaction, viewAccountId: ID | undefined, main: string): CurrencyAmount {
  if (t.type === 'transfer' && t.toAmount !== undefined && viewAccountId === t.toAccountId) return { amount: t.toAmount, currency: t.toCurrency ?? main }
  if (viewAccountId && t.type === 'expense' && t.fundAmount) return { amount: roundMoney(Math.max(0, t.amount - t.fundAmount)), currency: t.currency ?? main }
  return { amount: t.amount, currency: t.currency ?? main }
}

/** Money changed out of and back into the main currency: the only way the budget can see it leaving. */
export function exchangedMoney(transactions: Transaction[], range: { start: ISODate; end: ISODate }, main: string): { out: number; back: number } {
  let out = 0
  let back = 0
  for (const t of live(transactions)) {
    if (t.type !== 'transfer' || t.toAmount === undefined || t.date < range.start || t.date > range.end) continue
    const fromMain = isMainCurrency(t, main)
    const toMain = !t.toCurrency || t.toCurrency === main
    if (fromMain && !toMain) out += t.amount
    if (!fromMain && toMain) back += t.toAmount
  }
  return { out: roundMoney(out), back: roundMoney(back) }
}

export interface OtherCurrencyTotal {
  currency: string
  spent: number
  received: number
}

/** Spending and income in each other currency, for the lines beside the main numbers. */
export function otherCurrencyTotals(transactions: Transaction[], range: { start: ISODate; end: ISODate } | undefined, main: string): OtherCurrencyTotal[] {
  const totals = new Map<string, OtherCurrencyTotal>()
  for (const t of live(transactions)) {
    if (isMainCurrency(t, main) || !t.currency || (t.type !== 'expense' && t.type !== 'refund' && t.type !== 'income')) continue
    if (range && (t.date < range.start || t.date > range.end)) continue
    const row = totals.get(t.currency) ?? { currency: t.currency, spent: 0, received: 0 }
    // A refund takes back spending: it's never money received.
    if (t.type === 'expense') row.spent = roundMoney(row.spent + t.amount)
    else if (t.type === 'refund') row.spent = roundMoney(row.spent - t.amount)
    else row.received = roundMoney(row.received + t.amount)
    totals.set(t.currency, row)
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}
