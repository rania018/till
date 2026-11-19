import { describe, expect, it } from 'vitest'
import { cycleProgress, getPayCycle, monthShare, nextCycle, nthPayday, paydaysUntil, planMonth, previousCycle, recentCycles, toISODate, weekEndingOn } from './dates'

const monthly = (payday: number) => ({ frequency: 'monthly' as const, payday })

describe('getPayCycle', () => {
  it('runs from payday to the day before the next payday', () => {
    expect(getPayCycle('2026-11-15', monthly(25))).toEqual({ start: '2026-10-25', end: '2026-11-24', days: 31 })
  })

  it('starts a new cycle on payday itself', () => {
    expect(getPayCycle('2026-11-25', monthly(25))).toEqual({ start: '2026-11-25', end: '2026-12-24', days: 30 })
    expect(getPayCycle('2026-11-24', monthly(25)).start).toBe('2026-10-25')
  })

  it('crosses the new year', () => {
    expect(getPayCycle('2027-01-10', monthly(25))).toEqual({ start: '2026-12-25', end: '2027-01-24', days: 31 })
  })

  it('moves a payday on the 31st to the last day of short months', () => {
    expect(getPayCycle('2027-02-15', monthly(31))).toEqual({ start: '2027-01-31', end: '2027-02-27', days: 28 })
    expect(getPayCycle('2027-02-28', monthly(31))).toEqual({ start: '2027-02-28', end: '2027-03-30', days: 31 })
  })

  it('handles 29 February in leap years', () => {
    expect(getPayCycle('2028-03-10', monthly(30))).toEqual({ start: '2028-02-29', end: '2028-03-29', days: 30 })
  })

  it('is the calendar month when payday is the 1st', () => {
    expect(getPayCycle('2026-11-15', monthly(1))).toEqual({ start: '2026-11-01', end: '2026-11-30', days: 30 })
  })

  it('runs weekly and biweekly cycles from a payday, before and after it', () => {
    const weekly = { frequency: 'weekly', payday: 1, anchor: '2026-11-03' } as const
    expect(getPayCycle('2026-11-03', weekly)).toEqual({ start: '2026-11-03', end: '2026-11-09', days: 7 })
    expect(getPayCycle('2026-11-09', weekly).start).toBe('2026-11-03')
    expect(getPayCycle('2026-11-10', weekly).start).toBe('2026-11-10')
    expect(getPayCycle('2026-10-31', weekly)).toEqual({ start: '2026-10-27', end: '2026-11-02', days: 7 })
    const biweekly = { ...weekly, frequency: 'biweekly' } as const
    expect(getPayCycle('2026-11-16', biweekly)).toEqual({ start: '2026-11-03', end: '2026-11-16', days: 14 })
    expect(getPayCycle('2026-11-17', biweekly).start).toBe('2026-11-17')
    // Across the change of clocks, a year away: still whole days.
    expect(getPayCycle('2027-11-10', weekly).days).toBe(7)
  })

  it('moves weekly cycles along one at a time', () => {
    const weekly = { frequency: 'weekly', payday: 1, anchor: '2026-11-03' } as const
    const cycle = getPayCycle('2026-11-05', weekly)
    expect(previousCycle(cycle, weekly).start).toBe('2026-10-27')
    expect(nextCycle(cycle, weekly).start).toBe('2026-11-10')
    expect(recentCycles('2026-11-05', weekly, 3).map((c) => c.start)).toEqual(['2026-10-20', '2026-10-27', '2026-11-03'])
  })

  it('keeps monthly plans on calendar months with weekly pay, and on the pay cycle otherwise', () => {
    const weekly = { frequency: 'weekly', payday: 25, anchor: '2026-11-03' } as const
    expect(planMonth('2026-11-15', weekly)).toEqual({ start: '2026-11-01', end: '2026-11-30', days: 30 })
    expect(planMonth('2026-11-15', { frequency: 'monthly', payday: 25 }).start).toBe('2026-10-25')
    expect(planMonth('2026-11-15', { frequency: 'irregular', payday: 10 }).start).toBe('2026-11-10')
  })

  it('shares a month out over short cycles only', () => {
    expect(monthShare({ days: 7 })).toBeCloseTo(12 / 52)
    expect(monthShare({ days: 14 })).toBeCloseTo(12 / 26)
    expect(monthShare({ days: 28 })).toBe(1)
    expect(monthShare({ days: 31 })).toBe(1)
  })

  it('forecasts goals by the month whatever the pay', () => {
    const weekly = { frequency: 'weekly', payday: 25, anchor: '2026-11-03' } as const
    expect(nthPayday('2026-11-15', weekly, 2)).toBe('2027-01-01')
    expect(paydaysUntil('2026-11-15', '2027-01-01', weekly)).toBe(2)
  })

  it('uses calendar months for weekly and biweekly pay with no date yet', () => {
    expect(getPayCycle('2026-11-15', { frequency: 'weekly', payday: 25 })).toEqual({ start: '2026-11-01', end: '2026-11-30', days: 30 })
    expect(getPayCycle('2026-11-15', { frequency: 'biweekly', payday: 25 }).start).toBe('2026-11-01')
  })
})

describe('moving between cycles', () => {
  const cycle = getPayCycle('2026-11-15', monthly(25))

  it('finds the previous and next cycles', () => {
    expect(previousCycle(cycle, monthly(25))).toEqual({ start: '2026-09-25', end: '2026-10-24', days: 30 })
    expect(nextCycle(cycle, monthly(25))).toEqual({ start: '2026-11-25', end: '2026-12-24', days: 30 })
  })

  it('lists recent cycles oldest first', () => {
    expect(recentCycles('2026-11-15', monthly(25), 3).map((c) => c.start)).toEqual(['2026-08-25', '2026-09-25', '2026-10-25'])
  })
})

describe('paydays ahead', () => {
  it('counts the n-th payday from the next one', () => {
    expect(nthPayday('2026-11-02', monthly(15), 1)).toBe('2026-11-15')
    expect(nthPayday('2026-11-02', monthly(15), 5)).toBe('2027-03-15')
    // On payday itself, the next one is a month away.
    expect(nthPayday('2026-11-15', monthly(15), 1)).toBe('2026-12-15')
    expect(nthPayday('2027-01-31', monthly(31), 1)).toBe('2027-02-28')
    expect(nthPayday('2026-11-15', { frequency: 'weekly', payday: 25 }, 2)).toBe('2027-01-01')
  })

  it('counts the paydays on or before a deadline', () => {
    expect(paydaysUntil('2026-11-02', '2027-04-15', monthly(15))).toBe(6)
    expect(paydaysUntil('2026-11-02', '2027-04-14', monthly(15))).toBe(5)
    expect(paydaysUntil('2026-11-02', '2026-11-15', monthly(15))).toBe(1)
    expect(paydaysUntil('2026-11-02', '2026-11-14', monthly(15))).toBe(0)
    expect(paydaysUntil('2026-11-02', '2026-11-01', monthly(15))).toBe(0)
    expect(paydaysUntil('2026-10-31', '2027-06-30', monthly(25))).toBe(8)
  })
})

describe('cycleProgress', () => {
  const cycle = getPayCycle('2026-11-15', monthly(25))

  it('counts today as gone', () => {
    expect(cycleProgress(cycle, '2026-10-25')).toEqual({ dayNumber: 1, daysLeft: 31, elapsedRatio: 1 / 31 })
    expect(cycleProgress(cycle, '2026-11-24')).toEqual({ dayNumber: 31, daysLeft: 1, elapsedRatio: 1 })
  })

  it('handles dates outside the cycle', () => {
    expect(cycleProgress(cycle, '2026-10-01')).toEqual({ dayNumber: 0, daysLeft: 31, elapsedRatio: 0 })
    expect(cycleProgress(cycle, '2026-12-01')).toEqual({ dayNumber: 31, daysLeft: 0, elapsedRatio: 1 })
  })
})

describe('weekEndingOn', () => {
  it('gives the Sunday–Saturday week for a Saturday reminder', () => {
    expect(weekEndingOn('2026-10-28', 6)).toEqual({ start: '2026-10-25', end: '2026-10-31' })
    expect(weekEndingOn('2026-10-31', 6)).toEqual({ start: '2026-10-25', end: '2026-10-31' })
    expect(weekEndingOn('2026-11-01', 6)).toEqual({ start: '2026-11-01', end: '2026-11-07' })
  })
})

describe('toISODate', () => {
  it('keeps the local day late in the evening', () => {
    expect(toISODate(new Date(2026, 10, 15, 23, 30))).toBe('2026-11-15')
  })
})
