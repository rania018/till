import type { Messages } from '../i18n'

/** A paragraph, or a bulleted list. */
export type PolicyBlock = string | string[]

export interface PolicySection {
  title: string
  blocks: PolicyBlock[]
}

export interface PrivacyPolicy {
  intro: string
  sections: PolicySection[]
}

/** What the policy states, taken from the code so the two can't drift apart. */
export interface PolicyFacts {
  /** The app's own text in the same language, for menu paths that match what people see. */
  m: Messages
  /** Empty strings are left out. */
  operator: { name: string; email: string }
  passphraseMin: number
  expenseDays: number
  billDays: number
  keepDays: number
  /** Google sign-in and sync exist in this build. When they don't, the policy leaves out everything about them. */
  sync: boolean
  /** Closed-app reminders exist in this build. Same. */
  push: boolean
}

/** Settings › Your data › Save a backup */
export const menuPath = (...labels: string[]) => labels.join(' › ')
