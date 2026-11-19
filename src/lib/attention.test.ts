import { describe, expect, it } from 'vitest'
import { createInitialData } from '../store/defaults'
import type { AppData, Transaction } from '../types'
import { attention, planAttention } from './attention'

const TODAY = '2026-11-15'

/** 60,000 DA on the 25th, set up in October: this month runs 25 Oct – 24 Nov. */
function data(): AppData {
  const d = createInitialData(new Date(2026, 9, 1))
  d.profile.salary = { ...d.profile.salary, amount: 60_000, payday: 25 }
  d.profile.startDate = '2026-10-01'
  d.profile.onboardingCompleted = true
  return d
}

const tx = (fields: Partial<Transaction>): Transaction => ({ id: `t-${Math.random()}`, createdAt: '', updatedAt: '', type: 'expense', amount: 0, date: TODAY, accountId: 'acc-bank', ...fields })

describe('what needs you', () => {
  it('counts pay waiting for an answer, and nothing when it has one', () => {
    const d = data()
    expect(attention(d, TODAY).pay).toBe(1)
    d.transactions = [tx({ id: 'salary-2026-10-25', type: 'income', amount: 60_000, date: '2026-10-25', categoryId: 'inc-salary', source: 'salary' })]
    expect(attention(d, TODAY).pay).toBe(0)
  })

  it('counts late bills, goals behind and late debts for Plan', () => {
    const d = data()
    const base = { createdAt: '', updatedAt: '', categoryId: 'cat-bills', accountId: 'acc-bank', frequency: 'monthly' as const, startDate: '2026-01-01', active: true }
    d.bills = [
      { ...base, id: 'late', name: 'Internet', amount: 2_000, dueDay: 10 },
      { ...base, id: 'paid', name: 'Rent', amount: 20_000, dueDay: 1 },
      { ...base, id: 'later', name: 'Phone', amount: 1_000, dueDay: 20 },
    ]
    d.transactions = [tx({ billId: 'paid', amount: 20_000, date: '2026-11-01', categoryId: 'cat-housing' })]
    const goal = { createdAt: '', updatedAt: '', icon: 'target', archived: false }
    d.goals = [
      // 100,000 by March at nothing a month: behind.
      { ...goal, id: 'g1', name: 'Laptop', target: 100_000, monthlyContribution: 0, deadline: '2027-03-01' },
      { ...goal, id: 'g2', name: 'Trip', target: 10_000, monthlyContribution: 5_000, deadline: '2027-06-01' },
      // A fund past its date is its bill's business, not a goal behind.
      { ...goal, id: 'f1', name: 'Insurance', target: 12_000, monthlyContribution: 1_000, fund: { billId: 'late' } },
    ]
    d.debts = [
      { id: 'd1', createdAt: '', updatedAt: '', direction: 'lent', person: 'Sami', startingAmount: 5_000, date: '2026-10-01', dueDate: '2026-11-08', archived: false },
      { id: 'd2', createdAt: '', updatedAt: '', direction: 'lent', person: 'Nadia', startingAmount: 5_000, date: '2026-10-01', dueDate: '2026-12-08', archived: false },
    ]
    const a = attention(d, TODAY)
    expect(a).toMatchObject({ lateBills: 1, goalsBehind: 1, lateDebts: 1 })
    expect(planAttention(a)).toBe(3)
  })
})
