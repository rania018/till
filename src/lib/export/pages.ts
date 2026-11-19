import { t } from '../../i18n'
import type { Account, AppData, Debt, Goal, ID, ISODate, Transaction, WishlistItem } from '../../types'
import { cycleBills, totalMonthlyBills, type BillStatus } from '../bills'
import { budgetSummary, leftShown, unbudgetedSpending, type BudgetLevel } from '../budget'
import { byCurrency, entryMoney, inMainCurrency, otherCurrencyTotals } from '../currency'
import { getPayCycle, planMonth, todayISO, type Cycle } from '../dates'
import { debtTotals, debtView, debtViews, noMoneyEntries, type DebtStatus, type DebtView, type NoMoneyEntry } from '../debts'
import { goalView, goalViews, suggestedContribution, type GoalStatus } from '../goals'
import { live } from '../id'
import { formatMoney, sumAmounts } from '../money'
import { biggestExpense, busiestWeekday, categoryBreakdown, cycleTrend, debtFlows, keptAfterDebts, periodTotals, savingsRate, skippedSavings, type StatsPeriod } from '../stats'
import { direction, filterNoMoneyEntries, filterTransactions, nameOf, newestFirst, type TransactionFilter } from '../transactions'
import { netWorthHistory, netWorthOn, type NetWorthPart } from '../netWorth'
import { isValidDate } from '../validation'
import { walletBalance } from '../wallets'
import { formatWorkTime, hourlyRate, workTimeFor } from '../workHours'
import type { WorthItCheck } from '../worthIt'
import { biggestLabel, categoryCell, keyFigures, statsTables } from './insights'
import { badge, BEFORE_COLOR, dateCell, INCOME_COLOR, monthCell, percentCell, plain, toned, totalCell, type Cell, type Sheet, type Table, type Tone, type Workbook } from './workbook'

/**
 * One workbook per page, holding what that page shows: its period and filters
 * apply, but without the page's "latest few" limits. Amounts stay as numbers next
 * to their currency, and totals are only ever made within one currency. Pages
 * with entries also get a Stats sheet of what those entries add up to.
 */

const words = t.exports
const col = words.columns
const entryWords = t.data.csv

type Row = Cell[]
type Range = { start: ISODate; end: ISODate }
type Heading = Sheet['heading']

/** Keeps a goal's or person's name safe to use in a file name, in any language. */
function fileSlug(name: string): string {
  return name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .trim()
    .slice(0, 60)
}

/** Sheets with nothing in them are left out; a workbook left with no sheets means there's nothing to export. */
function workbook(page: string, today: ISODate, sheets: Sheet[]): Workbook {
  return { fileName: `till-${page}-${today}.xlsx`, sheets: sheets.filter((sheet) => sheet.rows.length > 0) }
}

/** The band at the top of an overview sheet: the app and the page, then the dates it covers and the day it was saved. */
function heading(page: string, today: ISODate, period?: Range | string): Heading {
  const dates = typeof period === 'string' ? period : period && `${t.format.date(period.start)} – ${t.format.date(period.end)}`
  return { title: `${t.appName} · ${page}`, subtitle: [dates, words.exportedOn(t.format.date(today))].filter(Boolean).join(' · ') }
}

/** Label, value and, for amounts, the currency. A line with no value, like a debt with no due date, is left out. */
function summarySheet(rows: Row[], top: Heading, name = words.sheets.summary): Sheet {
  return {
    name,
    heading: top,
    headers: [col.item, col.value, col.currency],
    rows: rows.filter(([, value]) => {
      const shown = plain(value)
      return shown !== null && shown !== undefined && shown !== ''
    }),
  }
}

/** The stats tables on a sheet of their own, one under the other; none when there's nothing to show. */
function statsSheet(tables: Table[], top: Heading): Sheet[] {
  const [first, ...more] = tables
  return first ? [{ ...first, name: words.sheets.stats, heading: top, more }] : []
}

function namesIn(data: AppData) {
  return { categories: data.categories, accounts: data.accounts, goals: data.goals, debts: data.debts }
}

/** Something on a list that isn't a transaction: an amount added to a debt, or what a goal or debt started with. */
interface ExtraEntry {
  date?: ISODate
  type: string
  amount: number
  currency: string
  goal?: string
  person?: string
  note?: string
}

function noMoneyEntry(entry: NoMoneyEntry, main: string): ExtraEntry {
  return { date: entry.date, type: t.debts.addedNoMoney, amount: entry.amount, currency: entry.debt.currency ?? main, person: entry.debt.person, note: entry.note }
}

/**
 * Newest first, entries without a date last. Seen from one wallet (`viewAccountId`),
 * the amount is what that wallet gained or lost, so the column adds up. As in the app,
 * money in is green and a move between wallets grey; categories sit on their pastel.
 */
function entriesSheet(name: string, data: AppData, transactions: Transaction[], extras: ExtraEntry[] = [], viewAccountId?: ID): Sheet {
  const main = data.profile.currency
  const transactionRow = (tx: Transaction): Row => {
    const money = viewAccountId ? entryMoney(tx, viewAccountId, main) : { amount: tx.amount, currency: tx.currency ?? main }
    const way = direction(tx, viewAccountId)
    const tone: Tone | undefined = way === 'in' ? 'good' : way === 'move' ? 'muted' : undefined
    return [
      dateCell(tx.date),
      toned(entryWords.types[tx.type], tone),
      toned(viewAccountId && way === 'out' ? -money.amount : money.amount, tone),
      money.currency,
      categoryCell(data.categories, tx.categoryId),
      nameOf(data.accounts, tx.accountId),
      nameOf(data.accounts, tx.toAccountId),
      tx.toAmount,
      tx.toAmount === undefined ? null : (tx.toCurrency ?? main),
      nameOf(data.goals, tx.goalId),
      data.debts.find((d) => d.id === tx.debtId)?.person,
      tx.debtAmount,
      tx.note,
      tx.tags?.join(', '),
      tx.quantity,
    ]
  }
  const extraRow = (extra: ExtraEntry): Row => [dateCell(extra.date), extra.type, extra.amount, extra.currency, null, null, null, null, null, extra.goal, extra.person, null, extra.note, null, null]
  const rows = [
    ...transactions.map((tx) => ({ date: tx.date, row: transactionRow(tx) })),
    ...extras.map((extra) => ({ date: extra.date ?? '', row: extraRow(extra) })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  return {
    name,
    headers: [entryWords.date, entryWords.type, entryWords.amount, entryWords.currency, entryWords.category, entryWords.wallet, entryWords.toWallet, entryWords.toAmount, col.toCurrency, entryWords.goal, entryWords.person, entryWords.debtAmount, entryWords.note, entryWords.tags, entryWords.quantity],
    rows: rows.map(({ row }) => row),
  }
}

function filteredEntries(data: AppData, filter: TransactionFilter) {
  return {
    transactions: filterTransactions(data.transactions, filter, namesIn(data)),
    extras: filterNoMoneyEntries(noMoneyEntries(data.debts), filter).map((entry) => noMoneyEntry(entry, data.profile.currency)),
  }
}

/** A wallet below zero is in red; a closed one in grey. */
function walletRow(account: Account, data: AppData, today: ISODate): Row {
  const balance = walletBalance(account, data.transactions, today)
  return [
    account.name,
    t.walletSheet.kinds[account.kind],
    toned(balance, balance < 0 ? 'crit' : undefined),
    account.currency ?? data.profile.currency,
    account.lastCountedAt ? dateCell(todayISO(new Date(account.lastCountedAt))) : null,
    account.archived ? toned(col.closed, 'muted') : col.open,
  ]
}

const WALLET_HEADERS = [col.wallet, col.kind, col.balance, col.currency, col.lastCounted, col.status]

function openWallets(data: AppData) {
  return live(data.accounts).filter((a) => !a.archived)
}

const BILL_TONES: Record<BillStatus, Tone | undefined> = { paid: 'good', overdue: 'crit', 'due-soon': 'warn', upcoming: undefined }

function billsSheet(data: AppData, today: ISODate, cycle: Cycle): Sheet {
  const main = data.profile.currency
  const result = cycleBills(data.bills, cycle, data.transactions, today)
  const paymentOf = (id?: ID) => (id ? data.transactions.find((tx) => tx.id === id) : undefined)
  return {
    name: words.sheets.bills,
    headers: [col.name, col.amount, col.currency, col.frequency, col.category, col.wallet, col.due, col.status, col.paidOn],
    rows: [
      ...result.due.map(({ bill, occurrence }): Row => {
        const payment = paymentOf(occurrence.paymentId)
        return [bill.name, payment?.amount ?? bill.amount, payment?.currency ?? main, t.format.frequency[bill.frequency], categoryCell(data.categories, bill.categoryId), nameOf(data.accounts, bill.accountId), dateCell(occurrence.dueDate), badge(t.billsTab.status[occurrence.status], BILL_TONES[occurrence.status]), dateCell(payment?.date)]
      }),
      ...result.notDue.map(({ bill, nextDue }): Row => [bill.name, bill.amount, main, t.format.frequency[bill.frequency], categoryCell(data.categories, bill.categoryId), nameOf(data.accounts, bill.accountId), dateCell(nextDue), toned(t.billsTab.notDueTitle, 'muted'), null]),
    ],
  }
}

const GOAL_HEADERS = [col.goal, col.status, col.target, col.saved, col.remaining, col.progress, col.monthly, col.thisCycle, col.deadline, col.expected, col.needed, col.currency]
const GOAL_TONES: Record<GoalStatus, Tone> = { reached: 'good', 'on-track': 'good', behind: 'warn', overdue: 'crit' }

function goalRow(goal: Goal, data: AppData, today: ISODate, cycle: Cycle): Row {
  const { salary, currency } = data.profile
  // A fund is forecast to the next time it's needed, as on its page.
  const { forecast, status, due, savedThisCycle } = goalView(goal, data.transactions, cycle, today, salary, data.bills)
  return [
    goal.name,
    goal.archived ? badge(t.goals.status.finished, 'muted') : status && badge(goal.fund && status === 'reached' ? t.funds.ready : t.goals.status[status], GOAL_TONES[status]),
    goal.target,
    forecast.saved,
    forecast.remaining,
    percentCell(forecast.progress),
    goal.monthlyContribution,
    savedThisCycle,
    dateCell(due),
    dateCell(forecast.remaining > 0 ? forecast.projectedDate : null),
    forecast.remaining > 0 && forecast.neededPerMonth !== null ? suggestedContribution(forecast.neededPerMonth) : null,
    currency,
  ]
}

function goalsSheet(data: AppData, today: ISODate, cycle: Cycle, includeFinished: boolean): Sheet {
  const goals = live(data.goals).filter((goal) => includeFinished || !goal.archived)
  return { name: words.sheets.goals, headers: GOAL_HEADERS, rows: goals.map((goal) => goalRow(goal, data, today, cycle)), bars: [GOAL_HEADERS.indexOf(col.progress)] }
}

const DEBT_HEADERS = [col.person, col.direction, col.status, col.owed, col.total, col.repaid, col.progress, col.currency, col.monthly, col.plannedThisCycle, col.paidThisCycle, col.nextDate, col.nextAmount, col.due, col.since, col.note]
const DEBT_TONES: Record<DebtStatus, Tone | undefined> = { overdue: 'crit', 'due-soon': 'warn', open: undefined, settled: 'good', closed: 'muted' }

function debtRow(view: DebtView, main: string): Row {
  const { debt } = view
  return [
    debt.person,
    words.directions[debt.direction],
    badge(t.debts.status[view.status], DEBT_TONES[view.status]),
    view.owed,
    view.total,
    view.repaid,
    percentCell(view.progress),
    debt.currency ?? main,
    debt.monthlyPayment,
    view.plan.planned || null,
    view.plan.paid || null,
    dateCell(view.nextDate),
    view.nextAmount,
    dateCell(debt.dueDate),
    dateCell(debt.date),
    debt.note,
  ]
}

function debtsSheet(data: AppData, today: ISODate, cycle: Cycle): Sheet {
  return { name: words.sheets.debts, headers: DEBT_HEADERS, rows: debtViews(data.debts, data.transactions, cycle, today).map((view) => debtRow(view, data.profile.currency)), bars: [DEBT_HEADERS.indexOf(col.progress)] }
}

/** Home: the current pay cycle's numbers, with everything the page's cards sum up, and the cycle's stats. */
export function homeWorkbook(data: AppData, today: ISODate): Workbook {
  const main = data.profile.currency
  const summary = budgetSummary(data, today)
  const { cycle } = summary
  // Bills, goals and instalments are monthly, even when pay isn't.
  const month = planMonth(today, data.profile.salary)
  const entries = filteredEntries(data, { range: cycle })
  const budgetRows: Row[] =
    summary.hasPay
      ? [
          [t.home.leftToSpend, toned(leftShown(summary), leftShown(summary) < 0 ? 'crit' : undefined), main],
          ...(summary.waitingFor > 0 ? ([[t.breakdown.notHereYet, summary.waitingFor, main]] as Row[]) : []),
          [col.flexibleBudget, summary.flexibleBudget, main],
          [t.home.usedLabel, percentCell(summary.usedRatio)],
          [col.cycleGone, percentCell(summary.progress.elapsedRatio)],
          [t.home.safeToSpend, summary.safePerDay, main],
          [col.daysToPayday, summary.progress.daysLeft],
        ]
      : []
  return workbook('home', today, [
    summarySheet(
      [
        [t.stats.from, dateCell(cycle.start)],
        [t.stats.to, dateCell(cycle.end)],
        ...budgetRows,
        [t.home.spent, summary.spent, main],
        [t.home.income, summary.income, main],
        [t.home.saved, summary.saved, main],
      ],
      heading(t.nav.home, today, cycle),
    ),
    ...statsSheet(statsTables(data, entries.transactions, cycle, today), heading(`${t.nav.home} · ${words.sheets.stats}`, today, cycle)),
    { name: words.sheets.wallets, headers: WALLET_HEADERS, rows: openWallets(data).map((account) => walletRow(account, data, today)) },
    billsSheet(data, today, month),
    goalsSheet(data, today, month, false),
    debtsSheet(data, today, month),
    entriesSheet(words.sheets.entries, data, entries.transactions, entries.extras),
  ])
}

/** Activity: every entry the current period, search and filters match, past the 300 the page stops at, and their stats. */
export function activityWorkbook(data: AppData, today: ISODate, filter: TransactionFilter): Workbook {
  const { transactions, extras } = filteredEntries(data, filter)
  const entryCount = transactions.length + extras.length
  const period = filter.range ?? t.detail.allTime
  return workbook('activity', today, [
    ...(entryCount === 0
      ? []
      : [
          summarySheet(
            [
              ...(filter.range
                ? [
                    [t.stats.from, dateCell(filter.range.start)],
                    [t.stats.to, dateCell(filter.range.end)],
                  ]
                : []),
              [col.entryCount, entryCount],
              ...keyFigures(data, transactions, filter.range, today),
            ],
            heading(t.nav.activity, today, period),
          ),
          ...statsSheet(statsTables(data, transactions, filter.range, today), heading(`${t.nav.activity} · ${words.sheets.stats}`, today, period)),
        ]),
    entriesSheet(words.sheets.entries, data, transactions, extras),
  ])
}

const BUDGET_STATUS: Record<BudgetLevel, string> = { ok: words.budgetStatus.ok, warning: words.budgetStatus.warning, over: words.budgetStatus.over }
const BUDGET_TONES: Record<BudgetLevel, Tone> = { ok: 'good', warning: 'warn', over: 'crit' }

/** Plan › Budget: the pay cycle chosen on the page. Bills and the like are negative, so the amounts add up to what's left. */
export function budgetWorkbook(data: AppData, today: ISODate, cycleDate: string | null): Workbook {
  const main = data.profile.currency
  const salary = data.profile.salary
  const cycle = getPayCycle(cycleDate && isValidDate(cycleDate) ? cycleDate : today, salary)
  const summary = budgetSummary(data, today, cycle)
  const unlimited = unbudgetedSpending(data.categories, inMainCurrency(data.transactions, main), cycle)
  const copy = t.breakdown
  const left = summary.leftToSpend + summary.waitingFor
  const breakdown: Row[] = [
    [t.stats.from, dateCell(cycle.start)],
    [t.stats.to, dateCell(cycle.end)],
    [summary.irregular ? (summary.onEstimate && summary.salary > summary.received ? copy.estimate : copy.incomeSoFar) : copy.salary, summary.salary, main],
    ...(summary.otherIncome > 0 ? [[copy.otherIncome, summary.otherIncome, main]] : []),
    ...(summary.waitingFor > 0 ? [[copy.notHereYet, summary.waitingFor, main]] : []),
    ...(summary.debtIn > 0 ? [[copy.debtIn, summary.debtIn, main]] : []),
    ...(summary.exchangedBack > 0 ? [[copy.exchangedBack, summary.exchangedBack, main]] : []),
    [copy.bills, -summary.billsReserved, main],
    ...(summary.debtOut > 0 ? [[copy.debtOut, -summary.debtOut, main]] : []),
    ...(summary.exchangedOut > 0 ? [[copy.exchangedOut, -summary.exchangedOut, main]] : []),
    [copy.savings, -summary.savingsReserved, main],
    [copy.spent, -summary.flexibleSpent, main],
    [totalCell(summary.waitingFor > 0 ? copy.leftOnceArrived : copy.left), toned(left, left < 0 ? 'crit' : undefined), main],
    [t.home.usedLabel, percentCell(summary.usedRatio)],
  ]
  return workbook('budget', today, [
    ...(summary.hasPay ? [summarySheet(breakdown, heading(`${t.plan.title} · ${t.plan.budget}`, today, cycle))] : []),
    {
      name: words.sheets.limits,
      headers: [col.category, col.limit, col.spent, col.left, col.used, col.status, col.currency],
      rows: summary.categories.map((row): Row => [categoryCell(data.categories, row.categoryId), row.budget, row.spent, toned(row.remaining, row.remaining < 0 ? 'crit' : undefined), percentCell(row.ratio), badge(BUDGET_STATUS[row.level], BUDGET_TONES[row.level]), main]),
      bars: [4],
      // What's spent beside its limit, in grey.
      chart: { kind: 'bar', labels: 0, series: [{ column: 2 }, { column: 1, color: BEFORE_COLOR }] },
    },
    {
      name: words.sheets.noLimit,
      headers: [col.category, col.spent, col.currency],
      rows: unlimited.map(({ categoryId, spent }): Row => [categoryCell(data.categories, categoryId), spent, main]),
      bars: [1],
    },
  ])
}

/** Plan › Bills: this pay cycle's bills, then the ones with no date in it. */
export function billsWorkbook(data: AppData, today: ISODate): Workbook {
  const main = data.profile.currency
  const cycle = planMonth(today, data.profile.salary)
  const result = cycleBills(data.bills, cycle, data.transactions, today)
  const list = billsSheet(data, today, cycle)
  return workbook('bills', today, [
    ...(list.rows.length === 0
      ? []
      : [
          summarySheet(
            [
              [col.planned, result.planned, main],
              [col.paid, result.paid, main],
              [col.monthly, Math.round(totalMonthlyBills(data.bills)), main],
            ],
            heading(`${t.plan.title} · ${t.plan.bills}`, today, cycle),
          ),
        ]),
    list,
  ])
}

/** Plan › Goals: active goals and finished ones. */
export function goalsWorkbook(data: AppData, today: ISODate): Workbook {
  const main = data.profile.currency
  const { salary } = data.profile
  const cycle = planMonth(today, salary)
  const views = goalViews(data.goals, data.transactions, cycle, today, salary, data.bills)
  const list = goalsSheet(data, today, cycle, true)
  return workbook('goals', today, [
    ...(views.length === 0
      ? []
      : [
          summarySheet(
            [
              [t.goals.summaryLabel, sumAmounts(views.map((v) => v.forecast.saved)), main],
              [col.thisCycle, sumAmounts(views.map((v) => v.savedThisCycle)), main],
              [col.monthly, sumAmounts(views.map((v) => v.goal.monthlyContribution)), main],
            ],
            heading(`${t.plan.title} · ${t.plan.goals}`, today),
          ),
        ]),
    list,
  ])
}

/** One goal: where it stands, and every move in and out of it. */
export function goalWorkbook(data: AppData, today: ISODate, goal: Goal): Workbook {
  const main = data.profile.currency
  const cycle = planMonth(today, data.profile.salary)
  const [name, status, target, saved, remaining, progress, monthly, thisCycle, deadline, expected, needed] = goalRow(goal, data, today, cycle)
  const history = live(data.transactions).filter((tx) => tx.goalId === goal.id).sort(newestFirst)
  const started: ExtraEntry[] = goal.startingAmount ? [{ type: t.goalPage.startedWith, amount: goal.startingAmount, currency: main, goal: goal.name, note: t.goalPage.beforeTracking }] : []
  return workbook(`goal-${fileSlug(goal.name)}`, today, [
    summarySheet(
      [
        [col.goal, name],
        [col.status, status],
        [col.target, target, main],
        [col.saved, saved, main],
        [col.remaining, remaining, main],
        [col.progress, progress],
        [col.monthly, monthly, main],
        [col.thisCycle, thisCycle, main],
        [col.deadline, deadline],
        [col.expected, expected],
        [col.needed, needed, main],
      ],
      heading(goal.name, today),
    ),
    entriesSheet(words.sheets.entries, data, history, started),
  ])
}

/** Plan › Debts: open and settled, each in its own currency. Totals are per currency. */
export function debtsWorkbook(data: AppData, today: ISODate): Workbook {
  const main = data.profile.currency
  const cycle = planMonth(today, data.profile.salary)
  const views = debtViews(data.debts, data.transactions, cycle, today)
  const { iOwe, owedToMe } = debtTotals(views, main)
  return workbook('debts', today, [
    ...(views.length === 0 ? [] : [summarySheet([...iOwe.map(({ amount, currency }): Row => [t.debts.iOwe, amount, currency]), ...owedToMe.map(({ amount, currency }): Row => [t.debts.owedToMe, amount, currency])], heading(`${t.plan.title} · ${t.plan.debts}`, today))]),
    { name: words.sheets.debts, headers: DEBT_HEADERS, rows: views.map((view) => debtRow(view, main)), bars: [DEBT_HEADERS.indexOf(col.progress)] },
  ])
}

/** One debt: where it stands, its repeating charges, and everything that moved it. */
export function debtWorkbook(data: AppData, today: ISODate, debt: Debt): Workbook {
  const main = data.profile.currency
  const currency = debt.currency ?? main
  const view = debtView(debt, data.transactions, planMonth(today, data.profile.salary), today)
  const row = debtRow(view, main)
  const history = live(data.transactions).filter((tx) => tx.debtId === debt.id).sort(newestFirst)
  const added = noMoneyEntries([debt]).map((entry): ExtraEntry => (entry.charge ? noMoneyEntry(entry, main) : { ...noMoneyEntry(entry, main), type: t.debtPage.startedWith }))
  return workbook(`debt-${fileSlug(debt.person)}`, today, [
    summarySheet(
      DEBT_HEADERS.flatMap((header, index): Row[] => {
        // Currency gets its own column here, next to each amount.
        if (header === col.currency) return []
        const value = row[index]
        const isAmount = typeof plain(value) === 'number'
        return [[header, value, isAmount ? currency : null]]
      }),
      heading(debt.person, today),
    ),
    {
      name: words.sheets.repeats,
      headers: [col.name, col.amount, col.currency, col.since, col.status],
      rows: (debt.repeats ?? []).map((repeat): Row => [repeat.name, repeat.amount, currency, dateCell(repeat.startDate), repeat.stoppedAt ? toned(col.closed, 'muted') : col.open]),
    },
    entriesSheet(words.sheets.entries, data, history, added),
  ])
}

/** Stats: the period chosen on the page. Its numbers count the main currency; others get their own sheet, and their own rows in the Stats sheet. */
export function statsWorkbook(data: AppData, today: ISODate, period: StatsPeriod): Workbook {
  const { currency: main, work } = data.profile
  const copy = t.stats
  const transactions = inMainCurrency(data.transactions, main)
  const periodSums = periodTotals(transactions, data.accounts, period.range)
  const previousSpent = periodTotals(transactions, data.accounts, period.previous).spent
  const biggest = biggestExpense(transactions, period.range)
  const busiest = busiestWeekday(transactions, period.range)
  const skipped = skippedSavings(data.wishlist, period.range)
  const flows = debtFlows(transactions, data.debts, period.range)
  const rate = savingsRate(periodSums, flows)
  const kept = keptAfterDebts(periodSums, flows)
  const hourly = data.settings.showWorkHours ? hourlyRate(data.profile, totalMonthlyBills(data.bills)) : null
  const workTime = hourly ? workTimeFor(periodSums.spent, hourly, work.hoursPerDay) : null
  const inPeriod = filterTransactions(data.transactions, { range: period.range }, namesIn(data))
  return workbook('stats', today, [
    summarySheet(
      [
        [copy.from, dateCell(period.range.start)],
        [copy.to, dateCell(period.range.end)],
        [col.spent, periodSums.spent, main],
        [col.previousPeriod, previousSpent, main],
        [copy.tiles.dailyAverage, period.elapsedDays > 0 ? Math.round(periodSums.flexible / period.elapsedDays) : 0, main],
        [biggest ? biggestLabel(data, biggest) : copy.tiles.biggest, biggest?.amount ?? copy.tiles.none, biggest ? main : null],
        [copy.tiles.busiest, busiest === null ? copy.tiles.none : t.format.weekdays[busiest]],
        [copy.tiles.savingsRate, rate === null ? copy.tiles.noIncome : toned(percentCell(rate), rate < 0 ? 'crit' : undefined)],
        [copy.tiles.kept, toned(kept, kept < 0 ? 'crit' : undefined), main],
        [copy.tiles.skipped, skipped.total, main],
        ...(workTime ? [[copy.tiles.workHours, formatWorkTime(workTime)]] : []),
        [copy.split.flexible, periodSums.flexible, main],
        [copy.split.fixed, periodSums.fixed, main],
        [copy.split.cash, periodSums.cash, main],
        [copy.split.card, periodSums.card, main],
      ],
      heading(t.nav.stats, today, period.range),
    ),
    // Where the money went has its own sheet below, with the change from the period before.
    ...statsSheet(statsTables(data, inPeriod, period.range, today, { categories: false }), heading(`${t.nav.stats} · ${words.sheets.stats}`, today, period.range)),
    {
      name: words.sheets.categories,
      headers: [col.category, col.spent, col.share, col.previousPeriod, col.change, col.currency],
      // Spending that went up is in red, down in green.
      rows: categoryBreakdown(transactions, period.range, period.previous).map((row): Row => [categoryCell(data.categories, row.categoryId), row.spent, percentCell(row.share), row.previous, toned(percentCell(row.change, true), row.change === null || row.change === 0 ? undefined : row.change > 0 ? 'crit' : 'good'), main]),
      bars: [2],
      // Each category beside the period before, in grey.
      chart: { kind: 'bar', title: copy.categories.title, labels: 0, series: [{ column: 1 }, { column: 3, color: BEFORE_COLOR }] },
    },
    {
      name: words.sheets.cycles,
      headers: [copy.from, copy.to, col.income, col.spent, col.saved, copy.tiles.savingsRate, col.currency],
      rows: cycleTrend(transactions, data.accounts, period.trend, today, data.debts).map((point): Row => [dateCell(point.cycle.start), dateCell(point.cycle.end), point.income, point.spent, point.saved, toned(percentCell(point.savingsRate), point.savingsRate !== null && point.savingsRate < 0 ? 'crit' : undefined), main]),
      bars: [3],
      // As on Stats: spending in columns, income a line over them.
      chart: { kind: 'column', title: copy.trend.title, labels: 0, series: [{ column: 3 }, { column: 2, line: true, color: INCOME_COLOR }] },
    },
    {
      name: words.sheets.otherCurrencies,
      headers: [col.currency, col.spent, col.income],
      rows: otherCurrencyTotals(data.transactions, period.range, main).map((row): Row => [row.currency, row.spent, row.received]),
    },
  ])
}

/** Wallets: every wallet, totals per currency, and all the moves of the wallet being looked at, with their stats. */
export function walletsWorkbook(data: AppData, today: ISODate, shownAccountId: ID | undefined): Workbook {
  const main = data.profile.currency
  const accounts = live(data.accounts)
  const open = accounts.filter((a) => !a.archived)
  const balances = byCurrency(open.map((account) => ({ currency: account.currency ?? main, amount: walletBalance(account, data.transactions, today) })), main)
  const shown = shownAccountId ? filterTransactions(data.transactions, { accountId: shownAccountId }, namesIn(data)) : []
  const shownName = nameOf(data.accounts, shownAccountId)
  return workbook('wallets', today, [
    ...(balances.length === 0 ? [] : [summarySheet(balances.map(({ amount, currency }): Row => [totalCell(t.wallets.total), amount, currency]), heading(t.nav.wallets, today))]),
    ...statsSheet(statsTables(data, shown, undefined, today), heading(`${t.nav.wallets} · ${shownName}`, today, t.detail.allTime)),
    { name: words.sheets.wallets, headers: WALLET_HEADERS, rows: accounts.map((account) => walletRow(account, data, today)) },
    entriesSheet(words.sheets.entries, data, shown, [], shownAccountId),
  ])
}

const NET_WORTH_PARTS: NetWorthPart[] = ['wallets', 'goals', 'owedToYou', 'assets', 'youOwe']

/** Wallets › Net worth: today's total and its parts per currency, month by month in the main currency, and every value of every asset. */
export function netWorthWorkbook(data: AppData, today: ISODate): Workbook {
  const copy = t.netWorth
  const main = data.profile.currency
  const rows = netWorthOn(data, today)
  const summary = rows.flatMap((row): Row[] => [
    ...NET_WORTH_PARTS.filter((part) => row[part] !== 0).map((part): Row => [copy.parts[part], part === 'youOwe' ? -row[part] : row[part], row.currency]),
    [totalCell(copy.title), toned(row.total, row.total < 0 ? 'crit' : undefined), row.currency],
  ])
  const history = netWorthHistory(data, today)
  const assetRows = live(data.assets).flatMap((asset) =>
    [...asset.values]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((v): Row => [asset.name, copy.kinds[asset.kind], dateCell(v.date), v.value, asset.currency ?? main, asset.grams ?? null, v.perGram ?? null, asset.soldAt ? dateCell(asset.soldAt) : null]),
  )
  const totalColumn = NET_WORTH_PARTS.length + 1
  return workbook('net-worth', today, [
    summarySheet(summary, heading(copy.title, today)),
    {
      name: words.sheets.netWorth,
      headers: [col.month, ...NET_WORTH_PARTS.map((part) => copy.parts[part]), copy.title, col.currency],
      rows: history.length < 2 ? [] : history.map((p): Row => [monthCell(p.date), ...NET_WORTH_PARTS.map((part) => (part === 'youOwe' ? -p.row[part] : p.row[part])), p.row.total, main]),
      bars: [totalColumn],
      chart: { kind: 'line', labels: 0, series: [{ column: totalColumn, color: INCOME_COLOR }] },
    },
    { name: words.sheets.assets, headers: [col.name, col.kind, col.valueFrom, col.value, col.currency, col.grams, col.perGram, col.soldOn], rows: assetRows },
  ])
}

const WISHLIST_ORDER: Record<WishlistItem['status'], number> = { thinking: 0, skipped: 1, bought: 2 }
/** Skipped is money kept, so it's the green one. */
const WISHLIST_TONES: Record<WishlistItem['status'], Tone> = { thinking: 'warn', skipped: 'good', bought: 'muted' }

/** Is it worth it › Wishlist: thinking it over, then skipped, then bought. */
export function wishlistWorkbook(data: AppData, today: ISODate): Workbook {
  const copy = t.wishlist
  const status: Record<WishlistItem['status'], string> = { thinking: copy.thinking, skipped: copy.skippedTitle, bought: copy.boughtTitle }
  const rate = hourlyRate(data.profile, totalMonthlyBills(data.bills))
  const onDay = (moment?: string) => (moment ? dateCell(todayISO(new Date(moment))) : null)
  const items = live(data.wishlist).sort((a, b) => WISHLIST_ORDER[a.status] - WISHLIST_ORDER[b.status] || (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
  return workbook('wishlist', today, [
    {
      name: words.sheets.wishlist,
      headers: [col.name, col.price, col.currency, col.category, col.status, col.workTime, col.askAgain, col.decidedOn],
      rows: items.map((item): Row => [
        item.name || t.worthIt.unnamed,
        item.price,
        data.profile.currency,
        categoryCell(data.categories, item.categoryId),
        badge(status[item.status], WISHLIST_TONES[item.status]),
        rate ? formatWorkTime(workTimeFor(item.price, rate, data.profile.work.hoursPerDay)) : null,
        item.status === 'thinking' ? onDay(item.remindAt) : null,
        onDay(item.decidedAt),
      ]),
    },
  ])
}

/** Is it worth it?: the price being checked and what the page says about it. */
export function worthItWorkbook(data: AppData, today: ISODate, item: { name: string; price: number; categoryId?: ID }, check: WorthItCheck): Workbook {
  const main = data.profile.currency
  const copy = t.worthIt
  const category = nameOf(data.categories, item.categoryId)
  const money = (amount: number) => formatMoney(amount, main)
  const budget = check.budget
  const budgetLine =
    budget?.kind === 'already-over'
      ? copy.alreadyOver(category, money(budget.overBy))
      : budget?.kind === 'goes-over'
        ? copy.goesOver(category, money(budget.overBy))
        : budget?.kind === 'fits'
          ? copy.fits(`${Math.round(budget.share * 100)}%`, category, money(budget.remaining))
          : null
  return workbook('worth-it', today, [
    summarySheet(
      [
        [copy.nameLabel, item.name.trim() || copy.unnamed],
        [copy.priceLabel, item.price, main],
        ...(category ? [[copy.categoryLabel, categoryCell(data.categories, item.categoryId)]] : []),
        ...(check.work ? [[col.workTime, formatWorkTime(check.work)]] : []),
        ...(check.salaryShare === null ? [] : [[col.salaryShare, percentCell(check.salaryShare)]]),
        ...(budgetLine ? [[col.budget, toned(budgetLine, budget?.kind === 'fits' ? 'good' : 'crit')]] : []),
        ...(check.goal ? [[col.goal, copy.goalDelay(check.goal.goal.name, check.goal.days)]] : []),
      ],
      heading(t.nav.worthIt, today),
      words.sheets.check,
    ),
  ])
}

/** Settings › Categories: spending first, then income, each in the page's order, each on its colour. */
export function categoriesWorkbook(data: AppData, today: ISODate): Workbook {
  const copy = t.categoriesPage
  const categories = live(data.categories)
    .filter((c) => !c.system && !c.archived)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.order - b.order)
  return workbook('categories', today, [
    {
      name: words.sheets.categories,
      headers: [col.name, col.kind, col.limit, col.currency, col.status],
      rows: categories.map((category): Row => [
        categoryCell(data.categories, category.id),
        category.kind === 'expense' ? copy.expenses : copy.income,
        category.monthlyBudget,
        category.monthlyBudget ? data.profile.currency : null,
        category.enabled ? col.open : toned(copy.off, 'muted'),
      ]),
    },
  ])
}
