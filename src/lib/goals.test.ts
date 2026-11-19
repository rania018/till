import { describe, expect, it } from 'vitest'
import type { Goal, Transaction } from '../types'
import { goalForecast, goalSavedIn, goalStatus, goalViews, progressPercent, suggestedContribution } from './goals'

const TODAY = '2026-11-15'
const CYCLE = { start: '2026-10-25', end: '2026-11-24' }
/** Paid on the 25th: the next paydays after 15 Nov are 25 Nov, 25 Dec, 25 Jan… */
const PAY = { frequency: 'monthly' as const, payday: 25 }

function goal(fields: Partial<Goal> = {}): Goal {
  return { id: 'g1', createdAt: '2026-10-25T08:00:00.000Z', updatedAt: '', name: 'Laptop', icon: 'laptop', target: 120_000, monthlyContribution: 5_000, archived: false, ...fields }
}

function tx(fields: Partial<Transaction>): Transaction {
  return { id: `t-${Math.random()}`, createdAt: '', updatedAt: '', type: 'goal-deposit', amount: 0, date: TODAY, accountId: 'acc-bank', goalId: 'g1', ...fields }
}

describe('goalForecast', () => {
  it('needs the remaining amount spread over the paydays before the deadline', () => {
    // 25 Nov 2026 … 25 Oct 2027 are the 12 paydays on or before 15 Nov 2027.
    const forecast = goalForecast(goal({ deadline: '2027-11-15' }), 24_000, TODAY, PAY)
    expect(forecast).toMatchObject({ remaining: 96_000, neededPerMonth: 8_000, onTrack: false, monthsToTarget: 20 })
  })

  it('lands the last contribution on a payday: 20 paydays after 15 Nov 2026 is 25 Jun 2028', () => {
    expect(goalForecast(goal(), 24_000, TODAY, PAY).projectedDate).toBe('2028-06-25')
    // Paid on the 15th from 2 Nov: 51,510.44 left at 10,302.08 a month is five paydays, the last one 15 Mar 2027.
    const debt = goal({ target: 123_625, monthlyContribution: 10_302.08, deadline: '2027-04-15' })
    const forecast = goalForecast(debt, 72_114.56, '2026-11-02', { frequency: 'monthly', payday: 15 })
    expect(forecast).toMatchObject({ remaining: 51_510.44, monthsToTarget: 5, projectedDate: '2027-03-15', onTrack: true })
  })

  it('does not charge a whole extra month for a few centimes', () => {
    // 51,510.44 / 10,302.08 = 5.000004: five contributions, not six.
    expect(goalForecast(goal({ target: 51_510.44, monthlyContribution: 10_302.08 }), 0, TODAY, PAY).monthsToTarget).toBe(5)
    // But a real shortfall still counts.
    expect(goalForecast(goal({ target: 51_600, monthlyContribution: 10_302.08 }), 0, TODAY, PAY).monthsToTarget).toBe(6)
  })

  it('is on track when the planned amount is the suggested one', () => {
    for (const deadline of ['2027-03-01', '2027-11-15', '2028-06-30', '2026-12-20']) {
      const draft = goal({ deadline, target: 100_000, monthlyContribution: 0 })
      const needed = goalForecast(draft, 13_000, TODAY, PAY).neededPerMonth!
      const planned = goalForecast({ ...draft, monthlyContribution: suggestedContribution(needed) }, 13_000, TODAY, PAY)
      expect(planned.onTrack, deadline).toBe(true)
    }
  })

  it('asks for everything at once when no payday is left before the deadline', () => {
    const forecast = goalForecast(goal({ deadline: '2026-11-20' }), 100_000, TODAY, PAY)
    expect(forecast).toMatchObject({ neededPerMonth: 20_000, onTrack: false })
  })

  it('rounds the suggestion up to the next 100', () => {
    expect(suggestedContribution(7_333.33)).toBe(7_400)
    expect(suggestedContribution(8_000)).toBe(8_000)
  })

  it('has no projection without a monthly amount', () => {
    expect(goalForecast(goal({ monthlyContribution: 0 }), 10_000, TODAY, PAY)).toMatchObject({ monthsToTarget: null, projectedDate: null, onTrack: null })
  })

  it('is reached today once the target is met', () => {
    expect(goalForecast(goal(), 120_000, TODAY, PAY)).toMatchObject({ remaining: 0, monthsToTarget: 0, projectedDate: TODAY })
  })
})

describe('goalStatus', () => {
  it('tells reached, on track, behind and past the deadline apart', () => {
    const status = (fields: Partial<Goal>, saved: number) => {
      const g = goal(fields)
      return goalStatus(g, goalForecast(g, saved, TODAY, PAY), TODAY)
    }
    expect(status({}, 120_000)).toBe('reached')
    expect(status({ deadline: '2028-12-31' }, 32_000)).toBe('on-track')
    expect(status({ deadline: '2027-06-30' }, 32_000)).toBe('behind')
    expect(status({ deadline: '2026-11-01' }, 32_000)).toBe('overdue')
    expect(status({}, 32_000)).toBeNull()
  })
})

describe('goalSavedIn and goalViews', () => {
  const transactions = [
    tx({ amount: 5_000, date: '2026-10-25' }),
    tx({ amount: 2_000, date: '2026-11-10', type: 'goal-withdrawal' }),
    tx({ amount: 4_000, date: '2026-10-20' }),
    tx({ amount: 9_000, date: '2026-11-01', deleted: true }),
    tx({ amount: 1_000, date: '2026-11-01', goalId: 'other' }),
  ]

  it('counts deposits minus withdrawals in the cycle only', () => {
    expect(goalSavedIn('g1', transactions, CYCLE)).toBe(3_000)
  })

  it('lists active goals oldest first with their progress', () => {
    const goals = [
      goal({ id: 'g2', name: 'Trip', createdAt: '2026-10-26T08:00:00.000Z' }),
      goal({ startingAmount: 27_000 }),
      goal({ id: 'g3', archived: true }),
      goal({ id: 'g4', deleted: true }),
    ]
    const views = goalViews(goals, transactions, CYCLE, TODAY, PAY)
    expect(views.map((v) => v.goal.id)).toEqual(['g1', 'g2'])
    expect(views[0]).toMatchObject({ savedThisCycle: 3_000, forecast: { saved: 34_000 } })
  })
})

describe('progressPercent', () => {
  it('rounds, but keeps 100% for a reached target', () => {
    expect(progressPercent({ progress: 32_000 / 120_000, remaining: 88_000 })).toBe(27)
    expect(progressPercent({ progress: 0.998, remaining: 200 })).toBe(99)
    expect(progressPercent({ progress: 1, remaining: 0 })).toBe(100)
  })
})

describe('on track near the end of a month', () => {
  it('agrees with the amount needed', () => {
    // From 31 Oct, the paydays up to 30 Jun are 25 Nov … 25 Jun: eight. 44,000 needs 5,500 each, so 5,400 is one short.
    const trip = goal({ target: 80_000, monthlyContribution: 5_400, deadline: '2027-06-30' })
    const forecast = goalForecast(trip, 36_000, '2026-10-31', PAY)
    expect(forecast.neededPerMonth).toBe(5_500)
    expect(forecast).toMatchObject({ monthsToTarget: 9, onTrack: false })
    expect(goalForecast({ ...trip, monthlyContribution: 5_500 }, 36_000, '2026-10-31', PAY).onTrack).toBe(true)
  })
})
