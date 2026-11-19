import { addDays, addMonths, differenceInCalendarDays } from 'date-fns'
import { t } from '../../i18n'
import type { AppData, Category, ID, ISODate, Transaction } from '../../types'
import { categorySlot, mainIdOf } from '../categoryTree'
import { fromISODate, toISODate } from '../dates'
import { live } from '../id'
import { roundMoney, sumAmounts, usesCents } from '../money'
import { isSpending, spentAmount } from '../spending'
import { incomeBreakdown, topItems, walletFlows } from '../stats'
import { hasTag, knownTags } from '../tags'
import { nameOf, totals } from '../transactions'
import { CATEGORY_PASTELS, dateCell, filled, INCOME_COLOR, monthCell, percentCell, type Cell, type Table } from './workbook'

/**
 * The stats a workbook adds to its entries: where the money went, when, on what, from which wallet
 * and for which tags. Built from the same entries the file lists. Every number stays within one
 * currency: each table lists the main currency first, then each other currency on rows of its own.
 */

type Range = { start: ISODate; end: ISODate }
type Row = Cell[]

const words = t.exports
const col = words.columns

/** A period this short is shown day by day; a longer one month by month. */
const DAY_BY_DAY_DAYS = 62
/** How many of the biggest expenses and most bought things are listed per currency. */
const TOP = 10
/** Entries are already chosen by the caller, so the stats helpers look at all of them. */
const ALL_DATES: Range = { start: '0000-01-01', end: '9999-12-31' }

/** A category on its main category's pastel, as in the app. */
export function categoryCell(categories: Pick<Category, 'id' | 'name' | 'parentId' | 'color'>[], id: ID | undefined): Cell {
  const slot = categorySlot(categories, id)
  return filled(nameOf(categories, id), slot ? CATEGORY_PASTELS[slot - 1] : undefined)
}

interface Group {
  currency: string
  entries: Transaction[]
}

/** The entries per currency: the main currency first, then the others by name. */
function currencyGroups(entries: Transaction[], main: string): Group[] {
  const groups = new Map<string, Transaction[]>()
  for (const tx of live(entries)) {
    const currency = tx.currency ?? main
    const list = groups.get(currency) ?? []
    list.push(tx)
    groups.set(currency, list)
  }
  return [...groups]
    .map(([currency, list]) => ({ currency, entries: list }))
    .sort((a, b) => Number(b.currency === main) - Number(a.currency === main) || a.currency.localeCompare(b.currency))
}

/** The days the stats cover: the period up to today, or with no period, from the first entry to today. */
function coveredDays(entries: Transaction[], range: Range | undefined, today: ISODate): Range | null {
  const dates = live(entries)
    .map((tx) => tx.date)
    .sort()
  const start = range?.start ?? dates[0]
  if (!start) return null
  const last = dates[dates.length - 1] ?? start
  const end = range ? (range.end < today ? range.end : today) : last > today ? last : today
  return end >= start ? { start, end } : null
}

const dayCount = (range: Range) => differenceInCalendarDays(fromISODate(range.end), fromISODate(range.start)) + 1

/** An average, in whole dinars or to the cent in a currency that has them. */
const average = (amount: number, count: number, currency: string) => (count > 0 ? (usesCents(currency) ? roundMoney(amount / count) : Math.round(amount / count)) : null)

/** An entry's note, first line only. */
const noteOf = (tx: Transaction) => tx.note?.split('\n')[0].trim() || undefined

/** What a purchase was: its note, the bill it paid, or its category. */
const whatOf = (data: AppData, tx: Transaction) => noteOf(tx) ?? (nameOf(data.bills, tx.billId) || nameOf(data.categories, tx.categoryId))

/** "Biggest expense: Car repair · 3 Aug". A dot rather than a comma, which reads the same in every language. */
export const biggestLabel = (data: AppData, tx: Transaction) => `${t.stats.tiles.biggest}: ${whatOf(data, tx)} · ${t.format.dayMonth(tx.date)}`

/** Zero as an empty cell, so a column of mostly nothing is easy to read. */
const orEmpty = (amount: number) => (amount === 0 ? null : amount)

/** The summary's key numbers for a list of entries, per currency: spent, received, a day, per purchase and the biggest. */
export function keyFigures(data: AppData, entries: Transaction[], range: Range | undefined, today: ISODate): Row[] {
  const days = coveredDays(entries, range, today)
  return currencyGroups(entries, data.profile.currency).flatMap(({ currency, entries: list }): Row[] => {
    const { spent, received } = totals(list)
    const expenses = list.filter((tx) => tx.type === 'expense')
    const biggest = expenses.reduce<Transaction | null>((top, tx) => (!top || tx.amount > top.amount ? tx : top), null)
    const rows: Row[] = [
      [col.spent, spent, currency],
      [col.received, received, currency],
    ]
    if (days && spent > 0) rows.push([t.stats.tiles.dailyAverage, average(spent, dayCount(days), currency), currency])
    if (expenses.length > 0) rows.push([col.averageExpense, average(sumAmounts(expenses.map((tx) => tx.amount)), expenses.length, currency), currency])
    if (biggest) rows.push([biggestLabel(data, biggest), biggest.amount, currency])
    return rows
  })
}

/** Spending per main category, subcategories added in, biggest first. A category whose refunds outweigh its spending is left out. */
function byCategory(data: AppData, groups: Group[]): Table {
  const rows = groups.flatMap(({ currency, entries }) => {
    const sums = new Map<ID, { spent: number; count: number }>()
    for (const tx of entries) {
      if (!isSpending(tx) || !tx.categoryId) continue
      const id = mainIdOf(data.categories, tx.categoryId)
      const sum = sums.get(id) ?? { spent: 0, count: 0 }
      sum.spent += spentAmount(tx)
      if (tx.type === 'expense') sum.count += 1
      sums.set(id, sum)
    }
    const kept = [...sums].filter(([, sum]) => sum.spent > 0).sort((a, b) => b[1].spent - a[1].spent)
    const all = sumAmounts(kept.map(([, sum]) => sum.spent))
    return kept.map(([id, sum]): Row => [categoryCell(data.categories, id), roundMoney(sum.spent), percentCell(sum.spent / all), sum.count, average(sum.spent, sum.count, currency), currency])
  })
  return { title: t.stats.categories.title, headers: [col.category, col.spent, col.share, col.entryCount, col.average, col.currency], rows, bars: [2], chart: { kind: 'doughnut', labels: 0, series: [{ column: 1 }] } }
}

interface Tally {
  spent: number
  received: number
  count: number
}

function tally(entries: Transaction[], keyOf: (tx: Transaction) => string): Map<string, Tally> {
  const sums = new Map<string, Tally>()
  for (const tx of entries) {
    const key = keyOf(tx)
    const sum = sums.get(key) ?? { spent: 0, received: 0, count: 0 }
    sum.spent += spentAmount(tx)
    if (tx.type === 'income') sum.received += tx.amount
    sum.count += 1
    sums.set(key, sum)
  }
  return sums
}

function everyDay(range: Range): ISODate[] {
  const start = fromISODate(range.start)
  return Array.from({ length: dayCount(range) }, (_, i) => toISODate(addDays(start, i)))
}

function everyMonth(first: ISODate, last: ISODate): string[] {
  const months: string[] = []
  for (let month = fromISODate(`${first.slice(0, 7)}-01`); toISODate(month).slice(0, 7) <= last.slice(0, 7); month = addMonths(month, 1)) months.push(toISODate(month).slice(0, 7))
  return months
}

/**
 * Spending and income over time: each day of a short period, or each month of a long one. The main
 * currency has every day or month, nothing spent included; other currencies only the ones they were used on.
 */
function overTime(groups: Group[], days: Range | null, main: string): Table {
  const daily = days !== null && dayCount(days) <= DAY_BY_DAY_DAYS
  const rows = groups.flatMap(({ currency, entries }) => {
    const inDays = days ? entries.filter((tx) => tx.date >= days.start && tx.date <= days.end) : entries
    const sums = tally(inDays, (tx) => (daily ? tx.date : tx.date.slice(0, 7)))
    if (sums.size === 0) return []
    const keys = [...sums.keys()].sort()
    const all = currency !== main ? keys : daily && days ? everyDay(days) : everyMonth(keys[0], keys[keys.length - 1])
    return all.map((key): Row => {
      const sum = sums.get(key)
      return [daily ? dateCell(key) : monthCell(`${key}-01`), roundMoney(sum?.spent ?? 0), orEmpty(roundMoney(sum?.received ?? 0)), sum?.count || null, currency]
    })
  })
  return {
    title: daily ? t.stats.heatmap.title : words.titles.byMonth,
    headers: [daily ? col.day : col.month, col.spent, col.received, col.entryCount, col.currency],
    rows,
    bars: [1],
    // Month by month, income is a line over the spending, as on Stats. Day by day it would be one spike on payday.
    chart: { kind: 'column', labels: 0, series: daily ? [{ column: 1 }] : [{ column: 1 }, { column: 2, line: true, color: INCOME_COLOR }] },
  }
}

/**
 * Everyday spending per day of the week, in the order the language's weeks start. Bills are left out:
 * their day is fixed, as on Stats. The main currency has all seven days; others only the days they were spent on.
 */
function byWeekday(groups: Group[], main: string): Table {
  const order = Array.from({ length: 7 }, (_, i) => (t.format.weekStartsOn + i) % 7)
  const rows = groups.flatMap(({ currency, entries }) => {
    const sums = tally(
      entries.filter((tx) => isSpending(tx) && !tx.billId),
      (tx) => String(fromISODate(tx.date).getDay()),
    )
    const all = sumAmounts([...sums.values()].map((sum) => Math.max(0, sum.spent)))
    if (all <= 0) return []
    return order.filter((day) => currency === main || sums.has(String(day))).map((day): Row => {
      const sum = sums.get(String(day))
      return [t.format.weekdays[day], roundMoney(sum?.spent ?? 0), percentCell(Math.max(0, sum?.spent ?? 0) / all), sum?.count || null, currency]
    })
  })
  return { title: words.titles.byWeekday, headers: [col.weekday, col.spent, col.share, col.entryCount, col.currency], rows, bars: [2], chart: { kind: 'column', labels: 0, series: [{ column: 1 }] } }
}

/** The biggest purchases, named by their note or, for a bill paid without one, the bill. */
function biggestExpenses(data: AppData, groups: Group[]): Table {
  const rows = groups.flatMap(({ currency, entries }) =>
    entries
      .filter((tx) => tx.type === 'expense')
      .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
      .slice(0, TOP)
      .map((tx): Row => [noteOf(tx) ?? (nameOf(data.bills, tx.billId) || null), dateCell(tx.date), categoryCell(data.categories, tx.categoryId), tx.amount, currency]),
  )
  return { title: words.titles.biggest, headers: [col.note, t.data.csv.date, col.category, col.amount, col.currency], rows, bars: [3] }
}

/** What's bought again and again, from the first line of the notes, as on Stats. Something bought once isn't a habit, so it's left out. */
function mostBought(data: AppData, groups: Group[]): Table {
  const rows = groups.flatMap(({ currency, entries }) =>
    topItems(entries, ALL_DATES)
      .filter((item) => item.count > 1)
      .slice(0, TOP)
      .map((item): Row => [item.name, categoryCell(data.categories, item.categoryId), item.count, item.total, average(item.total, item.count, currency), currency]),
  )
  return { title: t.insights.top.title, headers: [col.item, col.category, col.times, col.spent, col.average, col.currency], rows, bars: [3] }
}

/** Spending and income per wallet, transfers aside. A wallet has one currency, so nothing is added across currencies. Left out with one wallet. */
function byWallet(data: AppData, entries: Transaction[]): Table {
  const main = data.profile.currency
  const currencyOf = (accountId: string) => data.accounts.find((a) => a.id === accountId)?.currency ?? main
  // Each currency's wallets together, the main currency first: spending in two currencies can't be ranked against each other.
  const flows = walletFlows(entries, data.accounts, ALL_DATES).sort((a, b) => {
    const [x, y] = [currencyOf(a.accountId), currencyOf(b.accountId)]
    return Number(y === main) - Number(x === main) || x.localeCompare(y)
  })
  const rows = flows.length < 2 ? [] : flows.map(({ accountId, spent, received }): Row => {
    const account = data.accounts.find((a) => a.id === accountId)
    return [account?.name, spent, orEmpty(received), currencyOf(accountId)]
  })
  return { title: t.insights.wallets.title, headers: [col.wallet, col.spent, col.received, col.currency], rows, bars: [1] }
}

function incomeSources(data: AppData, groups: Group[]): Table {
  const rows = groups.flatMap(({ currency, entries }) =>
    incomeBreakdown(entries, ALL_DATES).map((row): Row => [categoryCell(data.categories, row.categoryId), row.received, percentCell(row.share), currency]),
  )
  return { title: t.insights.income.title, headers: [col.category, col.received, col.share, col.currency], rows, bars: [2] }
}

/** What each tag cost (less money back) and brought in, most spent first. */
function byTag(groups: Group[]): Table {
  const rows = groups.flatMap(({ currency, entries }) =>
    knownTags(entries)
      .map((name) => {
        const tagged = entries.filter((tx) => hasTag(tx, name))
        return { name, ...totals(tagged), count: tagged.length }
      })
      .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name))
      .map((tag): Row => [tag.name, tag.spent, orEmpty(tag.received), tag.count, currency]),
  )
  return { title: t.tags.title, headers: [col.tag, col.spent, col.received, col.entryCount, col.currency], rows, bars: [1] }
}

/**
 * The stats tables for a list of entries, those with nothing in them left out. `categories: false`
 * leaves out where the money went, for a workbook that already has its own sheet for it.
 */
export function statsTables(data: AppData, entries: Transaction[], range: Range | undefined, today: ISODate, { categories = true } = {}): Table[] {
  const main = data.profile.currency
  const groups = currencyGroups(entries, main)
  return (
    [
      ...(categories ? [byCategory(data, groups)] : []),
      overTime(groups, coveredDays(entries, range, today), main),
      byWeekday(groups, main),
      biggestExpenses(data, groups),
      mostBought(data, groups),
      byWallet(data, entries),
      incomeSources(data, groups),
      byTag(groups),
    ]
      .filter((table) => table.rows.length > 0)
      // Each currency's bars get their own scale.
      .map((table) => ({ ...table, scaleBy: table.headers.indexOf(col.currency) }))
  )
}
