import { describe, expect, it, vi } from 'vitest'
import { amountToText, cleanAmountText, groupAmountText, parseAmountText, toLatinDigits } from './amountText'
import { currencySymbol, formatMoney } from './money'

vi.mock('../i18n/language', () => ({ language: 'ar', numberLocale: 'ar-u-nu-latn', direction: 'rtl' }))

describe('numbers in Arabic', () => {
  it('shows Latin digits and the Arabic dinar symbol', () => {
    expect(formatMoney(1450).replace(/[\u2068\u2069]/g, '')).toBe('1,450 د.ج')
    expect(currencySymbol('DZD')).toBe('د.ج')
    expect(currencySymbol('EUR')).toBe('EUR')
  })

  it('keeps an amount in one piece next to Latin words', () => {
    expect(formatMoney(1450)).toBe('\u20681,450 د.ج\u2069')
    expect(formatMoney(-250, 'EUR')).toBe('\u2068\u2066−250\u2069 EUR\u2069')
  })

  it('keeps the sign before the number next to the dinar symbol', () => {
    expect(formatMoney(-250)).toBe('\u2068\u2066−250\u2069 د.ج\u2069')
    expect(formatMoney(5000, 'DZD', { signed: true })).toBe('\u2068\u2066+5,000\u2069 د.ج\u2069')
  })

  it('reads digits typed on an Arabic keyboard', () => {
    expect(toLatinDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890')
    expect(toLatinDigits('۱۲۳')).toBe('123')
    expect(parseAmountText(cleanAmountText('١٢٫٥'))).toBe(12.5)
  })

  it('survives its own formatting as the person keeps typing', () => {
    const shown = groupAmountText(cleanAmountText('١٤٥٠'))
    expect(shown).toBe('1,450')
    expect(parseAmountText(cleanAmountText(`${shown}0`))).toBe(14500)
    expect(amountToText(60000)).toBe('60,000')
  })
})
