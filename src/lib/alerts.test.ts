import { describe, expect, it } from 'vitest'
import { PREVIEW_TODAY, previewExample } from '../test/previewExample'
import { homeAlerts, isBigPurchase, newBudgetAlerts } from './alerts'
import { budgetSummary } from './budget'

describe('homeAlerts', () => {
  it('matches the Home mockup: Shopping over, Eating out near, Internet due', () => {
    expect(homeAlerts(previewExample(), PREVIEW_TODAY)).toEqual([
      { id: 'over-cat-shopping', tone: 'crit', kind: 'category-over', categoryId: 'cat-shopping', overBy: 400 },
      { id: 'near-cat-eating-out', tone: 'warn', kind: 'category-near', categoryId: 'cat-eating-out', percent: 92 },
      { id: 'bill-bill-internet-2026-11-17', tone: 'info', kind: 'bill-due', billId: 'bill-internet', dueDate: '2026-11-17', amount: 2_000 },
    ])
  })

  it('keeps bills when budget alerts are switched off', () => {
    const data = previewExample()
    data.settings = { ...data.settings, alerts: { ...data.settings.alerts, enabled: false } }
    expect(homeAlerts(data, PREVIEW_TODAY).map((a) => a.kind)).toEqual(['bill-due'])
  })

  it('shows an overdue bill first', () => {
    expect(homeAlerts(previewExample(), '2026-11-19')[0]).toMatchObject({ kind: 'bill-overdue', tone: 'crit', billId: 'bill-internet' })
  })

  it('warns about the whole budget, and about pace only before that', () => {
    const data = previewExample()
    const spend = (amount: number, date: string) =>
      data.transactions.push({ id: `x-${date}-${amount}`, createdAt: '', updatedAt: '', type: 'expense', amount, date, accountId: 'acc-cash', categoryId: 'cat-travel' })

    // 6 days in (19%), 26,100 of 35,800 used (73%): far ahead of pace.
    const early = homeAlerts(data, '2026-10-30').filter((a) => a.kind === 'too-fast' || a.kind.startsWith('budget'))
    expect(early).toEqual([{ id: 'too-fast', tone: 'warn', kind: 'too-fast', usedPercent: 73, elapsedPercent: 19 }])

    spend(3_000, '2026-11-14')
    expect(homeAlerts(data, PREVIEW_TODAY).find((a) => a.kind.startsWith('budget'))).toMatchObject({ kind: 'budget-near', percent: 81 })

    spend(8_000, '2026-11-14')
    expect(homeAlerts(data, PREVIEW_TODAY).find((a) => a.kind.startsWith('budget'))).toMatchObject({ kind: 'budget-over', overBy: 1_300 })
  })
})

describe('more Home cards', () => {
  it('asks for a cash count a week after the last one, and before the first', () => {
    const data = previewExample()
    expect(homeAlerts(data, '2026-11-19').find((a) => a.kind === 'cash-check')).toMatchObject({ accountId: 'acc-cash', daysSince: 7 })
    data.accounts = data.accounts.map((a) => ({ ...a, lastCountedAt: undefined }))
    expect(homeAlerts(data, PREVIEW_TODAY).find((a) => a.kind === 'cash-check')).toMatchObject({ daysSince: null })
    data.settings = { ...data.settings, cashCheck: { enabled: false } }
    expect(homeAlerts(data, PREVIEW_TODAY).some((a) => a.kind === 'cash-check')).toBe(false)
  })

  it('points to wishlist items whose cooling-off time is up', () => {
    const data = previewExample()
    const item = { createdAt: '', updatedAt: '', price: 8_900, status: 'thinking' as const }
    data.wishlist = [
      { ...item, id: 'w1', name: 'Earbuds', remindAt: '2026-11-14T20:00:00.000Z' },
      { ...item, id: 'w2', name: 'Lamp', remindAt: '2026-11-15T08:00:00.000Z' },
      { ...item, id: 'w3', name: 'Later', remindAt: '2026-11-20T08:00:00.000Z' },
    ]
    expect(homeAlerts(data, PREVIEW_TODAY, new Date('2026-11-15T12:00:00.000Z')).at(-1)).toEqual({
      id: 'wishlist-ready',
      tone: 'info',
      kind: 'wishlist-ready',
      count: 2,
      name: 'Earbuds',
    })
  })
})

describe('after adding an expense', () => {
  const summaryWith = (extra: number) => {
    const data = previewExample()
    if (extra) data.transactions.push({ id: 'new', createdAt: '', updatedAt: '', type: 'expense', amount: extra, date: PREVIEW_TODAY, accountId: 'acc-cash', categoryId: 'cat-eating-out' })
    return budgetSummary(data, PREVIEW_TODAY)
  }

  it('reports only limits that were just crossed', () => {
    // Eating out 4,600 of 5,000 (near) → +500 goes over; Shopping was already over.
    expect(newBudgetAlerts(summaryWith(0), summaryWith(500), 80)).toEqual([
      { id: 'over-cat-eating-out', tone: 'crit', kind: 'category-over', categoryId: 'cat-eating-out', overBy: 100 },
    ])
    expect(newBudgetAlerts(summaryWith(0), summaryWith(100), 80)).toEqual([])
    // 26,100 + 2,700 = 28,800 of 35,800: the whole budget passes 80%.
    expect(newBudgetAlerts(summaryWith(0), summaryWith(2_700), 80).map((a) => a.kind)).toEqual(['category-over', 'budget-near'])
  })

  it('treats 10% of the salary or more as a big purchase', () => {
    expect(isBigPurchase(6_000, 60_000, 10)).toBe(true)
    expect(isBigPurchase(5_999, 60_000, 10)).toBe(false)
    expect(isBigPurchase(6_000, 0, 10)).toBe(false)
  })
})
