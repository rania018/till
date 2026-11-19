import { describe, expect, it } from 'vitest'
import { previewExample } from '../../test/previewExample'
import type { Transaction } from '../../types'
import { describeTransaction } from './describe'

const data = previewExample()
const names = { categories: data.categories, accounts: data.accounts, goals: data.goals, debts: [{ id: 'd1', createdAt: '', updatedAt: '', direction: 'borrowed' as const, person: 'Sami', startingAmount: 0, date: '2026-10-01', archived: false }] }
const stamp = { id: 'tx', createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z', date: '2026-11-01', amount: 100 }
const describeIt = (fields: Partial<Transaction>) =>
  describeTransaction({ ...stamp, type: 'expense', accountId: 'acc-cash', ...fields } as Transaction, names)
const wallet = (id: string) => data.accounts.find((a) => a.id === id)!.name
const [cash, bank] = [data.accounts.find((a) => a.kind === 'cash')!, data.accounts.find((a) => a.kind !== 'cash')!]

// The Activity ledger shows `detail` and `wallet` in columns; together they say what `subtitle` says.
describe('the ledger columns of a transaction', () => {
  it('an expense with a note: the category is the detail, the wallet its own column', () => {
    const row = describeIt({ note: 'Market', categoryId: 'cat-groceries', accountId: cash.id })
    expect(row).toMatchObject({ title: 'Market', detail: 'Groceries', wallet: wallet(cash.id) })
    expect(row.subtitle).toBe(`Groceries · ${wallet(cash.id)}`)
  })

  it('an expense without a note: the category is the title, so it is not repeated', () => {
    expect(describeIt({ categoryId: 'cat-groceries', accountId: cash.id })).toMatchObject({ title: 'Groceries', detail: '', wallet: wallet(cash.id) })
  })

  it('counts the extra lines of a list note in the detail', () => {
    expect(describeIt({ note: 'Bread\nMilk\nEggs', categoryId: 'cat-groceries', accountId: cash.id })).toMatchObject({ title: 'Bread', detail: 'Groceries · +2 more' })
  })

  it('a debt entry: who it was with, and which way it went', () => {
    expect(describeIt({ type: 'debt-out', debtId: 'd1', accountId: bank.id })).toMatchObject({ title: 'Sami', detail: 'Paid back', wallet: bank.name, icon: 'hand-coins' })
    expect(describeIt({ type: 'debt-in', debtId: 'd1', accountId: bank.id })).toMatchObject({ title: 'Sami', detail: 'Borrowed' })
    expect(describeIt({ type: 'debt-in', debtId: 'gone', accountId: bank.id }).title).toBe('Debt')
  })

  it('only bank to cash reads as a withdrawal', () => {
    expect(describeIt({ type: 'transfer', accountId: bank.id, toAccountId: cash.id }).title).toBe('Cash withdrawal')
    expect(describeIt({ type: 'transfer', accountId: cash.id, toAccountId: bank.id }).title).toBe('Transfer')
  })

  it('a transfer: the route goes in the wallet column', () => {
    const row = describeIt({ type: 'transfer', accountId: bank.id, toAccountId: cash.id })
    expect(row.wallet).toBe(`${wallet(bank.id)} → ${wallet(cash.id)}`)
    expect(row.detail).toBe('')
    expect(row.subtitle).toBe(row.wallet)
  })

  it('money put towards a goal: says where it went, and from which wallet', () => {
    const row = describeIt({ type: 'goal-deposit', goalId: 'goal-laptop', accountId: bank.id })
    expect(row.title).toBe('Laptop')
    expect(row.wallet).toBe(wallet(bank.id))
    expect(row.subtitle).toBe(`${row.detail} · ${row.wallet}`)
  })
})
