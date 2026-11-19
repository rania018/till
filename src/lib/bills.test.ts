import { describe, expect, it } from 'vitest'
import { PREVIEW_TODAY, previewExample } from '../test/previewExample'
import type { Bill, Transaction } from '../types'
import { billChoices, billDueDates, billMonthlyCost, billOccurrences, cycleBills, totalMonthlyBills } from './bills'

const cycle = { start: '2026-10-25', end: '2026-11-24', days: 31 }
const TODAY = '2026-11-15'

describe('billChoices', () => {
  it('offers each bill once, the ones still to pay first', () => {
    const data = previewExample()
    const choices = billChoices(data.bills, cycle, data.transactions, PREVIEW_TODAY)
    expect(choices.map((c) => [c.bill.name, c.paid])).toEqual([
      ['Internet', false],
      ['Rent', true],
      ['Swimming', true],
      ['Transport pass', true],
      ['Phone', true],
    ])
  })

  it('counts a bill as open while any of its due dates this cycle is unpaid, and lists bills not due this cycle last', () => {
    const data = previewExample()
    const weekly: Bill = { ...data.bills[0], id: 'bill-cleaner', name: 'Cleaner', amount: 500, frequency: 'weekly', dueDay: 1 }
    const yearly: Bill = { ...data.bills[0], id: 'bill-insurance', name: 'Insurance', frequency: 'yearly', startDate: '2026-03-01', dueDay: 1 }
    const payment: Transaction = { ...data.transactions[0], id: 'pay-cleaner', type: 'expense', amount: 500, billId: 'bill-cleaner', date: '2026-10-26' }
    const names = billChoices([weekly, yearly], cycle, [payment], PREVIEW_TODAY)
    expect(names.map((c) => [c.bill.name, c.paid])).toEqual([
      ['Cleaner', false],
      ['Insurance', false],
    ])
  })
})

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    createdAt: '',
    updatedAt: '',
    name: 'Internet',
    amount: 2_000,
    categoryId: 'cat-bills',
    accountId: 'acc-bank',
    frequency: 'monthly',
    dueDay: 17,
    startDate: '2026-01-01',
    active: true,
    ...overrides,
  }
}

function payment(date: string, overrides: Partial<Transaction> = {}): Transaction {
  return { id: `pay-${date}`, createdAt: '', updatedAt: '', type: 'expense', amount: 2_000, date, accountId: 'acc-bank', categoryId: 'cat-bills', billId: 'bill-1', ...overrides }
}

describe('billMonthlyCost', () => {
  it('spreads other frequencies over a month', () => {
    expect(billMonthlyCost({ amount: 1_000, frequency: 'weekly' })).toBeCloseTo(4_333.33, 2)
    expect(billMonthlyCost({ amount: 900, frequency: 'quarterly' })).toBe(300)
    expect(billMonthlyCost({ amount: 12_000, frequency: 'yearly' })).toBe(1_000)
  })

  it('totals only active, non-deleted bills', () => {
    expect(totalMonthlyBills([bill(), bill({ id: 'b2', active: false }), bill({ id: 'b3', deleted: true })])).toBe(2_000)
  })
})

describe('billDueDates', () => {
  it('finds a monthly due date inside a pay cycle', () => {
    expect(billDueDates(bill(), cycle)).toEqual(['2026-11-17'])
    expect(billDueDates(bill({ dueDay: 25 }), cycle)).toEqual(['2026-10-25'])
  })

  it('moves day 31 to the end of shorter months', () => {
    expect(billDueDates(bill({ dueDay: 31 }), { start: '2026-11-01', end: '2026-11-30' })).toEqual(['2026-11-30'])
  })

  it('repeats quarterly bills every 3 months from their start', () => {
    const quarterly = bill({ frequency: 'quarterly', dueDay: 10, startDate: '2026-08-10' })
    expect(billDueDates(quarterly, cycle)).toEqual(['2026-11-10'])
    expect(billDueDates(quarterly, { start: '2026-09-25', end: '2026-10-24' })).toEqual([])
  })

  it('repeats yearly bills in their start month', () => {
    const yearly = bill({ frequency: 'yearly', dueDay: 5, startDate: '2026-03-05' })
    expect(billDueDates(yearly, { start: '2027-01-01', end: '2027-12-31' })).toEqual(['2027-03-05'])
  })

  it('lists every weekday for weekly bills', () => {
    expect(billDueDates(bill({ frequency: 'weekly', dueDay: 6 }), cycle)).toEqual([
      '2026-10-31',
      '2026-11-07',
      '2026-11-14',
      '2026-11-21',
    ])
  })

  it('skips dates before the bill starts, and inactive bills', () => {
    expect(billDueDates(bill({ startDate: '2026-11-20' }), cycle)).toEqual([])
    expect(billDueDates(bill({ active: false }), cycle)).toEqual([])
  })
})

describe('billOccurrences', () => {
  const status = (b: Bill, txs: Transaction[] = []) => billOccurrences(b, cycle, txs, TODAY).map((o) => o.status)

  it('marks unpaid bills overdue, due soon or upcoming', () => {
    expect(status(bill({ dueDay: 10 }))).toEqual(['overdue'])
    expect(status(bill({ dueDay: 17 }))).toEqual(['due-soon'])
    expect(status(bill({ dueDay: 22 }))).toEqual(['upcoming'])
  })

  it('marks a bill paid by a linked expense in the cycle', () => {
    const [occurrence] = billOccurrences(bill(), cycle, [payment('2026-11-12')], TODAY)
    expect(occurrence).toEqual({ billId: 'bill-1', dueDate: '2026-11-17', status: 'paid', paymentId: 'pay-2026-11-12' })
  })

  it('ignores payments outside the cycle and deleted payments', () => {
    expect(status(bill(), [payment('2026-10-17'), payment('2026-11-12', { deleted: true })])).toEqual(['due-soon'])
  })

  it('matches weekly payments to due dates in order', () => {
    const weekly = bill({ frequency: 'weekly', dueDay: 6 })
    expect(status(weekly, [payment('2026-10-31'), payment('2026-11-07')])).toEqual(['paid', 'paid', 'overdue', 'upcoming'])
  })
})

describe('cycleBills', () => {
  it('reproduces the preview: Internet due soon first, the rest paid', () => {
    const data = previewExample()
    const result = cycleBills(data.bills, cycle, data.transactions, PREVIEW_TODAY)
    expect(result.due.map((d) => `${d.bill.name}:${d.occurrence.status}`)).toEqual([
      'Internet:due-soon',
      'Rent:paid',
      'Swimming:paid',
      'Transport pass:paid',
      'Phone:paid',
    ])
    expect(result).toMatchObject({ planned: 14_200, paid: 12_200, notDue: [] })
  })

  it('lists quarterly bills that aren’t due this cycle with their next date', () => {
    const quarterly = bill({ id: 'q', name: 'Electricity', frequency: 'quarterly', dueDay: 10, startDate: '2026-12-10' })
    const result = cycleBills([quarterly, bill({ id: 'off', active: false })], cycle, [], TODAY)
    expect(result.due).toEqual([])
    expect(result.notDue).toEqual([{ bill: quarterly, nextDue: '2026-12-10' }])
  })

  it('counts what was actually paid, not the bill amount', () => {
    const result = cycleBills([bill()], cycle, [payment('2026-11-12', { amount: 2_150 })], TODAY)
    expect(result).toMatchObject({ planned: 2_000, paid: 2_150 })
  })
})
