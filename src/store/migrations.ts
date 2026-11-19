import type { AppData } from '../types'
import { createInitialData, groupCategories } from './defaults'

/**
 * Version of the saved data's shape. Bump it whenever AppData changes in a way
 * old saved data or backups need converting, and add a step to `migrate`.
 */
export const SCHEMA_VERSION = 11

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Fills in anything missing with defaults, so data saved before a new setting
 * or list existed still loads. Doesn't check that existing values are valid;
 * backups go through `validateAppData` for that.
 */
export function withDefaults(value: unknown): AppData {
  const defaults = createInitialData()
  if (!isObject(value)) return defaults
  const data = value as Partial<AppData>
  const savedSettings: Partial<AppData['settings']> = isObject(data.settings) ? data.settings : {}
  const list = <K extends 'accounts' | 'categories' | 'bills' | 'transactions' | 'goals' | 'debts' | 'incomes' | 'quickItems' | 'assets' | 'wishlist'>(key: K): AppData[K] =>
    Array.isArray(data[key]) ? (data[key] as AppData[K]) : defaults[key]

  return {
    deviceId: typeof data.deviceId === 'string' ? data.deviceId : defaults.deviceId,
    profile: isObject(data.profile) ? { ...defaults.profile, ...data.profile } : defaults.profile,
    settings: {
      ...defaults.settings,
      ...savedSettings,
      weeklyReminder: { ...defaults.settings.weeklyReminder, ...savedSettings.weeklyReminder },
      cashCheck: { ...defaults.settings.cashCheck, ...savedSettings.cashCheck },
      alerts: { ...defaults.settings.alerts, ...savedSettings.alerts },
    },
    accounts: list('accounts'),
    categories: list('categories'),
    bills: list('bills'),
    transactions: list('transactions'),
    goals: list('goals'),
    debts: list('debts'),
    incomes: list('incomes'),
    quickItems: list('quickItems'),
    assets: list('assets'),
    wishlist: list('wishlist'),
  }
}

/** The saved data is ahead of this copy of the app: the app needs updating, and the data is fine. */
export class NewerDataError extends Error {
  constructor(version: number) {
    super(`Saved data is from a newer version of the app (schema ${version}).`)
    this.name = 'NewerDataError'
  }
}

/** Brings data saved under an older schema version up to date. */
export function migrate(value: unknown, fromVersion: number): AppData {
  if (fromVersion > SCHEMA_VERSION) {
    throw new NewerDataError(fromVersion)
  }
  // Version 2 added debts and their transaction types. Older data has neither, so
  // filling in an empty list is the whole step.
  // Version 3 added currencies to wallets, debts and entries. Left out means the main
  // currency, which is what all older data is in, so nothing needs converting.
  // Version 4 added charges and repeats to debts, which change what's owed. Older data has
  // neither, so nothing needs converting, but older apps would read the wrong amount.
  // Version 5 added income sources, and pay stopped being logged by itself. Older data has no
  // sources and keeps the salaries it logged, so nothing needs converting, but older apps would
  // log salaries nobody confirmed and read irregular pay wrongly.
  // Version 6 added one-tap items. Older data has none, so filling in an empty list is the whole step.
  // Version 7 added funds (goals that repeat) and expenses paid from them. Older data has neither,
  // so nothing needs converting, but older apps would count fund-paid spending twice.
  // Version 8 added refunds and purchases split across categories. Older data has neither, so
  // nothing needs converting, but older apps would count a refund as spending.
  // Version 9 added assets (gold, a flat, a car) for net worth. Older data has none, so filling in
  // an empty list is the whole step.
  // Version 10 added tags to entries. Older data has none, so nothing needs converting, but older
  // apps would drop an entry's tags when they edit it.
  // Version 11 added main categories: a category can sit under a main one, and main ones have a colour.
  // Older categories are sorted into the built-in main categories, the same way on every device.
  const data = withDefaults(value)
  if (fromVersion < 11) data.categories = groupCategories(data.categories)
  // Future steps go here: if (fromVersion < 12) { ... }
  return data
}
