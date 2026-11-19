import { describe, expect, it } from 'vitest'
import type { WishlistItem } from '../types'
import { PREVIEW_TODAY, previewExample } from '../test/previewExample'
import { formatWorkTime } from './workHours'
import { remindAt, wishlistReady, worthItCheck } from './worthIt'

describe('worthItCheck', () => {
  it('matches the mockup: 8,900 DA earbuds', () => {
    const check = worthItCheck(8_900, 'cat-shopping', previewExample(), PREVIEW_TODAY)
    expect(formatWorkTime(check.work!)).toBe('25 h 43 min')
    expect(check.work!.workDays).toBeCloseTo(3.2, 1)
    expect(Math.round(check.salaryShare! * 100)).toBe(15)
    expect(check.budget).toEqual({ kind: 'already-over', overBy: 400 })
    expect(check.goal).toMatchObject({ goal: { name: 'Laptop' }, days: 54 })
  })

  it('says whether it fits what is left, or goes over', () => {
    const data = previewExample()
    // Groceries: 12,000 of 16,000 spent, 4,000 left.
    expect(worthItCheck(1_000, 'cat-groceries', data, PREVIEW_TODAY).budget).toEqual({ kind: 'fits', remaining: 4_000, share: 0.25 })
    expect(worthItCheck(5_500, 'cat-groceries', data, PREVIEW_TODAY).budget).toEqual({ kind: 'goes-over', overBy: 1_500 })
    expect(worthItCheck(500, 'cat-travel', data, PREVIEW_TODAY).budget).toBeNull()
    expect(worthItCheck(500, undefined, data, PREVIEW_TODAY).budget).toBeNull()
  })

  it('prefers the goal with the nearest deadline', () => {
    const data = previewExample()
    data.goals[1] = { ...data.goals[1], deadline: '2027-06-30' }
    expect(worthItCheck(3_000, undefined, data, PREVIEW_TODAY).goal).toMatchObject({ goal: { name: 'Summer trip' }, days: 30 })
  })

  it('has no work time until salary and hours are set', () => {
    const data = previewExample()
    data.profile = { ...data.profile, work: { hoursPerDay: 0, daysPerWeek: 5 } }
    expect(worthItCheck(1_000, undefined, data, PREVIEW_TODAY).work).toBeNull()
  })
})

describe('wishlist reminders', () => {
  const item = (id: string, status: WishlistItem['status'], remind?: string): WishlistItem => ({ id, createdAt: '', updatedAt: '', name: id, price: 100, status, remindAt: remind })

  it('asks again once the cooling-off time is up', () => {
    const now = new Date('2026-11-15T20:00:00.000Z')
    expect(remindAt(now, 48)).toBe('2026-11-17T20:00:00.000Z')
    const list = [item('later', 'thinking', '2026-11-16T00:00:00.000Z'), item('b', 'thinking', '2026-11-15T19:00:00.000Z'), item('a', 'thinking', '2026-11-14T00:00:00.000Z'), item('done', 'skipped', '2026-11-01T00:00:00.000Z')]
    expect(wishlistReady(list, now).map((w) => w.id)).toEqual(['a', 'b'])
  })
})
