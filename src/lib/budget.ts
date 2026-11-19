import type { AppData, Bill, Category, Goal, GoalFund, ID, ISODate, Profile, Transaction } from '../types'
import { billOccurrences, cycleBills } from './bills'
import { familyIds } from './categoryTree'
import { cycleProgress, getPayCycle, hasPaydays, isWithin, monthShare, planMonth, type Cycle, type CycleProgress } from './dates'
import { exchangedMoney, inMainCurrency, isMainCurrency } from './currency'
import { debtPlan } from './debts'
import { fundBill, fundForBill, fundPart, plannedMonthlyBills, walletPart } from './funds'
import { isSpending, spentAmount } from './spending'
import { goalSaved, goalSavedIn } from './goals'
import { live } from './id'
import { expectedPays, isSalaryEntry, payPlanStart, salaryCountedOn, scheduledPays } from './income'
import { roundMoney, sumAmounts } from './money'
import { monthlySalary } from './workHours'

export type BudgetLevel = 'ok' | 'warning' | 'over'

export function budgetLevel(ratio: number, warnAtPercent: number): BudgetLevel {
  if (ratio >= 1) return 'over'
  if (ratio * 100 >= warnAtPercent) return 'warning'
  return 'ok'
}

/** Planned money for flexible spending each month: pay − fixed bills − planned savings. A bill a fund pays is planned through the fund. */
export function plannedFreeToSpend(profile: Pick<Profile, 'salary'>, bills: Bill[], goals: Goal[], debtPayments = 0, otherIncome = 0): number {
  const savings = sumAmounts(live(goals).filter((g) => !g.archived).map((g) => g.monthlyContribution))
  return roundMoney(monthlySalary(profile.salary) + otherIncome - plannedMonthlyBills(bills, goals) - savings - debtPayments)
}

/**
 * The most a goal can plan to put aside each month: what the salary leaves after
 * bills, instalments and the other active goals. `null` until a salary is set, when nothing limits it.
 * A fund for a bill takes over that bill's place in the plan, so the bill no longer counts.
 */
export function monthlyRoomForGoal(
  profile: Pick<Profile, 'salary'>,
  bills: Bill[],
  goals: Goal[],
  goal?: ID | { id?: ID; fund?: GoalFund },
  debtPayments = 0,
  otherIncome = 0,
): number | null {
  const salary = monthlySalary(profile.salary) + otherIncome
  if (salary <= 0) return null
  const { id: goalId, fund } = typeof goal === 'string' ? { id: goal, fund: undefined } : (goal ?? {})
  const others = sumAmounts(live(goals).filter((g) => !g.archived && g.id !== goalId).map((g) => g.monthlyContribution))
  // A fund being added for a bill isn't in `goals` yet, but its bill already makes way for it.
  const withThis = fund?.billId ? [...goals, { id: goalId ?? 'new', fund, archived: false } as Goal] : goals
  return roundMoney(salary - plannedMonthlyBills(bills, withThis) - others - debtPayments)
}

/**
 * Splits free-to-spend money into suggested limits, rounded to 100 DA. The last
 * category in `split` gets whatever rounding left over, so the limits add up exactly.
 */
export function suggestBudgets(freeToSpend: number, split: [ID, number][]): Map<ID, number> {
  const limits = new Map<ID, number>()
  if (freeToSpend <= 0 || split.length === 0) return limits
  let assigned = 0
  for (const [id, share] of split.slice(0, -1)) {
    const limit = Math.round((freeToSpend * share) / 100) * 100
    limits.set(id, limit)
    assigned += limit
  }
  const [lastId] = split[split.length - 1]
  let rest = roundMoney(freeToSpend - assigned)
  if (rest < 0) {
    // Rounding up overshot a small amount: take it back from the first category.
    const [firstId] = split[0]
    limits.set(firstId, roundMoney((limits.get(firstId) ?? 0) + rest))
    rest = 0
  }
  limits.set(lastId, rest)
  return limits
}

function inRange(transactions: Transaction[], range: { start: ISODate; end: ISODate }): Transaction[] {
  return live(transactions).filter((t) => isWithin(t.date, range))
}

/** Flexible spending: expenses that don't pay a bill (bills are planned separately), and refunds of them. */
function isFlexible(t: Transaction): boolean {
  return isSpending(t) && !t.billId
}

/** What an entry costs this cycle's budget: an expense what left the wallet (a fund paid the rest), a refund gives its amount back. */
function budgetPart(t: Transaction): number {
  return t.type === 'refund' ? -t.amount : t.type === 'expense' ? walletPart(t) : 0
}

/**
 * Expense totals per category in `range`. With `flexibleOnly`, what counts against limits: no bill
 * payments, and nothing a fund paid, since that was put aside for it.
 */
export function spentByCategory(
  transactions: Transaction[],
  range: { start: ISODate; end: ISODate },
  options: { flexibleOnly?: boolean } = {},
): Map<ID, number> {
  const totals = new Map<ID, number>()
  for (const t of inRange(transactions, range)) {
    if (!isSpending(t) || !t.categoryId || (options.flexibleOnly && !isFlexible(t))) continue
    const amount = options.flexibleOnly ? budgetPart(t) : spentAmount(t)
    if (amount === 0) continue
    totals.set(t.categoryId, roundMoney((totals.get(t.categoryId) ?? 0) + amount))
  }
  return totals
}

/** A monthly amount's part of a cycle. A share is an estimate anyway, so it's in whole money. */
function shareOf(amount: number, share: number): number {
  return share < 1 ? Math.round(amount * share) : amount
}

/**
 * What a goal plans to put aside this cycle: its monthly amount, or its share of it with weekly pay.
 * A fund never plans past its target: once it's full it waits for its date, and after a catch-up
 * year a high amount only fills it sooner. While its bill is due and unpaid this cycle, what the
 * fund is missing is already reserved for the bill itself, so the fund plans nothing on top.
 */
export function goalPlannedIn(goal: Goal, transactions: Transaction[], cycle: Cycle, share = monthShare(cycle), bills: Bill[] = []): number {
  if (goal.deleted || goal.archived) return 0
  const planned = shareOf(goal.monthlyContribution, share)
  if (!goal.fund) return planned
  const bill = fundBill(goal, bills)
  // With weekly pay, bills are planned by share, never reserved whole, so the fund keeps its share.
  if (share >= 1 && bill && billOccurrences(bill, cycle, transactions, cycle.start).some((o) => o.status !== 'paid')) return 0
  const putAsideNow = goalSavedIn(goal.id, transactions, cycle)
  const missing = Math.max(0, roundMoney(goal.target - (goalSaved(goal, transactions) - putAsideNow)))
  return Math.min(planned, missing)
}

/**
 * Funds still short of what they plan to get this month, and by how much: Home offers to put
 * it all aside in one tap. Months follow the plan, so weekly pay counts calendar months.
 */
export function fundsToPutAside(data: Pick<AppData, 'goals' | 'transactions' | 'bills' | 'profile'>, today: ISODate): { goal: Goal; amount: number }[] {
  const month = planMonth(today, data.profile.salary)
  const transactions = inMainCurrency(data.transactions, data.profile.currency)
  return live(data.goals)
    .filter((goal) => goal.fund && !goal.archived)
    .map((goal) => {
      const deposits = sumAmounts(live(transactions).filter((t) => t.type === 'goal-deposit' && t.goalId === goal.id && isWithin(t.date, month)).map((t) => t.amount))
      return { goal, amount: roundMoney(goalPlannedIn(goal, transactions, month, 1, data.bills) - deposits) }
    })
    .filter((item) => item.amount > 0)
}

/** What a goal takes from this cycle's pay: what it plans, or more if more was put aside. */
function goalReserved(goal: Goal, transactions: Transaction[], cycle: Cycle, share: number, bills: Bill[]): number {
  const deposits = sumAmounts(live(transactions).filter((t) => t.type === 'goal-deposit' && t.goalId === goal.id && isWithin(t.date, cycle)).map((t) => t.amount))
  return Math.max(goalPlannedIn(goal, transactions, cycle, share, bills), deposits)
}

export interface CategoryBudget {
  categoryId: ID
  budget: number
  spent: number
  /** Negative when over budget. */
  remaining: number
  ratio: number
  level: BudgetLevel
}

/** Every enabled category with a limit, in display order, main categories counting their subcategories. Bill payments don't count against limits. */
export function categoryBudgets(
  categories: Category[],
  transactions: Transaction[],
  cycle: Cycle,
  warnAtPercent: number,
): CategoryBudget[] {
  const spent = spentByCategory(transactions, cycle, { flexibleOnly: true })
  // Limits are set per month: a weekly pay cycle gets its share of each.
  const share = monthShare(cycle)
  return live(categories)
    .filter((c) => c.kind === 'expense' && c.enabled && !c.archived && (c.monthlyBudget ?? 0) > 0)
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      const budget = shareOf(c.monthlyBudget ?? 0, share)
      // A main category's limit covers its subcategories too. A refund bigger than this cycle's spending leaves nothing spent, never less.
      const family = familyIds(categories, c.id)
      const categorySpent = Math.max(0, roundMoney([...family].reduce((sum, id) => sum + (spent.get(id) ?? 0), 0)))
      const ratio = categorySpent / budget
      return {
        categoryId: c.id,
        budget,
        spent: categorySpent,
        remaining: roundMoney(budget - categorySpent),
        ratio,
        level: budgetLevel(ratio, warnAtPercent),
      }
    })
}

/** Flexible spending in categories without a limit, biggest first. Shown so it isn't invisible. */
export function unbudgetedSpending(categories: Category[], transactions: Transaction[], range: { start: ISODate; end: ISODate }): { categoryId: ID; spent: number }[] {
  // Under a main category with a limit, a subcategory is covered by it.
  const limited = new Set(
    live(categories)
      .filter((c) => c.enabled && !c.archived && (c.monthlyBudget ?? 0) > 0)
      .flatMap((c) => [...familyIds(categories, c.id)]),
  )
  return [...spentByCategory(transactions, range, { flexibleOnly: true })]
    .filter(([id, spent]) => !limited.has(id) && spent > 0)
    .map(([categoryId, spent]) => ({ categoryId, spent }))
    .sort((a, b) => b.spent - a.spent)
}

export interface BudgetSummary {
  cycle: Cycle
  progress: CycleProgress
  /** All income logged this cycle. */
  income: number
  /** All expenses this cycle, bills included, less refunds. */
  spent: number
  /** Goal deposits minus withdrawals this cycle. */
  saved: number
  /**
   * The pay the cycle starts from: the salary that really arrived. The exception is the cycle the
   * app was set up in or the schedule changed in, whose salary came before then, so settings say
   * what it was. Irregular pay: everything received, or the monthly estimate while that's bigger.
   */
  salary: number
  /** Income logged this cycle on top of the salary (bonuses, side income, gifts). */
  otherIncome: number
  /** Whether there's pay to budget from at all. Without any, the app asks for it instead of showing a budget. */
  hasPay: boolean
  /** No fixed paydays: the budget month has no payday to count down to. */
  irregular: boolean
  /** Budget from an estimate rather than from what's received, so nothing is "waited for". */
  onEstimate: boolean
  /** Everything received this cycle with irregular pay, next to the estimate. */
  received: number
  /** Pay due by today with no answer yet. Not counted until it arrives. */
  waitingFor: number
  /** Pay due later this cycle. Not counted until it arrives. */
  stillExpected: number
  /** How much of a month this cycle stands for: under 1 with weekly and biweekly pay. */
  share: number
  /** Bill payments made this cycle, plus the planned amount of every bill still to pay. With weekly or biweekly pay: this cycle's share of the month's bills. */
  billsReserved: number
  /** For each goal, its planned amount for this cycle or what was put aside, whichever is bigger, less what was taken back out this cycle. */
  savingsReserved: number
  /** Money taken out of goals this cycle beyond what this cycle put in: older savings. Spending it isn't spending the salary. */
  fromSavings: number
  /** What funds paid this cycle, for bills or anything else. It was put aside before, so it's left out of bills and spending. */
  fromFunds: number
  /** Money that came in through debts this cycle: borrowed, or paid back to you. */
  debtIn: number
  /** Money that left through debts this cycle (lent, or paid back), plus instalments still to pay. */
  debtOut: number
  /** Main-currency money changed into other currencies this cycle. Without exchange rates, this is the only way the budget sees it leaving. */
  exchangedOut: number
  /** Money changed back into the main currency this cycle. */
  exchangedBack: number
  /** What the salary leaves for everyday spending: salary + other income + money coming in through debts or changed back − bills − savings − money going out through debts or changed. */
  flexibleBudget: number
  /** Expenses that aren't bill payments, including categories without a limit, less what came out of goals. */
  flexibleSpent: number
  /** Negative when over the flexible budget. */
  leftToSpend: number
  usedRatio: number
  /** Left to spend spread over the days left, never negative. */
  safePerDay: number
  /** Budget used minus cycle elapsed; positive means spending ahead of pace. */
  paceDelta: number
  spendingTooFast: boolean
  categories: CategoryBudget[]
}

/**
 * What to show as left to spend. While pay is on its way, bills and goals are already taken
 * off with nothing to take them from; that isn't being over budget, so it doesn't read as if it were.
 */
export function leftShown(summary: Pick<BudgetSummary, 'leftToSpend' | 'waitingFor'>): number {
  return summary.waitingFor > 0 ? Math.max(0, summary.leftToSpend) : summary.leftToSpend
}

export type BudgetData = Pick<AppData, 'profile' | 'settings' | 'categories' | 'transactions' | 'bills' | 'goals' | 'debts' | 'incomes'>

/**
 * The budget for the pay cycle containing `today`, or for another `cycle`
 * (progress is still measured from today). Everything starts from the pay that
 * really arrived: bills due this cycle and the goals' amounts are taken off first,
 * and what's left is what there is to spend. Pay still on its way isn't counted, so
 * a late or unpaid salary never shows a full budget.
 */
export function budgetSummary(data: BudgetData, today: ISODate, cycle: Cycle = getPayCycle(today, data.profile.salary)): BudgetSummary {
  const progress = cycleProgress(cycle, today)
  const main = data.profile.currency
  // Everything here is in the main currency: amounts in others can't be added to it.
  const transactions = inMainCurrency(data.transactions, main)
  const txs = inRange(transactions, cycle)
  const total = (filter: (t: Transaction) => boolean) => sumAmounts(txs.filter(filter).map((t) => t.amount))

  const { profile } = data
  const pay = profile.salary
  const share = monthShare(cycle)
  const isCurrent = isWithin(today, cycle)
  const irregular = pay.frequency === 'irregular'
  const onEstimate = irregular && pay.amount > 0
  const incomes = live(data.incomes)
  const salaryReceived = sumAmounts(live(transactions).filter((t) => isSalaryEntry(t) && isWithin(salaryCountedOn(t, pay), cycle)).map((t) => t.amount))
  const incomeOnTop = total((t) => t.type === 'income' && !isSalaryEntry(t) && t.source !== 'cash-count')
  const received = roundMoney(salaryReceived + incomeOnTop)

  // Weekly or biweekly pay from before those had a date stays as it was, until the date is set.
  const salary = irregular
    ? Math.max(pay.amount, received)
    : !hasPaydays(pay)
      ? monthlySalary(pay)
      : salaryReceived === 0 && isWithin(payPlanStart(profile), cycle)
        ? pay.amount
        : salaryReceived
  const otherIncome = irregular ? 0 : incomeOnTop

  // What's on its way, in the cycle being looked at. An estimate has already counted it.
  const onItsWay = isCurrent && !onEstimate
  const waitingFor = onItsWay ? sumAmounts(expectedPays(data, today).filter((p) => isMainCurrency(p, main) && isWithin(p.payDate, cycle)).map((p) => p.amount)) : 0
  const stillExpected = onItsWay ? sumAmounts(scheduledPays(data, { start: today, end: cycle.end }, today).filter((p) => isMainCurrency(p, main)).map((p) => p.amount)) : 0

  // What a fund paid was put aside in earlier cycles: only the rest of a payment is this cycle's. A refund gives back.
  const walletTotal = (filter: (t: Transaction) => boolean) => sumAmounts(txs.filter(filter).map(budgetPart))
  const fromFunds = sumAmounts(txs.map(fundPart))
  const billsPaid = walletTotal((t) => isSpending(t) && !!t.billId)
  // A bill still to pay takes what its fund holds first, so a yearly bill doesn't land on one cycle.
  const fundLeft = new Map<ID, number>()
  const billsUnpaid = sumAmounts(
    cycleBills(data.bills, cycle, transactions, today)
      .due.filter((d) => d.occurrence.status !== 'paid')
      .map((d) => {
        const fund = fundForBill(data.goals, d.bill.id)
        if (!fund) return d.bill.amount
        const left = fundLeft.get(fund.id) ?? Math.max(0, goalSaved(fund, transactions))
        const covered = Math.min(left, d.bill.amount)
        fundLeft.set(fund.id, roundMoney(left - covered))
        return roundMoney(d.bill.amount - covered)
      }),
  )
  // One week's pay can't carry the whole month's rent, and the other weeks shouldn't look free: each carries its share.
  // A bill with a fund has its share in the fund's monthly amount instead.
  const billsReserved = share < 1 ? shareOf(plannedMonthlyBills(data.bills, data.goals), share) : roundMoney(billsPaid + billsUnpaid)

  // Money taken out of goals first undoes what this cycle's pay sent to them: put aside 40,000 and
  // take it back, and the pay has it again. Only the rest is older savings, and spending that isn't spending the salary.
  const takenOut = total((t) => t.type === 'goal-withdrawal')
  const sentToGoals = sumAmounts(live(data.goals).map((goal) => goalReserved(goal, transactions, cycle, share, data.bills)))
  const takenBack = Math.min(sentToGoals, takenOut)
  const savingsReserved = roundMoney(sentToGoals - takenBack)
  const fromSavings = roundMoney(takenOut - takenBack)

  const categories = categoryBudgets(data.categories, transactions, cycle, data.settings.alerts.warnAtPercent)
  const debtIn = total((t) => t.type === 'debt-in')
  const debtsUnpaid = sumAmounts(live(data.debts).filter((debt) => isMainCurrency(debt, main)).map((debt) => debtPlan(debt, data.transactions, cycle).unpaid))
  const debtOut = roundMoney(total((t) => t.type === 'debt-out') + debtsUnpaid)
  const { out: exchangedOut, back: exchangedBack } = exchangedMoney(data.transactions, cycle, main)
  const flexibleBudget = roundMoney(salary + otherIncome + debtIn + exchangedBack - billsReserved - savingsReserved - debtOut - exchangedOut)
  const flexibleSpent = Math.max(0, roundMoney(walletTotal(isFlexible) - fromSavings))
  const leftToSpend = roundMoney(flexibleBudget - flexibleSpent)
  const usedRatio = flexibleBudget > 0 ? flexibleSpent / flexibleBudget : 0
  const paceDelta = usedRatio - progress.elapsedRatio

  return {
    cycle,
    progress,
    income: total((t) => t.type === 'income'),
    spent: sumAmounts(txs.map(spentAmount)),
    // Spending from a fund is using savings, as taking money out is.
    saved: roundMoney(total((t) => t.type === 'goal-deposit') - takenOut - fromFunds),
    salary,
    otherIncome,
    hasPay: irregular || pay.amount > 0 || incomes.length > 0 || received > 0,
    irregular,
    onEstimate,
    received,
    waitingFor,
    stillExpected,
    share,
    billsReserved,
    savingsReserved,
    fromSavings,
    fromFunds,
    debtIn,
    debtOut,
    exchangedOut,
    exchangedBack,
    flexibleBudget,
    flexibleSpent,
    leftToSpend,
    usedRatio,
    // Rounded down to whole money: "safe" should never add up to more than what's left.
    safePerDay: progress.daysLeft > 0 ? Math.floor(Math.max(0, leftToSpend) / progress.daysLeft) : 0,
    paceDelta,
    spendingTooFast: flexibleBudget > 0 && paceDelta * 100 > data.settings.alerts.paceTolerancePercent,
    categories,
  }
}
