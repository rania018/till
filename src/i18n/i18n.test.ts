import { describe, expect, it } from 'vitest'
import { en } from './en'
import { messages, t } from './index'
import { LANGUAGE_NAMES, preferredLanguage } from './language'
import type { Language } from './language'

type Tree = Record<string, unknown>
type Leaf = { path: string; value: unknown }

function leaves(tree: Tree, prefix = ''): Leaf[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? leaves(value as Tree, path) : [{ path, value }]
  })
}

const OTHERS = ['fr', 'ar'] as const
// These take a date or an index rather than text; they're tested below.
const isText = ({ path }: Leaf) => !path.startsWith('format.') && path !== 'billSheet.dueFrom' && path !== 'billSheet.dueOnWeekday'

describe.each(OTHERS)('%s', (language) => {
  const translated = leaves(messages[language] as unknown as Tree)
  const byPath = new Map(translated.map((leaf) => [leaf.path, leaf.value]))

  it('has exactly the same keys as English', () => {
    expect(translated.map((leaf) => leaf.path).sort()).toEqual(leaves(en as unknown as Tree).map((leaf) => leaf.path).sort())
  })

  it('has no empty text', () => {
    for (const { path, value } of translated) {
      if (typeof value === 'string') expect(value.trim(), path).not.toBe('')
    }
  })

  it('shows everything the English text shows', () => {
    for (const { path, value } of leaves(en as unknown as Tree).filter(isText)) {
      if (typeof value !== 'function') continue
      const args = ['ARG0', 'ARG1', 'ARG2', 'ARG3', 'ARG4'].slice(0, value.length)
      const english: string = value(...args)
      const other = (byPath.get(path) as (...a: string[]) => string)(...args)
      for (const arg of args) {
        if (english.includes(arg)) expect(other, path).toContain(arg)
      }
    }
  })

  it('never writes "undefined" or "NaN" for a real number', () => {
    for (const { path, value } of translated.filter(isText)) {
      if (typeof value !== 'function') continue
      const result: string = value(...[2, 5, 11, 100, 7].slice(0, value.length))
      expect(result, path).not.toMatch(/undefined|NaN/)
    }
  })
})

describe('Arabic text', () => {
  const { format, ...text } = messages.ar
  const ARABIC = /[؀-ۿ]/
  // Brand and product names, and strings that are only numbers and placeholders.
  const STAY_LATIN = /^(Till|Google|Excel|CSV)$/

  it('is actually in Arabic', () => {
    for (const { path, value } of leaves(text as unknown as Tree)) {
      if (typeof value === 'string' && !STAY_LATIN.test(value)) expect(value, path).toMatch(ARABIC)
    }
    expect(format.weekdays[0]).toMatch(ARABIC)
  })

  it('uses Latin digits', () => {
    for (const { path, value } of leaves(text as unknown as Tree)) {
      if (typeof value === 'string') expect(value, path).not.toMatch(/[٠-٩]/)
    }
  })

  it('follows the plural forms', () => {
    const days = messages.ar.desk.home.daysLeft
    expect(days(1)).not.toMatch(/\d/)
    expect(days(2)).not.toMatch(/\d/)
    expect(days(5)).toContain('5')
    expect(days(5)).not.toBe(days(11).replace('11', '5'))
  })
})

describe('French text', () => {
  it('uses singular for 0 and 1, plural from 2', () => {
    expect(messages.fr.desk.home.daysLeft(1)).toBe('1 jour')
    expect(messages.fr.desk.home.daysLeft(2)).toBe('2 jours')
  })

  it('writes ordinals the French way', () => {
    expect(messages.fr.format.ordinal(1)).toBe('1er')
    expect(messages.fr.format.ordinal(15)).toBe('15')
  })
})

describe('dates', () => {
  it('uses each language’s words', () => {
    expect(messages.en.format.longDay('2026-11-15')).toBe('Sunday 15 November')
    expect(messages.fr.format.longDay('2026-11-15')).toBe('dimanche 15 novembre')
    expect(messages.fr.format.dateTime('2026-11-02T20:00:00')).toContain('à 20:00')
  })

  it('uses Algerian month names in Arabic, with Latin digits', () => {
    expect(messages.ar.format.date('2026-01-15')).toContain('جانفي')
    expect(messages.ar.format.date('2026-06-15')).toContain('جوان')
    expect(messages.ar.format.dayMonth('2026-08-25')).toMatch(/^25 /)
  })

  it('doesn’t use cut-off Arabic short names', () => {
    expect(messages.ar.format.shortDay('2026-11-17')).toBe('الثلاثاء 17 نوفمبر')
    expect(messages.ar.format.range('2026-10-25', '2026-11-24')).toBe('25 أكتوبر – 24 نوفمبر')
  })

  it('shows a bill’s next date and weekday', () => {
    expect(messages.fr.billSheet.dueFrom('2026-11-17')).toContain('17 nov.')
    expect(messages.fr.billSheet.dueOnWeekday(1)).toContain('lundi')
    expect(messages.ar.billSheet.dueOnWeekday(1)).toContain('الاثنين')
  })

  it('says today, tomorrow and yesterday', () => {
    expect(messages.fr.format.nearDay('2026-11-05', '2026-11-04')).toBe('demain')
    expect(messages.ar.format.nearDay('2026-11-04', '2026-11-04')).toBe('اليوم')
  })
})

describe('choosing a language', () => {
  it('takes the first browser language the app has', () => {
    expect(preferredLanguage(['fr-DZ', 'en'])).toBe('fr')
    expect(preferredLanguage(['ar'])).toBe('ar')
    expect(preferredLanguage(['de', 'en-GB', 'fr'])).toBe('en')
  })

  it('falls back to English', () => {
    expect(preferredLanguage(['de', 'es'])).toBe('en')
    expect(preferredLanguage([])).toBe('en')
  })

  it('names every language', () => {
    expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual(Object.keys(messages).sort() as Language[])
  })

  it('runs tests in English', () => {
    expect(t).toBe(en)
  })
})
