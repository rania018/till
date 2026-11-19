import { language, numberLocale } from '../i18n/language'

const SYMBOLS: Record<string, string> = { DZD: language === 'ar' ? 'د.ج' : 'DA' }

/** Dinars are counted in whole amounts; other currencies are often charged with cents (15.99 USD). */
export function usesCents(currency: string): boolean {
  return currency !== 'DZD'
}

/** `DZD` → `DA`; other currencies show their code. */
export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? currency
}

// French groups digits with a narrow space that all but disappears at small sizes.
const readableSpaces = (text: string) => text.replace(/\u202f/g, '\u00a0')

const twoDecimals = new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 })
const oneDecimal = new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 1 })
const cents = new Intl.NumberFormat(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const numberFormat = { format: (value: number) => readableSpaces(twoDecimals.format(value)) }

/** A number of things bought, whole or up to two decimals. Not money, so hiding amounts leaves it alone. */
export const formatQuantity = (value: number) => numberFormat.format(value)

/**
 * In Arabic, a number right after a Latin word joins it in one left-to-right run, so
 * "Internet، 2,000 د.ج" reads scrambled. Bidi isolate marks keep an amount in one piece.
 */
const keepTogether = (amount: string) => (language === 'ar' ? `\u2068${amount}\u2069` : amount)

/**
 * Next to the Arabic dinar symbol an amount reads right to left, which put a minus or a plus after
 * the number ("250\u2212"). A signed number is kept left to right inside, so the sign leads it.
 */
const signedNumber = (sign: string, number: string) => (sign && language === 'ar' ? `\u2066${sign}${number}\u2069` : sign + number)

/**
 * Hidden amounts (Settings › Privacy, or the eye on Home): every amount the app shows becomes ••• so a
 * phone can be lent or looked at by others. It's set for the whole app, so nothing can be missed.
 * Files the person saves on purpose, like Excel exports, still get the real amounts.
 */
let hidden = false
export const HIDDEN_AMOUNT = '•••'

export function setAmountsHidden(on: boolean): void {
  hidden = on
}

export function amountsHidden(): boolean {
  return hidden
}

/** Runs `make` with amounts shown, e.g. to build a file the person asked for. */
export function withAmountsShown<T>(make: () => T): T {
  const before = hidden
  hidden = false
  try {
    return make()
  } finally {
    hidden = before
  }
}

/**
 * Chart axis ticks: in full below 10,000 (`2,500`), in thousands from there (`40k`, `1.2M`).
 * Pass the axis's largest value so every tick on it uses the same style.
 */
export function formatCompact(amount: number, axisMax = Math.abs(amount)): string {
  if (hidden) return amount === 0 ? '0' : HIDDEN_AMOUNT
  const sign = amount < 0 ? '−' : ''
  const value = Math.abs(amount)
  if (axisMax < 10_000 || value === 0) return sign + numberFormat.format(value)
  if (axisMax < 1_000_000) return `${sign}${numberFormat.format(Math.round(value / 100) / 10)}k`
  return `${sign}${numberFormat.format(Math.round(value / 10_000) / 100)}M`
}

/** `1450` → `1,450`, for places where the currency is shown separately. */
/** Not hidden with amounts: it also writes counts, grams and hours. */
export function formatNumber(amount: number): string {
  return `${amount < 0 ? '−' : ''}${numberFormat.format(Math.abs(amount))}`
}

/** The size of an amount as it shows: dinars whole, even where a bill's monthly share leaves a fraction; other currencies to the cent. */
const shownSize = (amount: number, currency: string) => (usesCents(currency) ? roundMoney(Math.abs(amount)) : Math.round(Math.abs(amount)))

/** An amount with no sign or symbol. Cents show when there are any, both digits: `15.50`, `50`. */
export function formatAmount(amount: number, currency = 'DZD'): string {
  if (hidden) return HIDDEN_AMOUNT
  const size = shownSize(amount, currency)
  return readableSpaces((Number.isInteger(size) ? twoDecimals : cents).format(size))
}

/** A count of days or hours, to one decimal: `2.5`. */
export function formatDecimal(value: number): string {
  return readableSpaces(oneDecimal.format(value))
}

/**
 * `1450` → `1,450 DA`. Negative amounts use a real minus sign: `−250 DA`.
 * With `signed`, positive amounts get a plus: `+5,000 DA`.
 */
export function formatMoney(amount: number, currency = 'DZD', options: { signed?: boolean } = {}): string {
  const symbol = currencySymbol(currency)
  // Not even the sign: over or under would say something.
  if (hidden) return keepTogether(`${HIDDEN_AMOUNT} ${symbol}`)
  // What rounds to nothing has no sign either.
  const sign = shownSize(amount, currency) === 0 ? '' : amount < 0 ? '−' : options.signed && amount > 0 ? '+' : ''
  return keepTogether(`${signedNumber(sign, formatAmount(amount, currency))} ${symbol}`)
}

/** Round to cents so sums of decimals don't drift (0.1 + 0.2). */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100
}

export function sumAmounts(amounts: number[]): number {
  return roundMoney(amounts.reduce((total, n) => total + n, 0))
}
