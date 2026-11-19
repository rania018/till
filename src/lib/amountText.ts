import { numberLocale } from '../i18n/language'
import { roundMoney } from './money'

// What an amount field shows while typing. The text kept in between (`cleaned`) always uses
// "." for decimals; the language's own separators are only what the person sees and types.

const parts = new Intl.NumberFormat(numberLocale).formatToParts(12345.6)
// French's narrow space is hard to see; money.ts shows a regular one too.
const GROUP = (parts.find((p) => p.type === 'group')?.value ?? ',').replace('\u202f', '\u00a0')
const DECIMAL = parts.find((p) => p.type === 'decimal')?.value ?? '.'

const MAX_INTEGER_DIGITS = 12

/** Arabic keyboards type ٠١٢ and ۰۱۲, and ٫ for decimals. */
export function toLatinDigits(raw: string): string {
  return raw.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) & 0xf)).replace(/\u066B/g, '.')
}

/** Keeps the digits and one decimal point (2 decimals at most), without leading zeros. */
export function cleanAmountText(raw: string): string {
  const typed = DECIMAL === ',' ? raw.replace(/,/g, '.') : raw
  let text = toLatinDigits(typed).replace(/[^\d.]/g, '')
  const dot = text.indexOf('.')
  let integer = dot === -1 ? text : text.slice(0, dot)
  integer = integer.replace(/^0+(?=\d)/, '').slice(0, MAX_INTEGER_DIGITS)
  if (dot === -1) return integer
  const decimals = text.slice(dot + 1).replace(/\./g, '').slice(0, 2)
  text = `${integer}.${decimals}`
  return text
}

/** `null` when nothing (or only a point) was typed. */
export function parseAmountText(cleaned: string): number | null {
  const digits = cleaned.endsWith('.') ? cleaned.slice(0, -1) : cleaned
  if (digits === '') return null
  const value = Number(digits)
  return Number.isFinite(value) ? value : null
}

/** Adds thousands separators and keeps a decimal point that's still being typed. In English: `60000` → `60,000`, `12.` → `12.` */
export function groupAmountText(cleaned: string): string {
  const [integer, decimals] = cleaned.split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP)
  return decimals === undefined ? grouped : `${grouped || '0'}${DECIMAL}${decimals}`
}

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | '.' | 'back'

/** The digits typed on the on-screen keypad after pressing `key`. `.` starts cents, at most two of them. */
export function pressKeypadKey(digits: string, key: KeypadKey): string {
  if (key === 'back') return digits.slice(0, -1)
  if (key === '.') return digits.includes('.') ? digits : `${digits || '0'}.`
  const dot = digits.indexOf('.')
  if (dot !== -1) return key === '000' || digits.length - dot > 2 ? digits : digits + key
  if (key === '000' && (digits === '' || digits === '0')) return digits
  const next = digits === '0' ? key : digits + key
  return next.length > MAX_INTEGER_DIGITS ? digits : next
}

export function amountToText(value: number | null): string {
  return value === null ? '' : groupAmountText(cleanAmountText(String(roundMoney(value))))
}
