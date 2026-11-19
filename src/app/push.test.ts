import { describe, expect, it } from 'vitest'
import { formatMoney } from '../lib/money'
import type { Bill, Profile, Settings, Transaction } from '../types'
import { pushDeviceData } from './push'

const stamp = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }

const profile: Profile = {
  currency: 'DZD',
  language: 'en',
  salary: { amount: 60_000, frequency: 'monthly', payday: 25, accountId: 'acc-bank' },
  work: { hoursPerDay: 8, daysPerWeek: 5 },
  hourlyRateBasis: 'net-salary',
  startDate: '2026-10-01',
  onboardingCompleted: true,
}

const settings: Settings = {
  theme: 'system',
  weeklyReminder: { enabled: true, weekday: 6, time: '20:00' },
  cashCheck: { enabled: true },
  alerts: { enabled: true, warnAtPercent: 80, paceTolerancePercent: 15, bigPurchasePercent: 10 },
  showWorkHours: true,
  coolingOffHours: 48,
}

function bill(id: string, name: string, amount: number, dueDay: number): Bill {
  return { id, name, amount, categoryId: 'cat-bills', accountId: 'acc-bank', frequency: 'monthly', dueDay, startDate: '2026-01-01', active: true, ...stamp }
}

function expense(id: string, date: string, extra: Partial<Transaction> = {}): Transaction {
  return { id, type: 'expense', amount: 500, date, accountId: 'acc-cash', categoryId: 'cat-groceries', ...stamp, ...extra }
}

describe('pushDeviceData', () => {
  // Saturday 31 Oct 2026; pay cycle 25 Oct – 24 Nov.
  const today = '2026-10-31'
  const bills = [bill('b-rent', 'Rent', 20_000, 1), bill('b-net', 'Internet', 2_000, 28), bill('b-gym', 'Gym', 3_000, 20)]
  const transactions = [
    expense('t1', '2026-10-30'),
    expense('t2', '2026-10-30'),
    expense('t3', '2026-10-10'), // more than two weeks ago
    expense('t4', '2026-10-29', { deleted: true }),
    expense('t5', '2026-10-27', { source: 'cash-count' }), // not logged by hand
    expense('t6', '2026-10-28', { billId: 'b-net', categoryId: 'cat-bills', amount: 2_000 }), // pays Internet
    { ...expense('t7', '2026-10-25'), type: 'income' as const, categoryId: 'cat-salary', source: 'salary' as const },
  ]

  it('shares the reminder settings and profile facts', () => {
    const data = pushDeviceData({ profile, settings, bills, transactions }, today)
    expect(data.weeklyReminder).toEqual(settings.weeklyReminder)
    expect(data.onboardingCompleted).toBe(true)
    expect(data.startDate).toBe('2026-10-01')
  })

  it('shares distinct dates of recent hand-logged expenses', () => {
    const data = pushDeviceData({ profile, settings, bills, transactions }, today)
    // t6 pays a bill, which is still an expense logged by hand.
    expect(data.expenseDates).toEqual(['2026-10-28', '2026-10-30'])
  })

  it('shares unpaid bills due within two weeks, with the amount already formatted', () => {
    const data = pushDeviceData({ profile, settings, bills, transactions }, today)
    expect(data.bills).toEqual([{ id: 'b-rent', name: 'Rent', dueDate: '2026-11-01', amountText: formatMoney(20_000, 'DZD') }])
  })

  it('includes late bills and leaves out inactive ones', () => {
    const late = [{ ...bill('b-water', 'Water', 1_500, 26) }, { ...bill('b-old', 'Old', 100, 27), active: false }]
    const data = pushDeviceData({ profile, settings, bills: late, transactions: [] }, today)
    expect(data.bills.map((b) => b.id)).toEqual(['b-water'])
    expect(data.bills[0].dueDate).toBe('2026-10-26')
  })

  it('looks into the next pay cycle when payday is near', () => {
    const data = pushDeviceData({ profile, settings, bills: [bill('b-rent', 'Rent', 20_000, 1)], transactions: [] }, '2026-11-23')
    // 1 Nov is unpaid and late; 1 Dec is in the next cycle (25 Nov – 24 Dec) and within 14 days.
    expect(data.bills.map((b) => b.dueDate)).toEqual(['2026-11-01', '2026-12-01'])
  })
})
