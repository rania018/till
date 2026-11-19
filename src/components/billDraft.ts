import { addYears } from 'date-fns'
import { billDueDates } from '../lib/bills'
import { fromISODate, toISODate } from '../lib/dates'
import { ACCOUNT_IDS } from '../store/defaults'
import type { Bill, BillFrequency, ID, ISODate } from '../types'

/** What the bill form edits. Due dates are asked the natural way for each frequency. */
export interface BillDraft {
  id?: ID
  name: string
  amount: number | null
  categoryId: ID
  accountId: ID
  frequency: BillFrequency
  /** Monthly: day of the month. Weekly: weekday (0 = Sunday). */
  dueDay: number
  /** Quarterly and yearly: the next date it's due. */
  nextDue: ISODate
}

export function newBillDraft(fields: Partial<BillDraft>, today: ISODate): BillDraft {
  return {
    name: '',
    amount: null,
    categoryId: 'cat-bills',
    accountId: ACCOUNT_IDS.cash,
    frequency: 'monthly',
    dueDay: fromISODate(today).getDate(),
    nextDue: today,
    ...fields,
  }
}

export function billToDraft(bill: Bill, today: ISODate): BillDraft {
  const [upcoming] = billDueDates(bill, { start: today, end: toISODate(addYears(fromISODate(today), 1)) })
  return {
    id: bill.id,
    name: bill.name,
    amount: bill.amount,
    categoryId: bill.categoryId,
    accountId: bill.accountId,
    frequency: bill.frequency,
    dueDay: bill.dueDay,
    nextDue: upcoming ?? bill.startDate,
  }
}

/**
 * The bill fields to save. New monthly and weekly bills count from today, so a
 * due date earlier this month (already paid before setup) isn't shown as overdue.
 * Quarterly and yearly bills repeat from their next due date.
 */
export function draftToBill(draft: BillDraft, today: ISODate, existing?: Bill): Omit<Bill, 'id' | 'createdAt' | 'updatedAt'> {
  const repeatsFromNextDue = draft.frequency === 'quarterly' || draft.frequency === 'yearly'
  return {
    name: draft.name.trim(),
    amount: draft.amount ?? 0,
    categoryId: draft.categoryId,
    accountId: draft.accountId,
    frequency: draft.frequency,
    dueDay: repeatsFromNextDue ? fromISODate(draft.nextDue).getDate() : draft.dueDay,
    startDate: repeatsFromNextDue ? draft.nextDue : (existing?.startDate ?? today),
    active: existing?.active ?? true,
  }
}
