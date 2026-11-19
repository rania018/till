import { describe, expect, it } from 'vitest'
import { createInitialData } from '../store/defaults'
import type { AppData, Bill, Debt, Goal, Transaction } from '../types'
import { calendarMonth, monthGrid, monthOf } from './calendar'

const TODAY = '2026-11-15'

function tx(fields: Partial<Transaction>, i: number): Transaction {
  return { id: `t${i}`, createdAt: `2026-11-01T10:0${i}:00.000Z`, updatedAt: '', type: 'expense', amount: 0, date: TODAY, accountId: 'acc-cash', categoryId: 'cat-groceries', ...fields }
}

/** 60,000 DA on the 25th, set up in October. */
function data(fields: { transactions?: Partial<Transaction>[]; bills?: Partial<Bill>[]; goals?: Partial<Goal>[]; debts?: Partial<Debt>[] } = {}): AppData {
  const base = createInitialData(new Date(2026, 9, 1))
  base.profile.salary = { ...base.profile.salary, amount: 60_000, payday: 25 }
  base.profile.startDate = '2026-10-01'
  base.profile.onboardingCompleted = true
  base.transactions = (fields.transactions ?? []).map(tx)
  base.bills = (fields.bills ?? []).map((b, i) => ({ id: `b${i}`, createdAt: '', updatedAt: '', name: `Bill ${i}`, amount: 1_000, categoryId: 'cat-bills', accountId: 'acc-bank', frequency: 'monthly', dueDay: 10, startDate: '2026-01-01', active: true, ...b }))
  base.goals = (fields.goals ?? []).map((g, i) => ({ id: `g${i}`, createdAt: '', updatedAt: '', name: `Goal ${i}`, icon: 'target', target: 10_000, monthlyContribution: 0, archived: false, ...g }))
  base.debts = (fields.debts ?? []).map((d, i) => ({ id: `d${i}`, createdAt: '', updatedAt: '', direction: 'lent', person: `Person ${i}`, startingAmount: 5_000, date: '2026-10-01', archived: false, ...d }))
  return base
}

describe('a calendar month', () => {
  it('adds up each day’s spending and income in the main currency only', () => {
    const month = calendarMonth(
      data({
        transactions: [
          { amount: 1_200, date: '2026-11-03' },
          { amount: 800, date: '2026-11-03', accountId: 'acc-bank' },
          { type: 'income', amount: 5_000, date: '2026-11-03', categoryId: 'inc-other' },
          { amount: 20, date: '2026-11-03', currency: 'USD' },
          { amount: 9_999, date: '2026-11-03', deleted: true },
          { amount: 500, date: '2026-10-31' },
        ],
      }),
      '2026-11-20',
      TODAY,
    )
    expect(month.month).toBe('2026-11-01')
    expect(month.days).toHaveLength(30)
    const third = month.days[2]
    expect(third).toMatchObject({ date: '2026-11-03', spent: 2_000, received: 5_000 })
    // The dollar entry is listed, the deleted one isn't.
    expect(third.entries).toHaveLength(4)
    expect(month.spent).toBe(2_000)
    expect(month.busiestDay).toBe(2_000)
  })

  it('shows bills on their due day as paid, late or upcoming', () => {
    const month = calendarMonth(
      data({
        bills: [
          { id: 'rent', name: 'Rent', amount: 20_000, dueDay: 1 },
          { id: 'net', name: 'Internet', amount: 2_000, dueDay: 10 },
          { id: 'phone', name: 'Phone', amount: 1_000, dueDay: 20 },
        ],
        transactions: [{ amount: 20_000, date: '2026-11-01', billId: 'rent', categoryId: 'cat-housing' }],
      }),
      TODAY,
      TODAY,
    )
    const event = (date: string) => month.days.find((d) => d.date === date)!.events[0]
    expect(event('2026-11-01')).toMatchObject({ kind: 'bill', name: 'Rent', status: 'paid' })
    expect(event('2026-11-10')).toMatchObject({ kind: 'bill', name: 'Internet', status: 'late' })
    expect(event('2026-11-20')).toMatchObject({ kind: 'bill', name: 'Phone', status: 'upcoming' })
    expect(month.billsDue).toBe(3)
    expect(month.billsToPay).toBe(3_000)
  })

  it('shows paydays still to come, and pay due with no answer yet', () => {
    const october = calendarMonth(data(), '2026-10-01', TODAY)
    expect(october.days.find((d) => d.date === '2026-10-25')!.events[0]).toMatchObject({ kind: 'pay', amount: 60_000, status: 'expected' })
    const november = calendarMonth(data(), '2026-11-01', TODAY)
    expect(november.days.find((d) => d.date === '2026-11-25')!.events[0]).toMatchObject({ kind: 'pay', status: 'upcoming' })
    // Answered: it's an entry now, not something to wait for.
    const answered = calendarMonth(data({ transactions: [{ id: 'salary-2026-10-25', type: 'income', amount: 60_000, date: '2026-10-25', categoryId: 'inc-salary', source: 'salary' }] }), '2026-10-01', TODAY)
    expect(answered.days.find((d) => d.date === '2026-10-25')!.events).toEqual([])
  })

  it('shows goal deadlines, fund dates, debts due and instalments', () => {
    const month = calendarMonth(
      data({
        goals: [
          { name: 'Laptop', deadline: '2026-11-30' },
          { name: 'School', fund: { repeat: 'yearly' }, deadline: '2025-11-05' },
          { name: 'Insurance', fund: { billId: 'b0' } },
        ],
        debts: [
          { person: 'Sami', dueDate: '2026-11-12' },
          { person: 'Bank', direction: 'borrowed', monthlyPayment: 4_000, firstPaymentDate: '2026-09-18' },
          { person: 'Paid off', dueDate: '2026-11-14', startingAmount: 0 },
        ],
      }),
      TODAY,
      TODAY,
    )
    const events = month.days.flatMap((d) => d.events.map((e) => `${e.date} ${e.kind} ${e.name} ${e.status}`))
    expect(events).toEqual([
      '2026-11-05 fund School late',
      '2026-11-12 debt Sami late',
      '2026-11-18 instalment Bank upcoming',
      '2026-11-25 pay undefined upcoming',
      '2026-11-30 goal Laptop upcoming',
    ])
  })
})

describe('the month grid', () => {
  it('fills whole weeks from the first day of the week', () => {
    // November 2026 starts on a Sunday.
    const sunday = monthGrid('2026-11-15', 0)
    expect(sunday).toHaveLength(5)
    expect(sunday[0][0]).toBe('2026-11-01')
    expect(sunday[4].filter(Boolean)).toEqual(['2026-11-29', '2026-11-30'])
    const monday = monthGrid('2026-11-15', 1)
    expect(monday[0].slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(monday).toHaveLength(6)
    expect(monthOf('2026-02-28')).toBe('2026-02-01')
  })
})
