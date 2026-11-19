import { describe, expect, it } from 'vitest'
import type { StateStorage } from 'zustand/middleware'
import { transactionsToCsv } from '../store/backup'
import { createInitialData } from '../store/defaults'
import { createAppStore, whenHydrated } from '../store/store'
import { previewExample } from '../test/previewExample'
import { buildImport, categoryNames, detectDateFormat, detectDelimiter, guessMapping, guessPositiveIs, importTotals, looksLikeHeader, parseAmount, parseCsv, parseDate, type ImportOptions } from './csvImport'
import { live } from './id'

describe('reading a CSV file', () => {
  it('handles quotes, doubled quotes, line breaks in quotes, a BOM and Windows line ends', () => {
    const text = '﻿Date,Note,Amount\r\n2026-11-02,"Bread, milk and ""fresh"" eggs",450\r\n2026-11-03,"two\nlines",100\r\n\r\n'
    expect(parseCsv(text)).toEqual([
      ['Date', 'Note', 'Amount'],
      ['2026-11-02', 'Bread, milk and "fresh" eggs', '450'],
      ['2026-11-03', 'two\nlines', '100'],
    ])
  })

  it('finds the separator: semicolons from French Excel, tabs, or commas', () => {
    expect(detectDelimiter('Date;Libellé;Montant\n02/11/2026;Pain;-1,50\n')).toBe(';')
    expect(detectDelimiter('Date\tNote\tAmount\n2026-11-02\tBread\t450\n')).toBe('\t')
    expect(detectDelimiter('Date,Note,Amount\n2026-11-02,"a; b",450\n')).toBe(',')
  })

  it('reads amounts as banks and spreadsheets write them', () => {
    expect(parseAmount('1,250.50')).toBe(1250.5)
    expect(parseAmount('1 250,50')).toBe(1250.5)
    expect(parseAmount('1.250,50')).toBe(1250.5)
    expect(parseAmount('12,50')).toBe(12.5)
    expect(parseAmount('60,000')).toBe(60000)
    expect(parseAmount('1,234,567')).toBe(1234567)
    expect(parseAmount('-250')).toBe(-250)
    expect(parseAmount('−250 DA')).toBe(-250)
    expect(parseAmount('(250.00)')).toBe(-250)
    expect(parseAmount('٢٥٠')).toBe(250)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('n/a')).toBeNull()
  })

  it('reads dates year first, day first or month first, and finds which', () => {
    expect(parseDate('2026-11-02', 'dmy')).toBe('2026-11-02')
    expect(parseDate('2026/11/02 14:30', 'dmy')).toBe('2026-11-02')
    expect(parseDate('02/11/2026', 'dmy')).toBe('2026-11-02')
    expect(parseDate('02/11/2026', 'mdy')).toBe('2026-02-11')
    expect(parseDate('2.11.26', 'dmy')).toBe('2026-11-02')
    expect(parseDate('31/02/2026', 'dmy')).toBeNull()
    expect(parseDate('Bread', 'dmy')).toBeNull()
    expect(detectDateFormat(['02/11/2026', '25/11/2026'])).toBe('dmy')
    expect(detectDateFormat(['11/02/2026', '11/25/2026'])).toBe('mdy')
    expect(detectDateFormat(['2026-11-02'])).toBe('ymd')
    expect(detectDateFormat(['2026-11-02', 'someday', ''])).toBe('ymd')
  })

  it('matches columns by their names, in English, French and Arabic', () => {
    expect(guessMapping(['Date', 'Description', 'Debit', 'Credit'])).toMatchObject({ date: 0, note: 1, out: 2, in: 3, amount: null })
    expect(guessMapping(['Date', 'Libellé', 'Montant', 'Catégorie'])).toMatchObject({ date: 0, note: 1, amount: 2, category: 3 })
    expect(guessMapping(['التاريخ', 'المبلغ', 'الوصف'])).toMatchObject({ date: 0, amount: 1, note: 2 })
    expect(looksLikeHeader(['Date', 'Amount'])).toBe(true)
    expect(looksLikeHeader(['2026-11-02', '450'])).toBe(false)
  })

  it('guesses that mostly negative amounts are a bank statement, where money in is positive', () => {
    expect(guessPositiveIs(['-450', '-1200', '60000'])).toBe('income')
    expect(guessPositiveIs(['450', '1200', '-100'])).toBe('expense')
  })
})

const base = (): ImportOptions => ({
  mapping: { date: 0, amount: 1, out: null, in: null, type: null, category: null, note: 2, wallet: null },
  dateFormat: 'ymd',
  positiveIs: 'expense',
  accountId: 'acc-cash',
  categories: {},
  skipDuplicates: true,
})

describe('turning rows into entries', () => {
  const data = createInitialData(new Date(2026, 10, 1))

  it('reads a signed amount either way round, and leaves out what it cannot read', () => {
    const rows = [
      ['2026-11-02', '450', 'Bread'],
      ['2026-11-03', '-60000', 'Salary'],
      ['soon', '100', 'No date'],
      ['2026-11-04', '', 'No amount'],
    ]
    const built = buildImport(rows, base(), data, 2)
    expect(built[0].entry).toMatchObject({ type: 'expense', amount: 450, categoryId: 'cat-other', note: 'Bread', accountId: 'acc-cash' })
    expect(built[1].entry).toMatchObject({ type: 'income', amount: 60000, categoryId: 'inc-other' })
    expect(built.slice(2).map((r) => [r.line, r.skipped])).toEqual([
      [4, 'date'],
      [5, 'amount'],
    ])
    // A bank statement: money in is positive.
    expect(buildImport(rows.slice(0, 1), { ...base(), positiveIs: 'income' }, data)[0].entry?.type).toBe('income')
  })

  it('reads separate money out and money in columns, a type column, categories and wallets', () => {
    const mapping = { date: 0, amount: null, out: 1, in: 2, type: null, category: 3, note: 4, wallet: 5 }
    const rows = [
      ['2026-11-02', '1200', '', 'Food', 'Market', 'Bank card'],
      ['2026-11-03', '', '5000', 'Gift', 'From Sami', 'Nowhere'],
    ]
    const names = categoryNames(rows, mapping, data)
    expect(names.map((n) => n.name)).toEqual(['Food', 'Gift'])
    const built = buildImport(rows, { ...base(), mapping, categories: { food: 'cat-groceries', gift: 'cat-groceries' } }, data)
    expect(built[0].entry).toMatchObject({ type: 'expense', amount: 1200, categoryId: 'cat-groceries', accountId: 'acc-bank' })
    // An expense category can't hold income: it falls back, and an unknown wallet gives the chosen one.
    expect(built[1].entry).toMatchObject({ type: 'income', amount: 5000, categoryId: 'inc-other', accountId: 'acc-cash' })

    const typed = buildImport([['2026-11-02', '300', 'Refund', 'x']], { ...base(), mapping: { ...base().mapping, type: 2, note: 3 } }, data)
    expect(typed[0].entry?.type).toBe('refund')
    const transfer = buildImport([['2026-11-02', '300', 'transfer', 'x']], { ...base(), mapping: { ...base().mapping, type: 2, note: 3 } }, data)
    expect(transfer[0].skipped).toBe('kind')
  })

  it('leaves out entries already in the app, but keeps the same line twice in the file', () => {
    const withBread = { ...data, transactions: [{ id: 'x', createdAt: '', updatedAt: '', type: 'expense' as const, amount: 450, date: '2026-11-02', accountId: 'acc-cash', categoryId: 'cat-groceries', note: 'bread' }] }
    const rows = [
      ['2026-11-02', '450', 'Bread'],
      ['2026-11-05', '250', 'Coffee'],
      ['2026-11-05', '250', 'Coffee'],
    ]
    const built = buildImport(rows, base(), withBread)
    expect(built.map((r) => r.skipped ?? 'ok')).toEqual(['duplicate', 'ok', 'ok'])
    expect(importTotals(built)).toMatchObject({ count: 2, spent: 500, received: 0, first: '2026-11-05', skipped: { duplicate: 1 } })
    expect(buildImport(rows, { ...base(), skipDuplicates: false }, withBread).every((r) => !r.skipped)).toBe(true)
  })

  it('reads back its own CSV export, leaving out transfers', () => {
    const example = previewExample()
    const table = parseCsv(transactionsToCsv(example))
    expect(looksLikeHeader(table[0])).toBe(true)
    const mapping = guessMapping(table[0])
    expect(mapping).toMatchObject({ date: 0, type: 1, amount: 2, category: 4, wallet: 5 })
    const names = categoryNames(table.slice(1), mapping, example)
    const categories = Object.fromEntries(names.filter((n) => n.match).map((n) => [n.key, n.match!]))
    const built = buildImport(table.slice(1), { ...base(), mapping, dateFormat: 'ymd', categories, skipDuplicates: false }, { ...example, transactions: [] })
    const kept = live(example.transactions).filter((t) => t.type === 'expense' || t.type === 'income' || t.type === 'refund')
    expect(built.filter((r) => r.entry).length).toBe(kept.length)
    expect(built.some((r) => r.skipped === 'kind')).toBe(true)
    const coffee = built.find((r) => r.entry?.note === 'Coffee')!.entry!
    expect(coffee.categoryId).toBe(kept.find((t) => t.note === 'Coffee')!.categoryId)
  })
})

function memoryStorage(): StateStorage {
  const saved = new Map<string, string>()
  return { getItem: (name) => saved.get(name) ?? null, setItem: (name, value) => void saved.set(name, value), removeItem: (name) => void saved.delete(name) }
}

describe('importing into the store', () => {
  it('adds every entry in one go, and Undo takes them all back', async () => {
    const store = createAppStore(memoryStorage())
    await whenHydrated(store)
    const { count, undo } = store.getState().importTransactions([
      { type: 'expense', amount: 450, date: '2026-10-02', accountId: 'acc-cash', categoryId: 'cat-groceries', note: 'Bread' },
      { type: 'income', amount: 60000, date: '2026-10-25', accountId: 'acc-bank', categoryId: 'inc-other' },
    ])
    expect(count).toBe(2)
    expect(live(store.getState().transactions)).toHaveLength(2)
    undo()
    expect(live(store.getState().transactions)).toHaveLength(0)
    expect(() => store.getState().importTransactions([{ type: 'expense', amount: 0, date: '2026-10-02', accountId: 'acc-cash', categoryId: 'cat-groceries' }])).toThrow()
    expect(live(store.getState().transactions)).toHaveLength(0)
  })
})
