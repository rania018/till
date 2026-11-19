import { describe, expect, it, vi } from 'vitest'
import { amountToText, cleanAmountText, groupAmountText, parseAmountText } from './amountText'
import { formatDecimal, formatMoney } from './money'

vi.mock('../i18n/language', () => ({ language: 'fr', numberLocale: 'fr-FR', direction: 'ltr' }))

const SPACE = '\u00a0'

describe('numbers in French', () => {
  it('shows amounts with spaces and a decimal comma', () => {
    expect(formatMoney(1450)).toBe(`1${SPACE}450 DA`)
    expect(formatMoney(12.5, 'USD')).toBe('12,50 USD')
    expect(formatDecimal(2.5)).toBe('2,5')
  })

  it('reads a typed comma as the decimal, not a thousands separator', () => {
    expect(parseAmountText(cleanAmountText('12,5'))).toBe(12.5)
  })

  it('also accepts a typed point', () => {
    expect(parseAmountText(cleanAmountText('12.5'))).toBe(12.5)
  })

  it('survives its own formatting as the person keeps typing', () => {
    const shown = groupAmountText(cleanAmountText('1450,5'))
    expect(shown).toBe(`1${SPACE}450,5`)
    expect(parseAmountText(cleanAmountText(shown))).toBe(1450.5)
    expect(groupAmountText(cleanAmountText(`${shown}0`))).toBe(`1${SPACE}450,50`)
  })

  it('shows a saved amount the French way', () => {
    expect(amountToText(60000)).toBe(`60${SPACE}000`)
    expect(parseAmountText(cleanAmountText(amountToText(60000)))).toBe(60000)
  })
})
