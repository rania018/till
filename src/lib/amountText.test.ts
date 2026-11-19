import { describe, expect, it } from 'vitest'
import { amountToText, cleanAmountText, groupAmountText, parseAmountText } from './amountText'

const typed = (raw: string) => {
  const cleaned = cleanAmountText(raw)
  return { text: groupAmountText(cleaned), value: parseAmountText(cleaned) }
}

describe('typing an amount', () => {
  it('groups thousands as you type', () => {
    expect(typed('60000')).toEqual({ text: '60,000', value: 60_000 })
    expect(typed('1234567')).toEqual({ text: '1,234,567', value: 1_234_567 })
  })

  it('treats commas and spaces as separators and ignores other characters', () => {
    expect(typed('60,000 DA')).toEqual({ text: '60,000', value: 60_000 })
    expect(typed('1 450')).toEqual({ text: '1,450', value: 1_450 })
    expect(typed('-250')).toEqual({ text: '250', value: 250 })
  })

  it('keeps a decimal point while typing, with at most 2 decimals', () => {
    expect(typed('12.')).toEqual({ text: '12.', value: 12 })
    expect(typed('12.5')).toEqual({ text: '12.5', value: 12.5 })
    expect(typed('12.567')).toEqual({ text: '12.56', value: 12.56 })
    expect(typed('1.2.3')).toEqual({ text: '1.23', value: 1.23 })
    expect(typed('.5')).toEqual({ text: '0.5', value: 0.5 })
  })

  it('drops leading zeros but keeps a single 0', () => {
    expect(typed('007')).toEqual({ text: '7', value: 7 })
    expect(typed('0')).toEqual({ text: '0', value: 0 })
  })

  it('is empty when nothing usable was typed', () => {
    expect(typed('')).toEqual({ text: '', value: null })
    expect(typed('DA')).toEqual({ text: '', value: null })
    expect(typed('.')).toEqual({ text: '0.', value: null })
  })

  it('stops at 12 digits', () => {
    expect(typed('99999999999999').value).toBe(999_999_999_999)
  })
})

describe('amountToText', () => {
  it('shows a saved amount the same way', () => {
    expect(amountToText(60_000)).toBe('60,000')
    expect(amountToText(0.1 + 0.2)).toBe('0.3')
    expect(amountToText(null)).toBe('')
  })
})
