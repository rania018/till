import { describe, expect, it } from 'vitest'
import { NEVER } from '../lib/id'
import { createInitialData } from '../store/defaults'
import type { Debt, Transaction } from '../types'
import { dirtyDocs, mergeDocs, restoredData, type SyncDoc, type SyncedData } from './records'

const NOW = '2026-11-03T10:00:00.000Z'

function data(): SyncedData {
  return createInitialData(new Date(NOW))
}

const expense = (id: string, updatedAt: string, amount = 100): Transaction => ({
  id,
  type: 'expense',
  amount,
  date: '2026-11-03',
  accountId: 'acc-cash',
  categoryId: 'cat-other',
  createdAt: updatedAt,
  updatedAt,
})

const doc = (t: Transaction): SyncDoc => ({ id: `transactions:${t.id}`, kind: 'transactions', updatedAt: t.updatedAt, json: JSON.stringify(t), schema: 1 })

describe('a fresh install', () => {
  it('stamps its built-in records as never changed', () => {
    const fresh = data()
    expect(fresh.accounts.every((a) => a.updatedAt === NEVER)).toBe(true)
    expect(fresh.categories.every((c) => c.updatedAt === NEVER)).toBe(true)
  })
})

describe('dirtyDocs', () => {
  it('lists everything when nothing is known to be online', () => {
    const fresh = data()
    const docs = dirtyDocs(fresh, {})
    expect(docs).toHaveLength(2 + fresh.accounts.length + fresh.categories.length)
    expect(docs.map((d) => d.id)).toContain('profile')
    expect(docs.map((d) => d.id)).toContain('accounts:acc-cash')
  })

  it('lists only what differs from what’s online', () => {
    const local = { ...data(), transactions: [expense('a', NOW), expense('b', NOW)] }
    const seen = Object.fromEntries(dirtyDocs(local, {}).map((d) => [d.id, d.updatedAt]))
    expect(dirtyDocs(local, seen)).toEqual([])
    const edited = { ...local, transactions: [expense('a', '2026-11-03T11:00:00.000Z'), expense('b', NOW)] }
    expect(dirtyDocs(edited, seen).map((d) => d.id)).toEqual(['transactions:a'])
  })
})

describe('mergeDocs', () => {
  const OLDER = '2026-11-01T00:00:00.000Z'
  const NEWER = '2026-11-05T00:00:00.000Z'

  it('adds records it doesn’t have', () => {
    const { data: merged, changed } = mergeDocs(data(), [doc(expense('a', OLDER))])
    expect(changed).toBe(true)
    expect(merged.transactions.map((t) => t.id)).toEqual(['a'])
  })

  it('takes a newer record and keeps a newer local one', () => {
    const local = { ...data(), transactions: [expense('a', NOW, 1), expense('b', NOW, 2)] }
    const { data: merged } = mergeDocs(local, [doc(expense('a', NEWER, 10)), doc(expense('b', OLDER, 20))])
    expect(merged.transactions.map((t) => t.amount)).toEqual([10, 2])
  })

  it('reports no change when the online copy is the same, and keeps the same list', () => {
    const local = { ...data(), transactions: [expense('a', NOW)] }
    const { data: merged, changed } = mergeDocs(local, [doc(expense('a', NOW))])
    expect(changed).toBe(false)
    expect(merged.transactions).toBe(local.transactions)
  })

  it('settles an exact tie on the online copy, so every device ends up the same', () => {
    const local = { ...data(), transactions: [expense('a', NOW, 1)] }
    const { data: merged } = mergeDocs(local, [doc(expense('a', NOW, 2))])
    expect(merged.transactions[0].amount).toBe(2)
  })

  it('merges a deletion like any other change', () => {
    const local = { ...data(), transactions: [expense('a', NOW)] }
    const { data: merged } = mergeDocs(local, [doc({ ...expense('a', NEWER), deleted: true })])
    expect(merged.transactions[0].deleted).toBe(true)
  })

  it('skips damaged documents', () => {
    const local = data()
    const broken: SyncDoc[] = [
      { id: 'transactions:x', kind: 'transactions', updatedAt: NEWER, json: 'not json', schema: 1 },
      { ...doc(expense('y', NEWER)), json: JSON.stringify({ id: 'y', updatedAt: NEWER, amount: 'lots' }) },
      { id: 'profile', kind: 'profile', updatedAt: NEWER, json: '{"name":"no salary"}', schema: 1 },
      { id: 'settings', kind: 'settings', updatedAt: NEWER, json: 'null', schema: 1 },
    ]
    const { data: merged, changed } = mergeDocs(local, broken)
    expect(changed).toBe(false)
    expect(merged).toEqual(local)
  })

  it('fills in settings an older device didn’t know about', () => {
    const local = data()
    // JSON leaves out undefined, as if this setting didn't exist yet.
    const json = JSON.stringify({ ...local.settings, coolingOffHours: undefined, theme: 'dark', updatedAt: NEWER })
    const { data: merged } = mergeDocs(local, [{ id: 'settings', kind: 'settings', updatedAt: NEWER, json, schema: 1 }])
    expect(merged.settings.theme).toBe('dark')
    expect(merged.settings.coolingOffHours).toBe(local.settings.coolingOffHours)
  })

  describe('the profile', () => {
    const profileDoc = (local: SyncedData, patch: object, updatedAt: string): SyncDoc => ({
      id: 'profile',
      kind: 'profile',
      updatedAt,
      json: JSON.stringify({ ...local.profile, ...patch, updatedAt }),
      schema: 1,
    })

    it('takes a finished setup over an unfinished one, even an older one', () => {
      const local = { ...data(), profile: { ...data().profile, name: 'Typing', updatedAt: NEWER } }
      const { data: merged } = mergeDocs(local, [profileDoc(local, { name: 'Real', onboardingCompleted: true }, OLDER)])
      expect(merged.profile).toMatchObject({ name: 'Real', onboardingCompleted: true })
    })

    it('keeps a finished setup over a newer unfinished one', () => {
      const local = { ...data(), profile: { ...data().profile, name: 'Real', onboardingCompleted: true, updatedAt: OLDER } }
      const { data: merged, changed } = mergeDocs(local, [profileDoc(local, { name: 'Typing', onboardingCompleted: false }, NEWER)])
      expect(changed).toBe(false)
      expect(merged.profile.name).toBe('Real')
    })

    it('uses the later edit when both are finished', () => {
      const local = { ...data(), profile: { ...data().profile, name: 'Old', onboardingCompleted: true, updatedAt: OLDER } }
      const { data: merged } = mergeDocs(local, [profileDoc(local, { name: 'New' }, NEWER)])
      expect(merged.profile.name).toBe('New')
    })

    it('treats a profile saved before stamps existed as older than any change', () => {
      const local = { ...data(), profile: { ...data().profile, name: 'No stamp', onboardingCompleted: true } }
      const { data: merged } = mergeDocs(local, [profileDoc(local, { name: 'Stamped' }, OLDER)])
      expect(merged.profile.name).toBe('Stamped')
    })
  })
})

describe('restoredData', () => {
  it('stamps restored records as changed now and deletes what the backup doesn’t have', () => {
    const backup = { ...createInitialData(new Date(NOW)), transactions: [expense('kept', '2026-01-01T00:00:00.000Z')] }
    const current = { ...data(), transactions: [expense('kept', '2026-10-01T00:00:00.000Z', 999), expense('later', '2026-10-02T00:00:00.000Z')] }
    const restored = restoredData(current, backup, NOW)

    expect(restored.transactions.find((t) => t.id === 'kept')).toMatchObject({ amount: 100, updatedAt: NOW })
    expect(restored.transactions.find((t) => t.id === 'later')).toMatchObject({ deleted: true, updatedAt: NOW })
    expect(restored.profile.updatedAt).toBe(NOW)
    expect(restored.settings.updatedAt).toBe(NOW)
    expect(restored.accounts.every((a) => a.updatedAt === NOW)).toBe(true)
  })
})

describe('debts', () => {
  const debt = (updatedAt: string, person = 'Sami'): Debt => ({ id: 'd1', createdAt: updatedAt, updatedAt, direction: 'lent', person, startingAmount: 0, date: '2026-11-03', archived: false })
  const debtDoc = (d: Debt): SyncDoc => ({ id: `debts:${d.id}`, kind: 'debts', updatedAt: d.updatedAt, json: JSON.stringify(d), schema: 2 })

  it('go online like any other record', () => {
    const local = { ...data(), debts: [debt(NOW)] }
    expect(dirtyDocs(local, {}).map((d) => d.id)).toContain('debts:d1')
  })

  it('merge by last write', () => {
    const local = { ...data(), debts: [debt('2026-11-03T09:00:00.000Z', 'Old')] }
    const merged = mergeDocs(local, [debtDoc(debt(NOW, 'New'))]).data
    expect(merged.debts[0].person).toBe('New')
  })

  it('keep their entries when merged', () => {
    const entry: Transaction = { id: 'dm1', type: 'debt-out', amount: 500, date: '2026-11-03', accountId: 'acc-cash', debtId: 'd1', createdAt: NOW, updatedAt: NOW }
    const merged = mergeDocs(data(), [debtDoc(debt(NOW)), doc(entry)]).data
    expect(merged.transactions).toEqual([entry])
    expect(merged.debts).toHaveLength(1)
  })

  it('are removed by restoring a backup that doesn’t have them', () => {
    const current = { ...data(), debts: [debt('2026-11-01T00:00:00.000Z')] }
    const backup = { ...createInitialData(new Date(NOW)) }
    const restored = restoredData(current, backup, NOW)
    expect(restored.debts).toMatchObject([{ id: 'd1', deleted: true, updatedAt: NOW }])
  })
})
