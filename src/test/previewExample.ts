import type { AppData, Bill, Goal, Transaction } from '../types'
import { ACCOUNT_IDS, CATEGORY_IDS, createInitialData } from '../store/defaults'

/**
 * The approved visual preview’s example: 60,000 DA salary paid on the
 * 25th into the bank card, set up on payday 25 Oct 2026, viewed on Sunday
 * 15 November. Tests check the app's math reproduces the mockups' numbers.
 */
export const PREVIEW_TODAY = '2026-11-15'

const TIMESTAMP = '2026-10-25T08:00:00.000Z'
const { cash, bank } = ACCOUNT_IDS

export function previewExample(): AppData {
  let next = 0
  const stamp = { createdAt: TIMESTAMP, updatedAt: TIMESTAMP }
  const tx = (fields: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Transaction => ({
    id: `tx-${++next}`,
    ...stamp,
    ...fields,
  })
  const bill = (id: string, fields: Omit<Bill, 'id' | 'createdAt' | 'updatedAt' | 'frequency' | 'startDate' | 'active'>): Bill => ({
    id,
    ...stamp,
    frequency: 'monthly',
    startDate: '2026-10-25',
    active: true,
    ...fields,
  })
  const goal = (id: string, name: string, target: number, monthlyContribution: number, startingAmount: number): Goal => ({
    id,
    ...stamp,
    name,
    icon: 'target',
    target,
    monthlyContribution,
    startingAmount,
    archived: false,
  })

  const data = createInitialData(new Date(2026, 9, 25, 9))
  data.profile = {
    ...data.profile,
    salary: { amount: 60_000, frequency: 'monthly', payday: 25, accountId: bank },
    startDate: '2026-10-25',
    onboardingCompleted: true,
  }

  const budgets: Record<string, number> = {
    'cat-groceries': 16_000,
    'cat-eating-out': 5_000,
    'cat-shopping': 5_000,
    'cat-entertainment': 3_000,
    'cat-personal-care': 2_500,
    'cat-household': 1_800,
    [CATEGORY_IDS.other]: 2_500,
  }
  data.categories = data.categories.map((c) => (budgets[c.id] ? { ...c, monthlyBudget: budgets[c.id] } : c))
  // Home's wallet card says "counted 3 days ago".
  data.accounts = data.accounts.map((a) => (a.id === cash ? { ...a, lastCountedAt: '2026-11-12T18:00:00.000Z' } : a))

  data.bills = [
    bill('bill-rent', { name: 'Rent', amount: 3_000, categoryId: 'cat-housing', accountId: bank, dueDay: 25 }),
    bill('bill-swimming', { name: 'Swimming', amount: 6_000, categoryId: 'cat-health', accountId: bank, dueDay: 26 }),
    bill('bill-transport', { name: 'Transport pass', amount: 2_200, categoryId: 'cat-transport', accountId: cash, dueDay: 26 }),
    bill('bill-phone', { name: 'Phone', amount: 1_000, categoryId: 'cat-bills', accountId: bank, dueDay: 27 }),
    bill('bill-internet', { name: 'Internet', amount: 2_000, categoryId: 'cat-bills', accountId: bank, dueDay: 17 }),
  ]

  data.goals = [
    // The starting amounts were saved before setup: they count toward goals but not toward wallets.
    goal('goal-laptop', 'Laptop', 120_000, 5_000, 27_000),
    goal('goal-trip', 'Summer trip', 80_000, 3_000, 37_000),
    goal('goal-emergency', 'Emergency fund', 150_000, 2_000, 45_000),
  ]

  const spend = (amount: number, categoryId: string, date: string, accountId: string = cash, note?: string) =>
    tx({ type: 'expense', amount, categoryId, date, accountId, note })

  data.transactions = [
    tx({ type: 'income', amount: 60_000, categoryId: CATEGORY_IDS.salary, date: '2026-10-25', accountId: bank, source: 'salary' }),
    tx({ type: 'goal-deposit', amount: 5_000, goalId: 'goal-laptop', date: '2026-10-25', accountId: bank }),
    tx({ type: 'goal-deposit', amount: 3_000, goalId: 'goal-trip', date: '2026-10-25', accountId: bank }),

    // ATM withdrawals: bank → cash.
    tx({ type: 'transfer', amount: 20_000, date: '2026-10-25', accountId: bank, toAccountId: cash }),
    tx({ type: 'transfer', amount: 6_450, date: '2026-11-03', accountId: bank, toAccountId: cash }),
    tx({ type: 'transfer', amount: 5_000, date: '2026-11-12', accountId: bank, toAccountId: cash }),

    // Bills paid (Internet, due 17 Nov, is still unpaid).
    tx({ type: 'expense', amount: 3_000, categoryId: 'cat-housing', billId: 'bill-rent', date: '2026-10-25', accountId: bank }),
    tx({ type: 'expense', amount: 6_000, categoryId: 'cat-health', billId: 'bill-swimming', date: '2026-10-26', accountId: bank }),
    tx({ type: 'expense', amount: 2_200, categoryId: 'cat-transport', billId: 'bill-transport', date: '2026-10-26', accountId: cash }),
    tx({ type: 'expense', amount: 1_000, categoryId: 'cat-bills', billId: 'bill-phone', date: '2026-10-27', accountId: bank }),

    // Flexible spending: 26,100 DA.
    spend(9_650, 'cat-groceries', '2026-11-01'),
    spend(2_350, 'cat-groceries', '2026-11-14', cash, 'Market'),
    spend(4_350, 'cat-eating-out', '2026-11-08'),
    spend(250, 'cat-eating-out', '2026-11-15', cash, 'Coffee'),
    spend(4_300, 'cat-shopping', '2026-11-05'),
    spend(1_100, 'cat-shopping', '2026-11-10', bank),
    spend(1_500, 'cat-entertainment', '2026-11-07'),
    spend(1_100, 'cat-household', '2026-10-30'),
    spend(900, 'cat-personal-care', '2026-11-02'),
    spend(600, CATEGORY_IDS.other, '2026-11-09'),
  ]
  return data
}
