import { describe, expect, it } from 'vitest'
import worker from '../../push-server/src/index.ts?raw'
import { BILL_DAYS_SHARED, EXPENSE_DAYS_SHARED } from '../app/push'
import { PASSPHRASE_MIN } from '../sync/vault'
import { privacyPolicy, PUSH_KEEP_DAYS } from './policy'
import type { PrivacyPolicy } from './types'

const LANGUAGES = ['en', 'fr', 'ar'] as const
const someone = { name: 'Sam Example', email: 'privacy@example.com' }
const nobody = { name: '', email: '' }
const FULL = { sync: true, push: true }
const NEWLINE = String.fromCharCode(10)

const allText = (policy: PrivacyPolicy) => [policy.intro, ...policy.sections.flatMap((s) => [s.title, ...s.blocks.flat()])]
const shape = (policy: PrivacyPolicy) => policy.sections.map((s) => s.blocks.map((b) => (typeof b === 'string' ? 'p' : `ul${b.length}`)))

describe('the privacy policy', () => {
  it('says the same things in every language', () => {
    for (const operator of [someone, nobody]) {
      const [en, ...others] = LANGUAGES.map((language) => privacyPolicy(language, operator, FULL))
      for (const other of others) expect(shape(other)).toEqual(shape(en))
    }
  })

  it('states the numbers the code uses', () => {
    expect(worker).toMatch(new RegExp(`const KEEP_DAYS = ${PUSH_KEEP_DAYS}\\b`))
    for (const language of LANGUAGES) {
      const text = allText(privacyPolicy(language, nobody, FULL)).join('\n')
      for (const n of [PASSPHRASE_MIN, EXPENSE_DAYS_SHARED, BILL_DAYS_SHARED, PUSH_KEEP_DAYS]) expect(text, `${language}: ${n}`).toContain(String(n))
    }
  })

  it('points to the menus by the names the app shows', () => {
    const text = allText(privacyPolicy('en', nobody, FULL)).join('\n')
    expect(text).toContain('Settings › Your data › Save a backup')
    expect(text).toContain('Settings › Sync › Delete online copy')
    expect(text).toContain('Settings › Reminders and alerts › Also when the app is closed')
  })

  it('names who runs Till and how to reach them, once that’s filled in', () => {
    for (const language of LANGUAGES) {
      const filled = privacyPolicy(language, someone, FULL)
      expect(filled.sections[0].blocks.join(' ')).toContain('Sam Example')
      expect(allText(filled).filter((line) => line.includes('privacy@example.com')).length, language).toBe(2)

      const empty = privacyPolicy(language, nobody, FULL)
      expect(empty.sections).toHaveLength(filled.sections.length - 1)
      expect(allText(empty).join(' ')).not.toMatch(/undefined|@/)
    }
  })

  it('keeps French spacing and is in Arabic where it should be', () => {
    for (const line of allText(privacyPolicy('fr', someone, FULL))) expect(line).not.toMatch(/ [:;?!»]|« /)
    for (const line of allText(privacyPolicy('ar', someone, FULL))) expect(line).toMatch(/[؀-ۿ]/)
  })

  describe('with some features left out', () => {
    const STATES = [
      { sync: false, push: false },
      { sync: true, push: false },
      { sync: false, push: true },
    ]
    const MENTIONS_SYNC = /Firebase Authentication|passphrase|synced data/i
    const MENTIONS_PUSH = /reminder server|Cloudflare Worker|push address/i

    it('has fewer sections than the full one, in every language, with the same shape', () => {
      for (const language of LANGUAGES) {
        const full = privacyPolicy(language, nobody, FULL)
        for (const state of STATES) {
          const policy = privacyPolicy(language, nobody, state)
          expect(policy.sections.length, language + ' ' + JSON.stringify(state)).toBe(full.sections.length - (state.sync ? 0 : 1) - (state.push ? 0 : 1))
          expect(allText(policy).join(' ')).not.toMatch(/undefined|false/)
        }
      }
    })

    it('says nothing about sync when it is off, and nothing about reminders when they are off', () => {
      const none = allText(privacyPolicy('en', nobody, STATES[0])).join(NEWLINE)
      expect(none).not.toMatch(MENTIONS_SYNC)
      expect(none).not.toMatch(MENTIONS_PUSH)
      expect(none).toContain('nothing leaves your device')

      const syncOnly = allText(privacyPolicy('en', nobody, STATES[1])).join(NEWLINE)
      expect(syncOnly).toMatch(MENTIONS_SYNC)
      expect(syncOnly).not.toMatch(MENTIONS_PUSH)

      const pushOnly = allText(privacyPolicy('en', nobody, STATES[2])).join(NEWLINE)
      expect(pushOnly).not.toMatch(MENTIONS_SYNC)
      expect(pushOnly).toMatch(MENTIONS_PUSH)
    })

    it('keeps French spacing and Arabic text in the shorter versions', () => {
      for (const state of STATES) {
        for (const line of allText(privacyPolicy('fr', someone, state))) expect(line).not.toMatch(/ [:;?!»]|« /)
        for (const line of allText(privacyPolicy('ar', someone, state))) expect(line).toMatch(/[؀-ۿ]/)
      }
    })
  })
})
