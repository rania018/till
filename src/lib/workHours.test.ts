import { describe, expect, it } from 'vitest'
import type { Profile } from '../types'
import { formatMoney, sumAmounts } from './money'
import { formatWorkTime, hourlyRate, monthlySalary, monthlyWorkHours, workTimeFor } from './workHours'

const profile = {
  salary: { amount: 60_000, frequency: 'monthly', payday: 25, accountId: 'acc-bank' },
  work: { hoursPerDay: 8, daysPerWeek: 5 },
  hourlyRateBasis: 'net-salary',
} satisfies Pick<Profile, 'salary' | 'work' | 'hourlyRateBasis'>

describe('salary and hours', () => {
  it('converts weekly and biweekly pay to a monthly amount', () => {
    expect(monthlySalary({ amount: 30_000, frequency: 'biweekly' })).toBe(65_000)
    expect(monthlySalary({ amount: 15_000, frequency: 'weekly' })).toBe(65_000)
  })

  it('works about 173 hours a month at 8 hours × 5 days', () => {
    expect(monthlyWorkHours(profile.work)).toBeCloseTo(173.33, 2)
  })
})

describe('hourlyRate', () => {
  it('divides net salary by monthly hours', () => {
    expect(hourlyRate(profile)).toBeCloseTo(346.15, 2)
  })

  it('takes bills off first with the after-bills basis', () => {
    expect(hourlyRate({ ...profile, hourlyRateBasis: 'after-bills' }, 14_200)).toBeCloseTo(264.23, 2)
  })

  it('is null until salary and hours are set', () => {
    expect(hourlyRate({ ...profile, work: { hoursPerDay: 0, daysPerWeek: 5 } })).toBeNull()
    expect(hourlyRate({ ...profile, salary: { ...profile.salary, amount: 0 } })).toBeNull()
    expect(hourlyRate({ ...profile, hourlyRateBasis: 'after-bills' }, 70_000)).toBeNull()
  })
})

describe('workTimeFor and formatWorkTime', () => {
  const rate = hourlyRate(profile)!

  it('rounds to the minute and counts work days', () => {
    expect(workTimeFor(8_900, rate, 8)).toMatchObject({ hours: 25, minutes: 43 })
    expect(workTimeFor(8_900, rate, 8).workDays).toBeCloseTo(3.21, 2)
  })

  it('formats short and round durations', () => {
    expect(formatWorkTime({ hours: 0, minutes: 45 })).toBe('45 min')
    expect(formatWorkTime({ hours: 3, minutes: 0 })).toBe('3 h')
    expect(formatWorkTime(workTimeFor(250, rate, 8))).toBe('43 min')
  })
})

describe('formatMoney', () => {
  it('formats DA with thousands separators', () => {
    expect(formatMoney(1_450)).toBe('1,450 DA')
    expect(formatMoney(99.5)).toBe('100 DA')
    expect(formatMoney(10, 'EUR')).toBe('10 EUR')
  })

  it('uses a real minus sign, and a plus only when asked', () => {
    expect(formatMoney(-250)).toBe('−250 DA')
    expect(formatMoney(5_000, 'DZD', { signed: true })).toBe('+5,000 DA')
    expect(formatMoney(0, 'DZD', { signed: true })).toBe('0 DA')
  })

  it('adds decimals without floating-point drift', () => {
    expect(sumAmounts([0.1, 0.2])).toBe(0.3)
  })
})
