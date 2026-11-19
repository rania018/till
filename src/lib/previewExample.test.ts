import { describe, expect, it } from 'vitest'
import { PREVIEW_TODAY, previewExample } from '../test/previewExample'
import { billOccurrences } from './bills'
import { budgetSummary, plannedFreeToSpend } from './budget'
import { getPayCycle } from './dates'
import { goalForecast, goalSaved, purchaseDelayDays } from './goals'
import { formatMoney } from './money'
import { formatWorkTime, hourlyRate, workTimeFor } from './workHours'
import { walletBalance } from './wallets'

// Every number here appears in the approved visual preview.

describe('the preview example', () => {
  const data = previewExample()
  const summary = budgetSummary(data, PREVIEW_TODAY)
  const byId = new Map(summary.categories.map((c) => [c.categoryId, c]))

  it('is in the 25 Oct – 24 Nov pay cycle, day 22 of 31 with 10 days to payday', () => {
    expect(summary.cycle).toEqual({ start: '2026-10-25', end: '2026-11-24', days: 31 })
    expect(summary.progress.dayNumber).toBe(22)
    expect(summary.progress.daysLeft).toBe(10)
    expect(Math.round(summary.progress.elapsedRatio * 100)).toBe(71)
  })

  it('has 9,700 DA left of a 35,800 DA flexible budget, 970 DA a day', () => {
    // 60,000 salary − 14,200 bills (12,200 paid, Internet 2,000 to come) − 10,000 for the goals.
    expect(summary).toMatchObject({ salary: 60_000, otherIncome: 0, billsReserved: 14_200, savingsReserved: 10_000, fromSavings: 0 })
    expect(summary.flexibleBudget).toBe(35_800)
    expect(summary.flexibleSpent).toBe(26_100)
    expect(summary.leftToSpend).toBe(9_700)
    expect(Math.round(summary.usedRatio * 100)).toBe(73)
    expect(summary.safePerDay).toBe(970)
    expect(summary.spendingTooFast).toBe(false)
  })

  it('matches the planned free-to-spend amount from onboarding', () => {
    expect(plannedFreeToSpend(data.profile, data.bills, data.goals)).toBe(35_800)
  })

  it('shows spent 38,300, income 60,000 and saved 8,000 this cycle', () => {
    expect(summary.spent).toBe(38_300)
    expect(summary.income).toBe(60_000)
    expect(summary.saved).toBe(8_000)
  })

  it('flags Eating out near its limit and Shopping 400 DA over', () => {
    expect(byId.get('cat-eating-out')).toMatchObject({ spent: 4_600, remaining: 400, level: 'warning' })
    expect(byId.get('cat-shopping')).toMatchObject({ spent: 5_400, remaining: -400, level: 'over' })
    expect(byId.get('cat-groceries')).toMatchObject({ spent: 12_000, remaining: 4_000, level: 'ok' })
    expect(Math.round(byId.get('cat-shopping')!.ratio * 100)).toBe(108)
  })

  it('has 4,250 DA cash on hand and 9,450 DA on the bank card', () => {
    const [cash, bank] = data.accounts
    expect(walletBalance(cash, data.transactions, PREVIEW_TODAY)).toBe(4_250)
    expect(walletBalance(bank, data.transactions, PREVIEW_TODAY)).toBe(9_450)
  })

  it('shows Internet due soon and the other bills paid', () => {
    const cycle = getPayCycle(PREVIEW_TODAY, data.profile.salary)
    const status = (id: string) => billOccurrences(data.bills.find((b) => b.id === id)!, cycle, data.transactions, PREVIEW_TODAY)
    expect(status('bill-internet')).toEqual([{ billId: 'bill-internet', dueDate: '2026-11-17', status: 'due-soon' }])
    expect(status('bill-rent')[0].status).toBe('paid')
    expect(status('bill-transport')[0].status).toBe('paid')
  })

  it('values an hour of work at about 346 DA', () => {
    const rate = hourlyRate(data.profile)!
    expect(Math.round(rate)).toBe(346)
    const time = (price: number) => formatWorkTime(workTimeFor(price, rate, data.profile.work.hoursPerDay))
    expect(time(1_450)).toBe('4 h 11 min')
    expect(time(4_600)).toBe('13 h 17 min')
    expect(time(8_900)).toBe('25 h 43 min')
    expect(workTimeFor(8_900, rate, 8).workDays).toBeCloseTo(3.2, 1)
  })

  it('has the Laptop goal at 32,000 of 120,000, and earbuds push it back 54 days', () => {
    const laptop = data.goals[0]
    const saved = goalSaved(laptop, data.transactions)
    expect(saved).toBe(32_000)
    expect(goalForecast(laptop, saved, PREVIEW_TODAY, data.profile.salary)).toMatchObject({ remaining: 88_000, monthsToTarget: 18 })
    expect(purchaseDelayDays(8_900, laptop.monthlyContribution)).toBe(54)
  })

  it('formats amounts the way the screens show them', () => {
    expect(formatMoney(summary.leftToSpend)).toBe('9,700 DA')
    expect(formatMoney(-250)).toBe('−250 DA')
  })
})
