import { t } from '../i18n'
import type { Profile, Salary, WorkSchedule } from '../types'
import { formatNumber, roundMoney } from './money'

export const WEEKS_PER_MONTH = 52 / 12

/** Salary converted to a monthly amount (biweekly × 26/12, weekly × 52/12). Irregular pay's amount is already a monthly estimate. */
export function monthlySalary(salary: Pick<Salary, 'amount' | 'frequency'>): number {
  // Multiply before dividing: 15,000 × (52/12) gives 64,999.999…
  switch (salary.frequency) {
    case 'monthly':
    case 'irregular':
      return salary.amount
    case 'biweekly':
      return roundMoney((salary.amount * 26) / 12)
    case 'weekly':
      return roundMoney((salary.amount * 52) / 12)
  }
}

export function monthlyWorkHours(work: WorkSchedule): number {
  return work.hoursPerDay * work.daysPerWeek * WEEKS_PER_MONTH
}

/**
 * What one hour of work earns. With the `after-bills` basis, fixed bills are
 * taken off first, so purchases look more expensive. `null` until salary and
 * working hours are set.
 */
export function hourlyRate(profile: Pick<Profile, 'salary' | 'work' | 'hourlyRateBasis'>, monthlyBills = 0): number | null {
  const hours = monthlyWorkHours(profile.work)
  const income = monthlySalary(profile.salary) - (profile.hourlyRateBasis === 'after-bills' ? monthlyBills : 0)
  if (hours <= 0 || income <= 0) return null
  return income / hours
}

export interface WorkTime {
  totalHours: number
  hours: number
  minutes: number
  workDays: number
}

/** How long you work to earn `price`, rounded to the minute. */
export function workTimeFor(price: number, rate: number, hoursPerDay: number): WorkTime {
  const totalHours = price / rate
  const totalMinutes = Math.round(totalHours * 60)
  return {
    totalHours,
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    workDays: hoursPerDay > 0 ? totalHours / hoursPerDay : 0,
  }
}

/** `25 h 43 min`, `45 min`, `3 h`. */
export function formatWorkTime(time: Pick<WorkTime, 'hours' | 'minutes'>): string {
  if (time.hours === 0) return t.format.minutes(time.minutes)
  const hours = t.format.hours(formatNumber(time.hours))
  if (time.minutes === 0) return hours
  return `${hours} ${t.format.minutes(time.minutes)}`
}
