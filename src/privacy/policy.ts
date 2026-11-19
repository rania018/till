import { BILL_DAYS_SHARED, EXPENSE_DAYS_SHARED } from '../app/push'
import { readCloudSettings } from '../config/cloudSettings'
import { messages, type Language } from '../i18n'
import { PASSPHRASE_MIN } from '../sync/vault'
import type { ISODate } from '../types'
import { OPERATOR } from './operator'
import { arPolicy } from './policy.ar'
import { enPolicy } from './policy.en'
import { frPolicy } from './policy.fr'
import type { PolicyFacts, PrivacyPolicy } from './types'

/**
 * The privacy policy, in each language. It describes what the code does, so it's built from
 * the same numbers and menu labels: change what leaves the device and this has to change too
 * (policy.test.ts checks the numbers). Bump POLICY_DATE with any change of substance.
 */

export const POLICY_DATE: ISODate = '2026-11-07'

/** How long the push server keeps a device that stopped checking in (push-server/src/index.ts, KEEP_DAYS). */
export const PUSH_KEEP_DAYS = 180

const WRITERS: Record<Language, (facts: PolicyFacts) => PrivacyPolicy> = { en: enPolicy, fr: frPolicy, ar: arPolicy }

const settings = readCloudSettings(import.meta.env)

/** Which optional features this build has; the policy describes only those. */
export interface PolicyFeatures {
  sync: boolean
  push: boolean
}

export function privacyPolicy(language: Language, operator = OPERATOR, features: PolicyFeatures = { sync: settings.syncEnabled, push: settings.pushEnabled }): PrivacyPolicy {
  return WRITERS[language]({
    m: messages[language],
    operator: { name: operator.name.trim(), email: operator.email.trim() },
    passphraseMin: PASSPHRASE_MIN,
    expenseDays: EXPENSE_DAYS_SHARED,
    billDays: BILL_DAYS_SHARED,
    keepDays: PUSH_KEEP_DAYS,
    sync: features.sync,
    push: features.push,
  })
}
