import { describe, expect, it } from 'vitest'
import { previewExample } from '../test/previewExample'
import type { AppData } from '../types'
import { BACKUP_APP, BackupError, createBackup, readBackup, transactionsToCsv } from './backup'
import { DEFAULT_SETTINGS } from './defaults'

describe('backups', () => {
  it('restores exactly what was exported', () => {
    const data = previewExample()
    expect(readBackup(createBackup(data))).toEqual(data)
  })

  it('explains why a file can’t be used', () => {
    const backup = JSON.parse(createBackup(previewExample()))
    const read = (value: unknown) => () => readBackup(typeof value === 'string' ? value : JSON.stringify(value))

    expect(read('not json')).toThrow(BackupError)
    expect(read('not json')).toThrow('This file can’t be read.')
    expect(read({ ...backup, app: 'other-app' })).toThrow('isn’t a Till backup')
    expect(read({ ...backup, schemaVersion: 99 })).toThrow('newer version of the app')
    expect(read({ ...backup, schemaVersion: undefined })).toThrow('missing its version number')
  })

  it('rejects damaged data instead of loading part of it', () => {
    const backup = JSON.parse(createBackup(previewExample()))
    delete backup.data.transactions
    expect(() => readBackup(JSON.stringify(backup))).toThrow('the transactions list is missing')

    const badDate = JSON.parse(createBackup(previewExample()))
    badDate.data.transactions[0].date = '2026-02-30'
    expect(() => readBackup(JSON.stringify(badDate))).toThrow('1 transactions have a wrong type, amount, date or wallet')
  })

  it('fills in settings added after the backup was made', () => {
    const backup = JSON.parse(createBackup(previewExample()))
    delete backup.data.settings.alerts
    expect(readBackup(JSON.stringify(backup)).settings.alerts).toEqual(DEFAULT_SETTINGS.alerts)
  })
})

describe('a backup from before debts existed', () => {
  function versionOne() {
    const data: Partial<AppData> = previewExample()
    delete data.debts
    return JSON.stringify({ app: BACKUP_APP, schemaVersion: 1, exportedAt: '2026-11-01T00:00:00.000Z', data })
  }

  it('restores, with no debts', () => {
    const restored = readBackup(versionOne())
    expect(restored.debts).toEqual([])
    expect(restored.transactions.length).toBe(previewExample().transactions.length)
  })

  it('still refuses a backup missing a list it should have', () => {
    const data: Partial<AppData> = previewExample()
    delete data.goals
    expect(() => readBackup(JSON.stringify({ app: BACKUP_APP, schemaVersion: 1, exportedAt: '', data }))).toThrow(BackupError)
  })

  it('refuses debts that aren’t a list', () => {
    expect(() => readBackup(JSON.stringify({ app: BACKUP_APP, schemaVersion: 2, exportedAt: '', data: { ...previewExample(), debts: 'none' } }))).toThrow(BackupError)
  })
})

describe('a backup with debts', () => {
  it('survives a round trip, entries included', () => {
    const data = previewExample()
    data.debts = [{ id: 'd1', createdAt: '', updatedAt: '', direction: 'lent', person: 'Sami', startingAmount: 0, date: '2026-11-01', archived: false }]
    data.transactions = [...data.transactions, { id: 'dm1', createdAt: '', updatedAt: '', type: 'debt-out', amount: 500, date: '2026-11-01', accountId: 'acc-cash', debtId: 'd1' }]
    const restored = readBackup(createBackup(data))
    expect(restored.debts).toEqual(data.debts)
    expect(restored.transactions.find((t) => t.id === 'dm1')?.type).toBe('debt-out')
  })
})

describe('transactionsToCsv', () => {
  it('names who a debt entry was with', () => {
    const data = previewExample()
    data.debts = [{ id: 'd1', createdAt: '', updatedAt: '', direction: 'lent', person: 'Sami', startingAmount: 0, date: '2026-11-20', archived: false }]
    data.transactions = [{ id: 'dm1', createdAt: '', updatedAt: '', type: 'debt-out', amount: 500, date: '2026-11-20', accountId: 'acc-cash', debtId: 'd1' }]
    expect(transactionsToCsv(data).split('\r\n')[1]).toBe('2026-11-20,debt-out,500,DZD,,Cash,,,,,Sami,,,')
  })

  it('writes a header and one row per transaction, oldest first', () => {
    const lines = transactionsToCsv(previewExample()).split('\r\n')
    expect(lines[0]).toBe('Date,Type,Amount,Currency,Category,Wallet,To wallet,Amount arrived,Goal,Paid from the fund,Person,Debt cleared,Note,Tags')
    expect(lines[1]).toBe('2026-10-25,income,60000,DZD,Salary,Bank card,,,,,,,,')
    expect(lines).toContain('2026-11-12,transfer,5000,DZD,,Bank card,Cash,,,,,,,')
    expect(lines).toContain('2026-11-15,expense,250,DZD,Eating out & Coffee,Cash,,,,,,,Coffee,')
  })

  it('says which fund paid an expense, and how much of it', () => {
    const data = previewExample()
    data.goals = [{ id: 'f1', createdAt: '', updatedAt: '', name: 'Ramadan', icon: 'moon', target: 30_000, monthlyContribution: 2_500, archived: false, fund: { repeat: 'hijri-yearly' }, deadline: '2027-02-08' }]
    data.transactions = [{ id: 'e1', createdAt: '', updatedAt: '', type: 'expense', amount: 3_000, date: '2027-02-10', accountId: 'acc-cash', categoryId: 'cat-groceries', goalId: 'f1', fundAmount: 2_000 }]
    expect(transactionsToCsv(data).split('\r\n')[1]).toBe('2027-02-10,expense,3000,DZD,Groceries,Cash,,,Ramadan,2000,,,,')
    // A backup keeps the fund and what it paid.
    const restored = readBackup(createBackup(data))
    expect(restored.goals[0].fund).toEqual({ repeat: 'hijri-yearly' })
    expect(restored.transactions[0].fundAmount).toBe(2_000)
  })

  it('quotes commas and quotes, blocks formulas, and leaves out deleted rows', () => {
    const data = previewExample()
    const base = data.transactions[data.transactions.length - 1]
    data.transactions = [
      { ...base, id: 'a', note: 'Bread, milk and "fresh" eggs' },
      { ...base, id: 'b', note: '=HYPERLINK("x")' },
      { ...base, id: 'c', note: 'deleted', deleted: true },
      { ...base, id: 'd', note: undefined, tags: ['Wedding', 'Gifts'] },
    ]
    const [, first, second, tagged, fourth] = transactionsToCsv(data).split('\r\n')
    expect(first.endsWith('"Bread, milk and ""fresh"" eggs",')).toBe(true)
    expect(second.endsWith(`"'=HYPERLINK(""x"")",`)).toBe(true)
    expect(tagged.endsWith(',"Wedding, Gifts"')).toBe(true)
    expect(fourth).toBeUndefined()
  })
})

describe('a backup from before one-tap items', () => {
  it('restores with none and everything else intact', () => {
    const file = JSON.parse(createBackup(previewExample()))
    delete file.data.quickItems
    file.schemaVersion = 5
    const restored = readBackup(JSON.stringify(file))
    expect(restored.quickItems).toEqual([])
    expect(restored.transactions).toHaveLength(previewExample().transactions.length)
  })

  it('keeps the items a newer backup has', () => {
    const data = previewExample()
    const stamp = { createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z' }
    data.quickItems = [{ id: 'q1', ...stamp, name: 'Coffee', amount: 250, accountId: data.accounts[0].id, categoryId: data.categories.find((c) => c.kind === 'expense')!.id }]
    expect(readBackup(createBackup(data)).quickItems.map((i) => i.name)).toEqual(['Coffee'])
  })
})

describe('a backup from before income sources', () => {
  it('restores with no sources and everything else intact', () => {
    const file = JSON.parse(createBackup(previewExample()))
    delete file.data.incomes
    file.schemaVersion = 4
    const restored = readBackup(JSON.stringify(file))
    expect(restored.incomes).toEqual([])
    expect(restored.transactions).toHaveLength(previewExample().transactions.length)
  })
})
