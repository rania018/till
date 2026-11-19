import { describe, expect, it } from 'vitest'
import { createInitialData } from '../store/defaults'
import type { AppData, Debt, Transaction } from '../types'
import { budgetSummary } from './budget'
import { byCurrency, entryMoney, exchangedMoney, formatAmounts, inMainCurrency, otherCurrencyTotals } from './currency'
import { debtOwed, debtTotals, debtViews, monthlyDebtPayments } from './debts'
import { periodTotals } from './stats'
import { groupByDay } from './transactions'
import { checkBill, checkProfile, checkTransaction } from './validation'
import { walletBalance } from './wallets'

const TODAY = '2026-11-15'
const RANGE = { start: '2026-10-25', end: '2026-11-24' }
const SALARY = { amount: 60_000, frequency: 'monthly', payday: 25, accountId: 'acc-bank' } as const
const USD_WALLET = { id: 'usd', createdAt: '', updatedAt: '', name: 'USD card', kind: 'bank', currency: 'USD', startingBalance: 0, startDate: '2026-01-01', archived: false } as const

const entry = (fields: Partial<Transaction>): Transaction => ({ id: 't', createdAt: '', updatedAt: '', type: 'expense', amount: 0, date: TODAY, accountId: 'acc-bank', categoryId: 'cat-other', ...fields })
const debt = (fields: Partial<Debt> = {}): Debt => ({ id: 'd', createdAt: '', updatedAt: '', direction: 'borrowed', person: 'Karim', startingAmount: 0, date: '2026-10-01', archived: false, currency: 'USD', ...fields })

function setup(fields: Partial<AppData> = {}): AppData {
  const data = createInitialData(new Date(2026, 9, 25))
  data.profile.salary = SALARY
  data.accounts = [...data.accounts, USD_WALLET]
  return { ...data, ...fields }
}

describe('adding amounts up', () => {
  it('keeps each currency apart, main first, without zeros', () => {
    const rows = byCurrency(
      [
        { currency: 'USD', amount: 10 },
        { currency: 'DZD', amount: 100 },
        { currency: 'USD', amount: 5.5 },
        { currency: 'EUR', amount: 0 },
      ],
      'DZD',
    )
    expect(rows).toEqual([
      { currency: 'DZD', amount: 100 },
      { currency: 'USD', amount: 15.5 },
    ])
    expect(formatAmounts(rows, 'DZD')).toBe('100 DA · 15.50 USD')
  })

  it('shows zero in the main currency when there’s nothing', () => {
    expect(formatAmounts([], 'DZD')).toBe('0 DA')
  })

  it('treats no currency, and the main one by name, as the main currency', () => {
    const list = [entry({ id: 'a' }), entry({ id: 'b', currency: 'DZD' }), entry({ id: 'c', currency: 'USD' })]
    expect(inMainCurrency(list, 'DZD').map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('spending in another currency', () => {
  const usdExpense = entry({ amount: 15.99, currency: 'USD', accountId: 'usd' })

  it('moves its own wallet', () => {
    expect(walletBalance(USD_WALLET, [usdExpense])).toBe(-15.99)
  })

  it('leaves left to spend, limits and Stats alone', () => {
    const data = setup({ transactions: [usdExpense] })
    expect(budgetSummary(data, TODAY)).toMatchObject({ spent: 0, flexibleSpent: 0, leftToSpend: 60_000 })
    expect(periodTotals(inMainCurrency(data.transactions, 'DZD'), data.accounts, RANGE).spent).toBe(0)
  })

  it('is listed on its own line', () => {
    expect(otherCurrencyTotals([usdExpense, entry({ type: 'income', amount: 200, currency: 'USD', accountId: 'usd' }), entry({ amount: 500 })], RANGE, 'DZD')).toEqual([{ currency: 'USD', spent: 15.99, received: 200 }])
  })

  it('stays out of a day’s total', () => {
    expect(groupByDay([usdExpense, entry({ id: 'b', amount: 500 })], 'DZD')[0].spent).toBe(500)
  })

  it('shows in its own currency', () => {
    expect(entryMoney(usdExpense, undefined, 'DZD')).toEqual({ amount: 15.99, currency: 'USD' })
    expect(entryMoney(entry({ amount: 500 }), undefined, 'DZD')).toEqual({ amount: 500, currency: 'DZD' })
  })
})

describe('a USD debt', () => {
  it('is owed in USD, and paying in dollars clears it', () => {
    const moves = [entry({ type: 'debt-in', amount: 100, currency: 'USD', accountId: 'usd', debtId: 'd' }), entry({ id: 'b', type: 'debt-out', amount: 40, currency: 'USD', accountId: 'usd', debtId: 'd' })]
    expect(debtOwed(debt(), moves)).toBe(60)
    expect(budgetSummary(setup({ debts: [debt()], transactions: moves }), TODAY)).toMatchObject({ debtIn: 0, debtOut: 0, leftToSpend: 60_000 })
  })

  it('paid back in dinars clears what you said, and costs what you paid', () => {
    const moves = [
      entry({ type: 'debt-in', amount: 100, currency: 'USD', accountId: 'usd', debtId: 'd' }),
      entry({ id: 'b', type: 'debt-out', amount: 13_500, accountId: 'acc-bank', debtId: 'd', debtAmount: 50 }),
    ]
    expect(debtOwed(debt(), moves)).toBe(50)
    expect(budgetSummary(setup({ debts: [debt()], transactions: moves }), TODAY)).toMatchObject({ debtOut: 13_500, leftToSpend: 46_500 })
    const view = debtViews([debt()], moves, RANGE, TODAY)[0]
    expect(view).toMatchObject({ owed: 50, total: 100, repaid: 50, progress: 0.5 })
  })

  it('works the other way: paid back to you in dinars', () => {
    const lent = debt({ direction: 'lent' })
    const moves = [entry({ type: 'debt-out', amount: 100, currency: 'USD', accountId: 'usd', debtId: 'd' }), entry({ id: 'b', type: 'debt-in', amount: 27_000, accountId: 'acc-bank', debtId: 'd', debtAmount: 100 })]
    expect(debtOwed(lent, moves)).toBe(0)
    expect(budgetSummary(setup({ debts: [lent], transactions: moves }), TODAY)).toMatchObject({ debtIn: 27_000, flexibleBudget: 87_000 })
  })

  it('reserves no instalment in the dinar budget', () => {
    const plan = debt({ startingAmount: 500, monthlyPayment: 50, firstPaymentDate: '2026-10-28' })
    expect(budgetSummary(setup({ debts: [plan] }), TODAY).debtOut).toBe(0)
    expect(monthlyDebtPayments([plan], [], 'DZD')).toBe(0)
  })

  it('totals list each currency', () => {
    const debts = [debt({ startingAmount: 100 }), debt({ id: 'e', startingAmount: 5_000, currency: undefined }), debt({ id: 'f', direction: 'lent', startingAmount: 20, currency: 'EUR' })]
    expect(debtTotals(debtViews(debts, [], RANGE, TODAY), 'DZD')).toEqual({
      iOwe: [
        { currency: 'DZD', amount: 5_000 },
        { currency: 'USD', amount: 100 },
      ],
      owedToMe: [{ currency: 'EUR', amount: 20 }],
    })
  })
})

describe('changing money', () => {
  const bought = entry({ type: 'transfer', amount: 27_000, accountId: 'acc-bank', toAccountId: 'usd', toAmount: 100, toCurrency: 'USD', categoryId: undefined })
  const sold = entry({ id: 'b', type: 'transfer', amount: 50, currency: 'USD', accountId: 'usd', toAccountId: 'acc-bank', toAmount: 13_000, categoryId: undefined })

  it('moves each wallet by its own amount', () => {
    expect(walletBalance(USD_WALLET, [bought, sold])).toBe(50)
    const bank = setup().accounts.find((a) => a.id === 'acc-bank')!
    expect(walletBalance({ ...bank, startingBalance: 30_000, startDate: '2026-01-01' }, [bought, sold])).toBe(16_000)
  })

  it('counts in left to spend, both ways', () => {
    expect(exchangedMoney([bought, sold], RANGE, 'DZD')).toEqual({ out: 27_000, back: 13_000 })
    expect(budgetSummary(setup({ transactions: [bought] }), TODAY)).toMatchObject({ exchangedOut: 27_000, leftToSpend: 33_000 })
    expect(budgetSummary(setup({ transactions: [sold] }), TODAY)).toMatchObject({ exchangedBack: 13_000, leftToSpend: 73_000 })
  })

  it('leaves money moved between other currencies out of it', () => {
    const between = entry({ type: 'transfer', amount: 10, currency: 'EUR', accountId: 'x', toAccountId: 'usd', toAmount: 11, toCurrency: 'USD' })
    expect(exchangedMoney([between], RANGE, 'DZD')).toEqual({ out: 0, back: 0 })
  })

  it('shows what arrived, seen from the wallet it arrived in', () => {
    expect(entryMoney(bought, 'usd', 'DZD')).toEqual({ amount: 100, currency: 'USD' })
    expect(entryMoney(bought, 'acc-bank', 'DZD')).toEqual({ amount: 27_000, currency: 'DZD' })
  })
})

describe('checks', () => {
  const data = (fields: Partial<AppData> = {}) => setup(fields)

  it('wants both amounts when changing money', () => {
    const move = { type: 'transfer', amount: 27_000, date: TODAY, accountId: 'acc-bank', toAccountId: 'usd' } as const
    expect(checkTransaction(move, data())).toMatch(/amount that arrived/)
    expect(checkTransaction({ ...move, toAmount: 100 }, data())).toBeNull()
  })

  it('wants to know what a payment in another currency clears, and refuses too much', () => {
    const owed = data({ debts: [debt({ startingAmount: 100 })] })
    const pay = { type: 'debt-out', amount: 27_000, date: TODAY, accountId: 'acc-bank', debtId: 'd' } as const
    expect(checkTransaction(pay, owed)).toMatch(/how much of the debt/)
    expect(checkTransaction({ ...pay, debtAmount: 100 }, owed)).toBeNull()
    expect(checkTransaction({ ...pay, debtAmount: 101 }, owed)).toMatch(/Only 100 USD/)
  })

  it('refuses to grow a debt in another currency', () => {
    expect(checkTransaction({ type: 'debt-in', amount: 500, date: TODAY, accountId: 'acc-bank', debtId: 'd' }, data({ debts: [debt()] }))).toMatch(/its own currency/)
  })

  it('keeps goals, bills and the salary in the main currency', () => {
    const goal = { id: 'g', createdAt: '', updatedAt: '', name: 'Trip', icon: 'plane', target: 100, monthlyContribution: 0, archived: false }
    expect(checkTransaction({ type: 'goal-deposit', amount: 5, date: TODAY, accountId: 'usd', goalId: 'g' }, data({ goals: [goal] }))).toMatch(/main currency/)
    const bill = { name: 'Rent', amount: 1, categoryId: 'cat-other', accountId: 'usd', frequency: 'monthly', dueDay: 1, startDate: TODAY, active: true } as const
    expect(checkBill(bill, data())).toMatch(/main currency/)
    const all = data()
    expect(checkProfile({ ...all.profile, salary: { ...SALARY, accountId: 'usd' } }, all)).toMatch(/main currency/)
  })
})
