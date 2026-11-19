import type { AppData, ISODate } from '../types'
import { cycleBills } from './bills'
import { planMonth } from './dates'
import { debtViews } from './debts'
import { goalViews, type GoalView } from './goals'
import { expectedPays } from './income'

/** What needs you, counted for the sidebar: pay waiting for an answer on Home, and on Plan what's late or behind. */
export interface Attention {
  /** Paydays with no answer yet: Home asks "Has this arrived?". */
  pay: number
  /** Bills past their due date this month and not paid. */
  lateBills: number
  /** Goals that won't make their deadline at their pace, or whose deadline has gone by. */
  goalsBehind: number
  /** Debts past their due date or an instalment's. */
  lateDebts: number
}

type AttentionData = Pick<AppData, 'profile' | 'transactions' | 'bills' | 'goals' | 'debts' | 'incomes'>

export function attention(data: AttentionData, today: ISODate): Attention {
  const month = planMonth(today, data.profile.salary)
  return {
    pay: expectedPays(data, today).length,
    lateBills: cycleBills(data.bills, month, data.transactions, today).due.filter((d) => d.occurrence.status === 'overdue').length,
    goalsBehind: goalViews(data.goals, data.transactions, month, today, data.profile.salary, data.bills).filter(isGoalBehind).length,
    lateDebts: debtViews(data.debts, data.transactions, month, today).filter((v) => v.status === 'overdue').length,
  }
}

/** Behind its pace, or past its deadline: the badge on Plan's Goals tab too. A fund past its date is a bill still to pay, counted with bills. */
export function isGoalBehind(view: Pick<GoalView, 'status' | 'goal'>): boolean {
  return view.status === 'behind' || (view.status === 'overdue' && !view.goal.fund)
}

/** Everything Plan holds that needs a look. */
export function planAttention(a: Attention): number {
  return a.lateBills + a.goalsBehind + a.lateDebts
}
