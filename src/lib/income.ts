import { addDays } from 'date-fns'
import { CATEGORY_IDS } from '../store/defaults'
import type { AppData, ID, IncomeSource, ISODate, PaySchedule, Profile, Salary, Transaction } from '../types'
import { fromISODate, getPayCycle, hasPaydays, isShortPay, previousCycle, toISODate } from './dates'
import { isMainCurrency } from './currency'
import { live } from './id'
import { sumAmounts } from './money'
import { monthlySalary } from './workHours'

/**
 * Pay isn't logged by itself. Each payday is expected until it gets an answer: it arrived,
 * with some amount, or it isn't coming. An answer is one transaction whose id comes from the
 * payday, so two devices answering create one record: live when it arrived, deleted when it
 * didn't. No record means there's no answer yet, and that's the state "expected" is.
 */

export interface ExpectedPay {
  /** The transaction that will answer it. */
  id: ID
  /** Left out for the salary. */
  sourceId?: ID
  /** A source's name. The salary's comes from the language. */
  name?: string
  payDate: ISODate
  amount: number
  currency?: string
  accountId: ID
  categoryId: ID
}

type PayData = Pick<AppData, 'profile' | 'transactions' | 'incomes'>

const SALARY_ID = /^salary-(\d{4}-\d{2}-\d{2})$/

/**
 * Pay can land a little before its day. Up to this many days early it still belongs to
 * that payday, and doesn't turn into extra money for the cycle that's ending.
 */
function earlyDays(schedule: PaySchedule): number {
  return isShortPay(schedule) ? 1 : 3
}

/** The payday an amount received on `date` belongs to. */
function paydayFor(date: ISODate, schedule: PaySchedule): ISODate {
  return getPayCycle(toISODate(addDays(fromISODate(date), earlyDays(schedule))), schedule).start
}

/** Income that is the salary, whether it was answered on Home or logged by hand. */
export function isSalaryEntry(t: Transaction): boolean {
  return t.type === 'income' && !t.incomeId && (t.source === 'salary' || t.categoryId === CATEGORY_IDS.salary)
}

/**
 * The day a salary counts in the budget: the day it arrived, or its payday if it came a
 * little early. Money paid late counts when it arrives, because that's when it can be spent.
 */
export function salaryCountedOn(t: Pick<Transaction, 'date'>, schedule: PaySchedule): ISODate {
  if (!hasPaydays(schedule)) return t.date
  const payday = paydayFor(t.date, schedule)
  return payday > t.date ? payday : t.date
}

/** Every payday in `range`, oldest first. Only for schedules with known paydays. */
function paydaysIn(schedule: PaySchedule, range: { start: ISODate; end: ISODate }): ISODate[] {
  const days: ISODate[] = []
  for (let cycle = getPayCycle(range.end, schedule); cycle.start >= range.start; cycle = previousCycle(cycle, schedule)) {
    days.unshift(cycle.start)
  }
  return days
}

function salaryPay(data: PayData, payDate: ISODate): ExpectedPay {
  const { amount, accountId } = data.profile.salary
  return { id: `salary-${payDate}`, payDate, amount, accountId, categoryId: CATEGORY_IDS.salary }
}

function sourcePay(source: IncomeSource, payDate: ISODate): ExpectedPay {
  const { id, name, amount, currency, accountId, categoryId } = source
  return { id: `income-${id}-${payDate}`, sourceId: id, name, payDate, amount, currency, accountId, categoryId }
}

/** The paydays the salary has an answer for. A deleted salary is an answer ("not received"), unless it was taken back. */
function answeredPaydays(data: PayData): Set<ISODate> {
  const { salary } = data.profile
  const answered = new Set<ISODate>()
  for (const t of data.transactions) {
    if (t.reasked) continue
    const fromId = SALARY_ID.exec(t.id)?.[1]
    if (fromId) answered.add(paydayFor(fromId, salary))
    else if (isSalaryEntry(t) && (!t.deleted || t.source === 'salary')) answered.add(paydayFor(t.date, salary))
  }
  return answered
}

/**
 * The day the current pay plan began: setup, or the last change to the schedule. The salary
 * before it is already in the wallets, so it isn't asked about and is taken from settings.
 */
export function payPlanStart(profile: Pick<Profile, 'startDate' | 'salary'>): ISODate {
  const { since } = profile.salary
  return since && since > profile.startDate ? since : profile.startDate
}

/** Whether a change to the salary starts a new plan: other paydays, or pay where there was none. */
export function startsNewPayPlan(before: Salary, after: Salary): boolean {
  return before.frequency !== after.frequency || before.payday !== after.payday || before.anchor !== after.anchor || (before.amount <= 0 && after.amount > 0)
}

function salaryIsExpected({ profile }: PayData): boolean {
  return profile.onboardingCompleted && profile.salary.amount > 0 && hasPaydays(profile.salary)
}

function firstDayAfter(date: ISODate): ISODate {
  return toISODate(addDays(fromISODate(date), 1))
}

function byPayDate(a: ExpectedPay, b: ExpectedPay): number {
  return a.payDate.localeCompare(b.payDate)
}

/**
 * Pay due by `today` with no answer yet, oldest first. The salary is expected from the first
 * payday after setup or a change of schedule.
 */
export function expectedPays(data: PayData, today: ISODate): ExpectedPay[] {
  const pays: ExpectedPay[] = []
  if (salaryIsExpected(data)) {
    const answered = answeredPaydays(data)
    for (const payDate of paydaysIn(data.profile.salary, { start: firstDayAfter(payPlanStart(data.profile)), end: today })) {
      if (!answered.has(payDate)) pays.push(salaryPay(data, payDate))
    }
  }
  const ids = new Map(data.transactions.map((t) => [t.id, t]))
  for (const source of live(data.incomes)) {
    if (!hasPaydays(source)) continue
    for (const payDate of paydaysIn(source, { start: source.startDate, end: today })) {
      const pay = sourcePay(source, payDate)
      const answer = ids.get(pay.id)
      if (!answer || answer.reasked) pays.push(pay)
    }
  }
  return pays.sort(byPayDate)
}

/** Paydays after `today` and inside `range`, oldest first. They need no answer yet. */
export function scheduledPays(data: PayData, range: { start: ISODate; end: ISODate }, today: ISODate): ExpectedPay[] {
  const after = firstDayAfter(today)
  const span = { start: range.start > after ? range.start : after, end: range.end }
  if (span.start > span.end) return []
  const pays: ExpectedPay[] = []
  // The salary's own next payday starts the next cycle, so this only finds some with a span longer than a cycle.
  if (salaryIsExpected(data)) pays.push(...paydaysIn(data.profile.salary, span).map((payDate) => salaryPay(data, payDate)))
  for (const source of live(data.incomes)) {
    if (!hasPaydays(source)) continue
    const start = source.startDate > span.start ? source.startDate : span.start
    if (start <= span.end) pays.push(...paydaysIn(source, { start, end: span.end }).map((payDate) => sourcePay(source, payDate)))
  }
  return pays.sort(byPayDate)
}

/** What income sources in the main currency bring in a month. Others can't be added to it. */
export function monthlyIncomes(incomes: IncomeSource[], main?: string): number {
  return sumAmounts(live(incomes).filter((s) => isMainCurrency(s, main)).map(monthlySalary))
}
