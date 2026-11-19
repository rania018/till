import type { Bill, Goal, ID, ISODate, PaySchedule, Transaction } from '../types'
import { isWithin, nthPayday, paydaysUntil } from './dates'
import { fundDueDate, fundPart, fundSeason } from './funds'
import { live } from './id'
import { roundMoney } from './money'

export const DAYS_PER_MONTH = 365.25 / 12

/** What was already saved at setup, plus deposits, minus withdrawals and what a fund paid for, up to `upTo` if given. */
export function goalSaved(goal: Pick<Goal, 'id' | 'startingAmount'>, transactions: Transaction[], upTo?: ISODate): number {
  let saved = goal.startingAmount ?? 0
  for (const t of live(transactions)) {
    if (t.goalId !== goal.id || (upTo && t.date > upTo)) continue
    if (t.type === 'goal-deposit') saved += t.amount
    if (t.type === 'goal-withdrawal') saved -= t.amount
    saved -= fundPart(t)
  }
  return roundMoney(saved)
}

/** Deposits minus withdrawals in `range`, e.g. what was put aside this pay cycle. */
export function goalSavedIn(goalId: ID, transactions: Transaction[], range: { start: ISODate; end: ISODate }): number {
  let saved = 0
  for (const t of live(transactions)) {
    if (t.goalId !== goalId || !isWithin(t.date, range)) continue
    if (t.type === 'goal-deposit') saved += t.amount
    if (t.type === 'goal-withdrawal') saved -= t.amount
  }
  return roundMoney(saved)
}

export interface GoalForecast {
  saved: number
  remaining: number
  /** 0–1, capped at 1. */
  progress: number
  /** Paydays (one contribution each) until the target at the planned contribution; `null` with no contribution. */
  monthsToTarget: number | null
  /** The payday the last contribution lands on; today when the target is already reached. */
  projectedDate: ISODate | null
  /** Contribution per payday needed to hit the deadline; `null` without a deadline. */
  neededPerMonth: number | null
  /** Whether the planned contribution reaches the target by the deadline; `null` without a deadline. */
  onTrack: boolean | null
}

/**
 * When the goal fills up at its planned contribution. Money goes in once per
 * payday, starting with the next one, so `n` contributions reach the target on
 * the `n`-th payday from now. The amount needed for a deadline is spread over
 * the paydays before it, so putting aside `neededPerMonth` always lands in time.
 */
export function goalForecast(goal: Goal, saved: number, today: ISODate, salary: PaySchedule, slotsNow = 0): GoalForecast {
  const remaining = Math.max(0, roundMoney(goal.target - saved))
  const progress = goal.target > 0 ? Math.min(1, saved / goal.target) : 0
  // Rounded to a hundredth of a contribution first: being a few centimes short
  // (51,510.44 left at 10,302.08 a month) shouldn't cost a whole extra month.
  const monthsToTarget =
    remaining === 0 ? 0 : goal.monthlyContribution > 0 ? Math.max(1, Math.ceil(roundMoney(remaining / goal.monthlyContribution))) : null
  const projectedDate = monthsToTarget === null ? null : monthsToTarget === 0 ? today : nthPayday(today, salary, monthsToTarget)

  let neededPerMonth: number | null = null
  let onTrack: boolean | null = null
  if (goal.deadline) {
    // `slotsNow`: this month can still take its share, as a fund's can until it's been put aside.
    const paydaysLeft = paydaysUntil(today, goal.deadline, salary) + slotsNow
    neededPerMonth = roundMoney(remaining / Math.max(1, paydaysLeft))
    // Compare payday counts, the same ones `neededPerMonth` uses, so the two never disagree.
    onTrack = monthsToTarget !== null && (remaining === 0 || monthsToTarget <= paydaysLeft)
  }
  return { saved, remaining, progress, monthsToTarget, projectedDate, neededPerMonth, onTrack }
}

/** Whole percent saved, never shown as 100% before the target is actually reached. */
export function progressPercent(forecast: Pick<GoalForecast, 'progress' | 'remaining'>): number {
  const percent = Math.round(forecast.progress * 100)
  return forecast.remaining > 0 ? Math.min(99, percent) : 100
}

/** A friendlier amount to suggest: rounded up to the next 100, so it still reaches the deadline. */
export function suggestedContribution(neededPerMonth: number): number {
  return Math.ceil(neededPerMonth / 100) * 100
}

export type GoalStatus = 'reached' | 'on-track' | 'behind' | 'overdue'

/** `null` for a goal without a deadline that isn't reached yet: there's no date to be on track for. */
export function goalStatus(goal: Pick<Goal, 'deadline'>, forecast: Pick<GoalForecast, 'remaining' | 'onTrack'>, today: ISODate): GoalStatus | null {
  if (forecast.remaining === 0) return 'reached'
  if (!goal.deadline) return null
  if (goal.deadline < today) return 'overdue'
  return forecast.onTrack ? 'on-track' : 'behind'
}

export interface GoalView {
  goal: Goal
  forecast: GoalForecast
  status: GoalStatus | null
  /** Put aside minus taken out during the pay cycle. */
  savedThisCycle: number
  /**
   * The date the money is needed by: a goal's deadline, or when a fund is next needed (the next
   * Ramadan, the bill's next due date). Forecasts and status count on this one.
   */
  due: ISODate | null
  /** A fund's date when today is in its season, so it can be spent from. */
  season: ISODate | null
  /** A bill's fund whose bill is due this month without enough in it: the rest comes from this month's pay. */
  dueNow: boolean
}

/**
 * One goal or fund with its progress. A fund is forecast to its next date, so it starts again once
 * that's been, and this month counts as one to put aside in until something is. A bill due this
 * month takes what its fund is missing from this month's pay, so that fund isn't behind and needs nothing more.
 */
export function goalView(goal: Goal, transactions: Transaction[], cycle: { start: ISODate; end: ISODate }, today: ISODate, salary: PaySchedule, bills: Bill[] = []): GoalView {
  const due = fundDueDate(goal, today, { bills, transactions, salary })
  const timed = { ...goal, deadline: due ?? undefined }
  const savedThisCycle = goalSavedIn(goal.id, transactions, cycle)
  const forecast = goalForecast(timed, goalSaved(goal, transactions), today, salary, goal.fund && savedThisCycle <= 0 ? 1 : 0)
  const view = { goal, forecast, status: goalStatus(timed, forecast, today), savedThisCycle, due, season: fundSeason(goal, today), dueNow: false }
  if (goal.fund?.billId && due && due <= cycle.end && forecast.remaining > 0) return { ...view, status: null, forecast: { ...forecast, neededPerMonth: null, onTrack: null }, dueNow: true }
  return view
}

/** Every goal and fund that isn't deleted or archived, with its progress, oldest first. */
export function goalViews(
  goals: Goal[],
  transactions: Transaction[],
  cycle: { start: ISODate; end: ISODate },
  today: ISODate,
  salary: PaySchedule,
  bills: Bill[] = [],
): GoalView[] {
  return live(goals)
    .filter((g) => !g.archived)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((goal) => goalView(goal, transactions, cycle, today, salary, bills))
}

/** How many days a purchase pushes a goal back at its planned contribution. */
export function purchaseDelayDays(price: number, monthlyContribution: number): number | null {
  if (monthlyContribution <= 0) return null
  return Math.round((price / monthlyContribution) * DAYS_PER_MONTH)
}
