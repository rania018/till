import { describe, expect, it } from 'vitest'
import { formatAmount, formatMoney } from './money'

describe('formatMoney', () => {
  it('shows dinars whole, even where a monthly share leaves a fraction', () => {
    expect(formatMoney(45_666.66)).toBe('45,667 DA')
    expect(formatMoney(79_000.5)).toBe('79,001 DA')
    expect(formatMoney(1_450)).toBe('1,450 DA')
  })

  it('keeps cents for other currencies, both digits when there are any', () => {
    expect(formatMoney(184.01, 'USD')).toBe('184.01 USD')
    expect(formatMoney(15.5, 'USD')).toBe('15.50 USD')
    expect(formatMoney(50, 'USD')).toBe('50 USD')
  })

  it('signs what it shows, and nothing has no sign', () => {
    expect(formatMoney(-250.4)).toBe('−250 DA')
    expect(formatMoney(250, 'DZD', { signed: true })).toBe('+250 DA')
    expect(formatMoney(-0.4)).toBe('0 DA')
    expect(formatMoney(0.4, 'DZD', { signed: true })).toBe('0 DA')
    expect(formatMoney(-0.004, 'USD')).toBe('0 USD')
  })
})

describe('formatAmount', () => {
  it('leaves out the sign and symbol', () => {
    expect(formatAmount(-45_666.66)).toBe('45,667')
    expect(formatAmount(15.5, 'USD')).toBe('15.50')
  })
})
