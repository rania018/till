import { addDays, differenceInCalendarDays, subDays } from 'date-fns'
import type { Account, Category, Debt, ID, ISODate, PaySchedule, Transaction, WishlistItem } from '../types'
import { familyIds, mainIdOf as familyMain, rollUp } from './categoryTree'
import { isMainCurrency } from './currency'
import { debtOwed, isRepayment } from './debts'
import { fundPart, walletPart } from './funds'
import { isSpending, spentAmount } from './spending'
import { fromISODate, getPayCycle, hasPaydays, isShortPay, isWithin, planSchedule, previousCycle, recentCycles, todayISO, toISODate, type Cycle } from './dates'
import { live } from './id'
import { roundMoney, sumAmounts } from './money'

type Range = { start: ISODate; end: ISODate }

export type StatsPeriodKind = 'cycle' | 'last' | '3' | 'year' | 'custom'
export const PERIOD_KINDS: StatsPeriodKind[] = ['cycle', 'last', '3', 'year', 'custom']

export interface StatsPeriod {
  kind: StatsPeriodKind
  range: Range
  /** What the period is compared with. For the current cycle: the same days of the last one. */
  previous: Range
  /** Days counted so far: up to today when the period is still running. */
  elapsedDays: number
  /** Today falls inside the period. */
  isCurrent: boolean
  /** Pay cycles for the trend chart, oldest first: 6, or 12 for a year (12 months with weekly or biweekly pay). */
  trend: Cycle[]
}

function daysIn(range: Range): number {
  return differenceInCalendarDays(fromISODate(range.end), fromISODate(range.start)) + 1
}

/** The same number of days, just before `range`. */
function before(range: Range): Range {
  const end = subDays(fromISODate(range.start), 1)
  return { start: toISODate(subDays(end, daysIn(range) - 1)), end: toISODate(end) }
}

/**
 * The dates a Stats view covers. Each "month" is one pay cycle; a custom range
 * gets clamped so it never ends after today or starts after it ends.
 */
export function statsPeriod(kind: StatsPeriodKind, today: ISODate, salary: PaySchedule, custom?: Range): StatsPeriod {
  const shortCycles = isShortPay(salary) && hasPaydays(salary)
  const current = getPayCycle(today, salary)
  let range: Range
  let previous: Range
  let trendEnd: Cycle = current
  let trendLength = 6

  switch (kind) {
    case 'cycle': {
      range = { start: current.start, end: current.end }
      // Compare like with like: the first days of last cycle, as many as have passed in this one.
      const last = previousCycle(current, salary)
      const dayNumber = differenceInCalendarDays(fromISODate(today), fromISODate(current.start)) + 1
      const end = toISODate(addDays(fromISODate(last.start), Math.min(dayNumber, last.days) - 1))
      previous = { start: last.start, end }
      break
    }
    case 'last': {
      const last = previousCycle(current, salary)
      range = { start: last.start, end: last.end }
      previous = previousCycle(last, salary)
      trendEnd = last
      break
    }
    case '3':
    case 'year': {
      // A year is 52 or 26 of these cycles when they're short, not 12.
      const count = kind === '3' ? 3 : !shortCycles ? 12 : salary.frequency === 'weekly' ? 52 : 26
      const cycles = recentCycles(today, salary, count)
      range = { start: cycles[0].start, end: current.end }
      const earlier = recentCycles(toISODate(subDays(fromISODate(cycles[0].start), 1)), salary, count)
      previous = { start: earlier[0].start, end: earlier[earlier.length - 1].end }
      trendLength = kind === 'year' ? 12 : 6
      break
    }
    case 'custom': {
      const end = custom?.end && custom.end < today ? custom.end : today
      const start = custom?.start && custom.start <= end ? custom.start : current.start
      range = { start, end }
      previous = before(range)
      trendEnd = getPayCycle(end, salary)
      break
    }
  }

  const isCurrent = isWithin(today, range)
  const elapsedDays = isCurrent ? differenceInCalendarDays(fromISODate(today), fromISODate(range.start)) + 1 : daysIn(range)
  // 52 bars say less than 12: a year of short cycles is charted by month.
  const trend = shortCycles && kind === 'year' ? recentCycles(today, planSchedule(salary), 12) : recentCycles(trendEnd.start, salary, trendLength)
  return { kind, range, previous, elapsedDays, isCurrent, trend }
}

function inRange(transactions: Transaction[], range: Range): Transaction[] {
  return live(transactions).filter((t) => isWithin(t.date, range))
}

const total = (transactions: Transaction[]) => sumAmounts(transactions.map((t) => t.amount))

export interface PeriodTotals {
  income: number
  /** Every expense, bills included, less refunds. */
  spent: number
  /** Bill payments, less refunds of them. */
  fixed: number
  /** Everything else you spent. */
  flexible: number
  /** Put into goals minus taken out, and minus what funds paid for. */
  saved: number
  /** Spending paid from cash wallets, and from the others (cards). A refund goes back to the side it arrived on. */
  cash: number
  card: number
}

export function periodTotals(transactions: Transaction[], accounts: Account[], range: Range): PeriodTotals {
  const txs = inRange(transactions, range)
  const expenses = txs.filter((t) => t.type === 'expense')
  const spending = txs.filter(isSpending)
  const net = (list: Transaction[]) => sumAmounts(list.map(spentAmount))
  const cashIds = new Set(accounts.filter((a) => a.kind === 'cash').map((a) => a.id))
  const cash = net(spending.filter((t) => cashIds.has(t.accountId)))
  const spent = net(spending)
  const fixed = net(spending.filter((t) => t.billId))
  return {
    income: total(txs.filter((t) => t.type === 'income')),
    spent,
    fixed,
    flexible: roundMoney(spent - fixed),
    saved: roundMoney(total(txs.filter((t) => t.type === 'goal-deposit')) - total(txs.filter((t) => t.type === 'goal-withdrawal')) - sumAmounts(expenses.map(fundPart))),
    cash,
    card: roundMoney(spent - cash),
  }
}

/** Money that moved through debts in a period. None of it is spending or income. */
export interface DebtFlows {
  borrowed: number
  repaid: number
  lent: number
  repaidToYou: number
}

const NO_DEBT_FLOWS: DebtFlows = { borrowed: 0, repaid: 0, lent: 0, repaidToYou: 0 }

export function debtFlows(transactions: Transaction[], debts: Debt[], range: Range): DebtFlows {
  const flows = { ...NO_DEBT_FLOWS }
  const byId = new Map(debts.map((d) => [d.id, d]))
  for (const tx of inRange(transactions, range)) {
    if (tx.type !== 'debt-in' && tx.type !== 'debt-out') continue
    const debt = tx.debtId ? byId.get(tx.debtId) : undefined
    if (!debt) continue
    const key = debt.direction === 'borrowed' ? (isRepayment(debt, tx.type) ? 'repaid' : 'borrowed') : isRepayment(debt, tx.type) ? 'repaidToYou' : 'lent'
    flows[key] = roundMoney(flows[key] + tx.amount)
  }
  return flows
}

/**
 * What income leaves after spending and debts. Money paid back or lent has gone, and money lent
 * coming back has returned. Borrowing is left out: it fills the wallet, but it isn't yours to keep.
 */
export function keptAfterDebts(totals: Pick<PeriodTotals, 'income' | 'spent'>, flows: DebtFlows = NO_DEBT_FLOWS): number {
  return roundMoney(totals.income - totals.spent - flows.repaid - flows.lent + flows.repaidToYou)
}

/** What's kept after spending and debts, as a share of income; `null` without income. */
export function savingsRate(totals: Pick<PeriodTotals, 'income' | 'spent'>, flows: DebtFlows = NO_DEBT_FLOWS): number | null {
  return totals.income > 0 ? keptAfterDebts(totals, flows) / totals.income : null
}

export interface DebtBalance {
  cycle: Range
  /** In the main currency, as of the cycle's end or today. */
  owed: number
  owedToYou: number
}

/** What was owed each way at the end of each pay cycle. Other currencies can't be added in, so they're left out. */
export function debtBalances(debts: Debt[], transactions: Transaction[], cycles: Range[], main: string, today: ISODate): DebtBalance[] {
  const kept = live(debts).filter((d) => !d.archived && isMainCurrency(d, main))
  return cycles.map((cycle) => {
    const upTo = cycle.end < today ? cycle.end : today
    const total = (direction: Debt['direction']) => sumAmounts(kept.filter((d) => d.direction === direction && d.date <= upTo).map((d) => debtOwed(d, transactions, upTo)))
    return { cycle, owed: total('borrowed'), owedToYou: total('lent') }
  })
}

export interface CategorySpend {
  categoryId: ID
  spent: number
  /** Share of all spending in the period, 0–1. */
  share: number
  previous: number
  /** Change against the previous period as a ratio (0.12 = 12% more); `null` when there was nothing to compare. */
  change: number | null
}

function byCategory(transactions: Transaction[], range: Range): Map<ID, number> {
  const totals = new Map<ID, number>()
  for (const t of inRange(transactions, range)) {
    if (!isSpending(t) || !t.categoryId) continue
    totals.set(t.categoryId, roundMoney((totals.get(t.categoryId) ?? 0) + spentAmount(t)))
  }
  // A category whose refunds outweigh its spending has nothing to show, not a negative share.
  for (const [id, spent] of totals) if (spent <= 0) totals.delete(id)
  return totals
}

/** Where the money went, biggest first, with the change from the previous period. */
export function categoryBreakdown(transactions: Transaction[], range: Range, previousRange: Range): CategorySpend[] {
  const now = byCategory(transactions, range)
  const before = byCategory(transactions, previousRange)
  const all = sumAmounts([...now.values()])
  return [...now]
    .map(([categoryId, spent]) => {
      const previous = before.get(categoryId) ?? 0
      return { categoryId, spent, share: all > 0 ? spent / all : 0, previous, change: previous > 0 ? (spent - previous) / previous : null }
    })
    .sort((a, b) => b.spent - a.spent)
}

export interface TrendPoint {
  cycle: Cycle
  income: number
  spent: number
  saved: number
  /** The part of `spent` that paid bills. */
  fixed: number
  flexible: number
  savingsRate: number | null
  /** The cycle hasn't ended yet. */
  partial: boolean
}

export function cycleTrend(transactions: Transaction[], accounts: Account[], cycles: Cycle[], today: ISODate, debts: Debt[] = []): TrendPoint[] {
  return cycles.map((cycle) => {
    const totals = periodTotals(transactions, accounts, cycle)
    return { cycle, income: totals.income, spent: totals.spent, saved: totals.saved, fixed: totals.fixed, flexible: totals.flexible, savingsRate: savingsRate(totals, debtFlows(transactions, debts, cycle)), partial: today <= cycle.end }
  })
}

export interface PacePoint {
  date: ISODate
  day: number
  /** Flexible spending up to and including this day; `null` for days still to come. */
  spent: number | null
  /** Where an even pace would be by the end of this day. */
  pace: number
}

/** Flexible spending day by day through a cycle, next to an even pace that ends at the budget. What funds paid isn't in the budget, so it isn't here either. */
export function cumulativeSpending(transactions: Transaction[], cycle: Cycle, budget: number, today: ISODate): PacePoint[] {
  const perDay = new Map<ISODate, number>()
  for (const t of inRange(transactions, cycle)) {
    if (t.type === 'expense' && !t.billId) perDay.set(t.date, (perDay.get(t.date) ?? 0) + walletPart(t))
    if (t.type === 'refund' && !t.billId) perDay.set(t.date, (perDay.get(t.date) ?? 0) - t.amount)
  }
  const points: PacePoint[] = []
  let running = 0
  for (let day = 1; day <= cycle.days; day++) {
    const date = toISODate(addDays(fromISODate(cycle.start), day - 1))
    running += perDay.get(date) ?? 0
    points.push({ date, day, spent: date <= today ? roundMoney(running) : null, pace: roundMoney((budget * day) / cycle.days) })
  }
  return points
}

export function biggestExpense(transactions: Transaction[], range: Range): Transaction | null {
  let biggest: Transaction | null = null
  for (const t of inRange(transactions, range)) {
    if (t.type === 'expense' && (!biggest || t.amount > biggest.amount)) biggest = t
  }
  return biggest
}

/** The weekday (0 = Sunday) with the most flexible spending; `null` when nothing was spent. Bills are left out: their day is fixed. */
export function busiestWeekday(transactions: Transaction[], range: Range): number | null {
  const totals = Array<number>(7).fill(0)
  for (const t of inRange(transactions, range)) {
    if (t.type === 'expense' && !t.billId) totals[fromISODate(t.date).getDay()] += t.amount
  }
  const max = Math.max(...totals)
  return max > 0 ? totals.indexOf(max) : null
}

/**
 * Round axis ticks from 0 (or below, for negative values) past the largest value,
 * in steps of 1, 2, 2.5 or 5 × a power of ten: 0 / 10k / 20k / 30k, never 6.5k.
 */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const span = Math.max(max, 0) - Math.min(min, 0)
  if (span <= 0) return [0]
  const raw = span / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((n) => n * magnitude >= raw) ?? 10) * magnitude
  const ticks: number[] = []
  for (let tick = Math.floor(Math.min(min, 0) / step) * step; tick < max + step; tick += step) {
    ticks.push(roundMoney(tick))
    if (tick >= max) break
  }
  return ticks
}

/** What "Is it worth it?" talked you out of, decided within `range`. */
export function skippedSavings(wishlist: WishlistItem[], range: Range): { total: number; count: number } {
  const skipped = live(wishlist).filter((w) => w.status === 'skipped' && w.decidedAt && isWithin(todayISO(new Date(w.decidedAt)), range))
  return { total: sumAmounts(skipped.map((w) => w.price)), count: skipped.length }
}

export interface DaySpend {
  date: ISODate
  /** Spending that day, bills included, less refunds; `null` for days still to come. */
  spent: number | null
}

/** Every day of `range` with what was spent on it, for the day-by-day heatmap. */
export function dailySpending(transactions: Transaction[], range: Range, today: ISODate): DaySpend[] {
  const perDay = new Map<ISODate, number>()
  for (const t of inRange(transactions, range)) if (isSpending(t)) perDay.set(t.date, (perDay.get(t.date) ?? 0) + spentAmount(t))
  const days: DaySpend[] = []
  for (let date = range.start; date <= range.end; date = toISODate(addDays(fromISODate(date), 1))) {
    days.push({ date, spent: date <= today ? Math.max(0, roundMoney(perDay.get(date) ?? 0)) : null })
  }
  return days
}

/** Each category's spending in each of `cycles`, oldest first, for the small trend line in its row. */
export function categoryHistory(transactions: Transaction[], cycles: Range[]): Map<ID, number[]> {
  const history = new Map<ID, number[]>()
  cycles.forEach((cycle, i) => {
    for (const [id, spent] of byCategory(transactions, cycle)) {
      const row = history.get(id) ?? Array<number>(cycles.length).fill(0)
      row[i] = spent
      history.set(id, row)
    }
  })
  return history
}

/** Spending per main category, biggest first, against the previous period: subcategories added into their main one. */
export function mainCategoryBreakdown(transactions: Transaction[], range: Range, previousRange: Range, categories: Pick<Category, 'id' | 'parentId'>[]): CategorySpend[] {
  return spendRows(rollUp(byCategory(transactions, range), categories), rollUp(byCategory(transactions, previousRange), categories))
}

/** Spending in one main category's subcategories (and on the main one itself, if any), biggest first. */
export function subcategoryBreakdown(transactions: Transaction[], range: Range, previousRange: Range, categories: Pick<Category, 'id' | 'parentId'>[], mainId: ID): CategorySpend[] {
  const family = familyIds(categories, mainId)
  const only = (totals: Map<ID, number>) => new Map([...totals].filter(([id]) => family.has(id)))
  return spendRows(only(byCategory(transactions, range)), only(byCategory(transactions, previousRange)))
}

function spendRows(now: Map<ID, number>, before: Map<ID, number>): CategorySpend[] {
  const all = sumAmounts([...now.values()])
  return [...now]
    .filter(([, spent]) => spent > 0)
    .map(([categoryId, spent]) => {
      const previous = before.get(categoryId) ?? 0
      return { categoryId, spent: roundMoney(spent), share: all > 0 ? spent / all : 0, previous, change: previous > 0 ? (spent - previous) / previous : null }
    })
    .sort((a, b) => b.spent - a.spent)
}

/** Income per income category in a period, biggest first. */
export function incomeBreakdown(transactions: Transaction[], range: Range): { categoryId: ID; received: number; share: number }[] {
  const totals = new Map<ID, number>()
  for (const t of inRange(transactions, range)) if (t.type === 'income' && t.categoryId) totals.set(t.categoryId, roundMoney((totals.get(t.categoryId) ?? 0) + t.amount))
  const all = sumAmounts([...totals.values()])
  return [...totals].map(([categoryId, received]) => ({ categoryId, received, share: all > 0 ? received / all : 0 })).sort((a, b) => b.received - a.received)
}

/** Spending and income per wallet in a period, transfers aside. */
export function walletFlows(transactions: Transaction[], accounts: Account[], range: Range): { accountId: ID; spent: number; received: number }[] {
  const rows = new Map<ID, { spent: number; received: number }>()
  for (const t of inRange(transactions, range)) {
    const row = rows.get(t.accountId) ?? { spent: 0, received: 0 }
    if (isSpending(t)) row.spent = roundMoney(row.spent + spentAmount(t))
    else if (t.type === 'income') row.received = roundMoney(row.received + t.amount)
    else continue
    rows.set(t.accountId, row)
  }
  return live(accounts)
    .filter((a) => !a.archived && rows.has(a.id))
    .map((a) => ({ accountId: a.id, ...rows.get(a.id)! }))
    .sort((a, b) => b.spent - a.spent)
}

export interface TopItem {
  /** The note's first line, as first written. */
  name: string
  count: number
  total: number
  /** The category it was most often in. */
  categoryId?: ID
  /** How many were bought, from the entries that say. */
  units?: number
  /** What those entries came to, for the price of one. */
  unitSpent?: number
}

/** The thing a note names: its first line. */
const itemName = (note: string | undefined) => note?.split('\n')[0].trim() ?? ''

/** What's bought most, from the notes: the same first line counts as the same thing, whatever its case. */
export function topItems(transactions: Transaction[], range: Range, filter: (t: Transaction) => boolean = () => true): TopItem[] {
  const items = new Map<string, TopItem & { categories: Map<ID, number> }>()
  for (const t of inRange(transactions, range)) {
    if (t.type !== 'expense' || !filter(t)) continue
    const name = itemName(t.note)
    if (!name) continue
    const key = name.toLocaleLowerCase()
    const item: TopItem & { categories: Map<ID, number> } = items.get(key) ?? { name, count: 0, total: 0, categories: new Map() }
    item.count += 1
    item.total = roundMoney(item.total + t.amount)
    if (t.quantity) {
      item.units = roundMoney((item.units ?? 0) + t.quantity)
      item.unitSpent = roundMoney((item.unitSpent ?? 0) + t.amount)
    }
    if (t.categoryId) item.categories.set(t.categoryId, (item.categories.get(t.categoryId) ?? 0) + 1)
    items.set(key, item)
  }
  return [...items.values()]
    .map(({ categories, ...item }) => ({ ...item, categoryId: [...categories].sort((a, b) => b[1] - a[1])[0]?.[0] }))
    .sort((a, b) => b.total - a.total || b.count - a.count)
}

/** Every purchase of one item, counted the same way as `topItems`: refunds aren't purchases. */
export function itemEntries(transactions: Transaction[], name: string): Transaction[] {
  const key = name.trim().toLocaleLowerCase()
  if (!key) return []
  return live(transactions).filter((t) => t.type === 'expense' && itemName(t.note).toLocaleLowerCase() === key)
}

/** An item's purchases and what they came to in each of these periods, in the order given. */
export function itemHistory<P extends Range>(entries: Transaction[], periods: P[]): { cycle: P; count: number; amount: number; units: number; unitSpent: number; uncounted: number }[] {
  return periods.map((cycle) => {
    const bought = inRange(entries, cycle)
    const counted = bought.filter((t) => t.quantity)
    return { cycle, count: bought.length, amount: total(bought), units: sumAmounts(counted.map((t) => t.quantity!)), unitSpent: total(counted), uncounted: bought.length - counted.length }
  })
}

export interface CompareRow {
  categoryId: ID
  a: number
  b: number
}

/** Spending per main category in two periods, side by side, the biggest change first. */
export function comparePeriods(transactions: Transaction[], a: Range, b: Range, categories: Pick<Category, 'id' | 'parentId'>[]): CompareRow[] {
  const first = rollUp(byCategory(transactions, a), categories)
  const second = rollUp(byCategory(transactions, b), categories)
  const ids = new Set([...first.keys(), ...second.keys()])
  return [...ids]
    .map((categoryId) => ({ categoryId, a: roundMoney(first.get(categoryId) ?? 0), b: roundMoney(second.get(categoryId) ?? 0) }))
    .sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a) || y.b - x.b)
}

/** Each main category's spending in each of `cycles`, oldest first: its subcategories added in. */
export function mainCategoryHistory(transactions: Transaction[], cycles: Range[], categories: Pick<Category, 'id' | 'parentId'>[]): Map<ID, number[]> {
  const perLeaf = categoryHistory(transactions, cycles)
  const history = new Map<ID, number[]>()
  for (const [id, values] of perLeaf) {
    const main = familyMain(categories, id)
    const row = history.get(main) ?? Array<number>(cycles.length).fill(0)
    values.forEach((v, i) => (row[i] = roundMoney(row[i] + v)))
    history.set(main, row)
  }
  return history
}
