import { describe, expect, it } from 'vitest'
import { messages } from '../i18n'
import { NEVER } from '../lib/id'
import { withBuiltInNames } from './builtInNames'
import { createInitialData } from './defaults'

const category = (id: string, name: string) => ({ id, name, updatedAt: NEVER })

describe('withBuiltInNames', () => {
  it('translates built-in names', () => {
    const [housing] = withBuiltInNames([category('cat-housing', 'Housing')], 'categories', 'fr')
    expect(housing.name).toBe(messages.fr.seeds.categories['cat-housing'])
  })

  it('translates from any language to any other', () => {
    const fromFrench = category('cat-housing', messages.fr.seeds.categories['cat-housing'])
    expect(withBuiltInNames([fromFrench], 'categories', 'ar')[0].name).toBe(messages.ar.seeds.categories['cat-housing'])
    expect(withBuiltInNames([fromFrench], 'categories', 'en')[0].name).toBe('Housing')
  })

  it('stamps what it changes, so sync sends it', () => {
    const [housing] = withBuiltInNames([category('cat-housing', 'Housing')], 'categories', 'fr')
    expect(housing.updatedAt).not.toBe(NEVER)
  })

  it('keeps a name the user chose', () => {
    const renamed = [category('cat-housing', 'Rent and flat')]
    expect(withBuiltInNames(renamed, 'categories', 'fr')).toBe(renamed)
  })

  it('leaves the user’s own categories alone, even with a built-in name', () => {
    const own = [category('my-category', 'Housing')]
    expect(withBuiltInNames(own, 'categories', 'fr')).toBe(own)
  })

  it('returns the same list when nothing changes', () => {
    const { categories, accounts } = createInitialData()
    expect(withBuiltInNames(categories, 'categories', 'en')).toBe(categories)
    expect(withBuiltInNames(accounts, 'accounts', 'en')).toBe(accounts)
  })

  it('translates wallets too', () => {
    const { accounts } = createInitialData()
    expect(withBuiltInNames(accounts, 'accounts', 'ar').map((a) => a.name)).toEqual([messages.ar.seeds.accounts['acc-cash'], messages.ar.seeds.accounts['acc-bank']])
  })
})

describe('built-in names', () => {
  it('has a name for every category and wallet of a new install', () => {
    const { categories, accounts } = createInitialData()
    for (const language of ['en', 'fr', 'ar'] as const) {
      for (const c of categories) expect(messages[language].seeds.categories[c.id], c.id).toBeTruthy()
      for (const a of accounts) expect(messages[language].seeds.accounts[a.id], a.id).toBeTruthy()
    }
  })

  it('never gives two built-ins the same name in one language', () => {
    for (const language of ['en', 'fr', 'ar'] as const) {
      const names = Object.values(messages[language].seeds.categories)
      expect(new Set(names).size).toBe(names.length)
    }
  })
})
