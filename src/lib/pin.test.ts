import { afterEach, describe, expect, it } from 'vitest'
import { formatAmount, formatCompact, formatMoney, formatNumber, setAmountsHidden, withAmountsShown } from './money'
import { afterWrongPin, checkPin, FREE_TRIES, hashPin, isValidPin, NO_TRIES, triesLeft } from './pin'

describe('the lock PIN', () => {
  it('is 4 to 8 digits', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('12345678')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('123456789')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
  })

  it('is kept as a salted hash, never the digits, and checks only the right PIN', async () => {
    const saved = await hashPin('2580', 1_000)
    expect(JSON.stringify(saved)).not.toContain('2580')
    expect(saved.length).toBe(4)
    expect(await checkPin('2580', saved)).toBe(true)
    expect(await checkPin('2581', saved)).toBe(false)
    // The same PIN twice gives two different hashes: each has its own salt.
    expect((await hashPin('2580', 1_000)).hash).not.toBe(saved.hash)
  })

  it('makes you wait after too many wrong tries, longer each time', () => {
    let tries = NO_TRIES
    for (let i = 0; i < FREE_TRIES - 1; i++) tries = afterWrongPin(tries, 0)
    expect(tries.waitUntil).toBe(0)
    expect(triesLeft(tries, 0)).toBe(1)
    tries = afterWrongPin(tries, 1_000)
    expect(tries.waitUntil).toBe(31_000)
    expect(triesLeft(tries, 2_000)).toBe(0)
    expect(triesLeft(tries, 31_000)).toBe(1)
    tries = afterWrongPin(tries, 40_000)
    expect(tries.waitUntil).toBe(100_000)
  })
})

describe('hidden amounts', () => {
  afterEach(() => setAmountsHidden(false))

  it('hide every amount, its sign too, but keep the currency', () => {
    setAmountsHidden(true)
    expect(formatMoney(-12_500)).toBe('••• DA')
    expect(formatMoney(5_000, 'USD', { signed: true })).toBe('••• USD')
    expect(formatAmount(1_450)).toBe('•••')
    // Counts, grams and hours aren't money.
    expect(formatNumber(40)).toBe('40')
    expect(formatCompact(40_000)).toBe('•••')
    expect(formatCompact(0)).toBe('0')
  })

  it('show the real amounts in a file saved on purpose', () => {
    setAmountsHidden(true)
    expect(withAmountsShown(() => formatMoney(1_450))).toBe('1,450 DA')
    expect(formatMoney(1_450)).toBe('••• DA')
  })
})
