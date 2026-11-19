import type { AppData, ID, ISODate, Transaction } from '../types'
import { inMainCurrency, otherCurrencyTotals, type OtherCurrencyTotal } from './currency'
import { goalSaved, goalSavedIn } from './goals'
import { live } from './id'
import { netWorthOn } from './netWorth'
import { roundMoney, sumAmounts } from './money'
import { spentAmount } from './spending'
import { categoryBreakdown, debtFlows, keptAfterDebts, periodTotals, savingsRate, type CategorySpend, type DebtFlows, type PeriodTotals } from './stats'

/** A year on one page: what came in, what went out and where, month by month. Calendar months, not pay cycles, so it lines up with a year. */
export interface YearReport {
  year: number
  range: { start: ISODate; end: ISODate }
  totals: PeriodTotals
  /** Income less spending and money that left through debts: what was really kept. */
  kept: number
  savingsRate: number | null
  months: { month: ISODate; income: number; spent: number; kept: number }[]
  /** Against the year before. */
  categories: CategorySpend[]
  biggest: Transaction[]
  bills: { billId: ID; name: string; paid: number; payments: number }[]
  goals: { goalId: ID; name: string; putAside: number; saved: number; target: number; fund: boolean }[]
  debts: DebtFlows
  /** Spending and income in other currencies, never added in. */
  otherCurrencies: OtherCurrencyTotal[]
  /** In the main currency, before the year and at its end (or today). `start` is left out when the app wasn't set up yet; both when the whole year was. */
  netWorth: { start: NetWorthAt | null; end: NetWorthAt } | null
}

interface NetWorthAt {
  date: ISODate
  total: number
}

type ReportData = Pick<AppData, 'profile' | 'transactions' | 'accounts' | 'debts' | 'bills' | 'goals' | 'assets'>

const pad = (n: number) => String(n).padStart(2, '0')

/** Years with anything logged in them, newest first, and always the current one. */
export function reportYears(transactions: Transaction[], today: ISODate): number[] {
  const years = new Set([Number(today.slice(0, 4)), ...live(transactions).map((t) => Number(t.date.slice(0, 4)))])
  return [...years].sort((a, b) => b - a)
}

export function yearReport(data: ReportData, year: number, today: ISODate): YearReport {
  const range = { start: `${year}-01-01`, end: `${year}-12-31` }
  const before = { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` }
  const main = data.profile.currency
  const transactions = inMainCurrency(data.transactions, main)
  const totals = periodTotals(transactions, data.accounts, range)
  const flows = debtFlows(transactions, data.debts, range)
  const inYear = live(transactions).filter((t) => t.date >= range.start && t.date <= range.end)

  // Months up to this one: a year still going doesn't show empty months to come.
  const lastMonth = today.slice(0, 4) === String(year) ? Number(today.slice(5, 7)) : 12
  const months = Array.from({ length: lastMonth }, (_, i) => {
    const start = `${year}-${pad(i + 1)}-01`
    const end = `${year}-${pad(i + 1)}-31`
    const month = periodTotals(transactions, data.accounts, { start, end })
    return { month: start, income: month.income, spent: month.spent, kept: keptAfterDebts(month, debtFlows(transactions, data.debts, { start, end })) }
  })

  const bills = live(data.bills)
    .map((bill) => {
      const paid = inYear.filter((t) => t.billId === bill.id)
      return { billId: bill.id, name: bill.name, paid: roundMoney(sumAmounts(paid.map(spentAmount))), payments: paid.filter((t) => t.type === 'expense').length }
    })
    .filter((b) => b.payments > 0)
    .sort((a, b) => b.paid - a.paid)

  const goals = live(data.goals)
    .map((goal) => ({ goalId: goal.id, name: goal.name, putAside: goalSavedIn(goal.id, transactions, range), saved: goalSaved(goal, transactions), target: goal.target, fund: !!goal.fund }))
    .filter((g) => g.putAside !== 0)
    .sort((a, b) => b.putAside - a.putAside)

  const netWorthAt = (date: ISODate): NetWorthAt => ({ date, total: netWorthOn(data, date)[0].total })
  const yearEnd = range.end < today ? range.end : today
  const lastYearEnd = before.end
  const netWorth = yearEnd < data.profile.startDate ? null : { start: lastYearEnd < data.profile.startDate ? null : netWorthAt(lastYearEnd), end: netWorthAt(yearEnd) }

  return {
    year,
    range,
    netWorth,
    totals,
    kept: keptAfterDebts(totals, flows),
    savingsRate: savingsRate(totals, flows),
    months,
    categories: categoryBreakdown(transactions, range, before),
    biggest: inYear
      .filter((t) => t.type === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    bills,
    goals,
    debts: flows,
    otherCurrencies: otherCurrencyTotals(data.transactions, range, main),
  }
}
