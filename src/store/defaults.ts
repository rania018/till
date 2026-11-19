import type { Account, AppData, Category, CategoryKind, ISODate, ISODateTime, Profile, Settings } from '../types'
import { language, t } from '../i18n'
import { todayISO } from '../lib/dates'
import { createId, NEVER } from '../lib/id'

// Built-in records use fixed ids so two devices create the same ones and sync can merge them.

export const ACCOUNT_IDS = { cash: 'acc-cash', bank: 'acc-bank' } as const

export const CATEGORY_IDS = {
  other: 'cat-other',
  pets: 'cat-pets',
  untracked: 'cat-untracked',
  salary: 'inc-salary',
  otherIncome: 'inc-other',
} as const

interface CategorySeed {
  id: string
  icon: string
  kind: CategoryKind
  optional?: boolean
  system?: boolean
  /** The main category it sits under. */
  parent?: string
  /** A main category's pastel, by slot (see `--cat-1` to `--cat-8` in index.css). */
  color?: number
}

/**
 * Main categories and what sits under them, in the order they show (schema 11). Transport,
 * Shopping and Other are main categories on their own. The colours follow the validated
 * palette order, so no two that sit side by side in it are hard to tell apart.
 */
const CATEGORY_SEEDS: CategorySeed[] = [
  { id: 'cat-g-home', icon: 'house', kind: 'expense', color: 4 },
  { id: 'cat-housing', icon: 'house', kind: 'expense', parent: 'cat-g-home' },
  { id: 'cat-bills', icon: 'lightbulb', kind: 'expense', parent: 'cat-g-home' },
  { id: 'cat-household', icon: 'spray-can', kind: 'expense', parent: 'cat-g-home' },
  { id: 'cat-subscriptions', icon: 'smartphone', kind: 'expense', parent: 'cat-g-home' },
  { id: 'cat-g-food', icon: 'utensils', kind: 'expense', color: 5 },
  { id: 'cat-groceries', icon: 'shopping-cart', kind: 'expense', parent: 'cat-g-food' },
  { id: 'cat-eating-out', icon: 'coffee', kind: 'expense', parent: 'cat-g-food' },
  { id: 'cat-transport', icon: 'bus', kind: 'expense', color: 7 },
  { id: 'cat-g-health', icon: 'pill', kind: 'expense', color: 3 },
  { id: 'cat-health', icon: 'heart-pulse', kind: 'expense', parent: 'cat-g-health' },
  { id: 'cat-personal-care', icon: 'sparkles', kind: 'expense', parent: 'cat-g-health' },
  { id: 'cat-shopping', icon: 'shirt', kind: 'expense', color: 8 },
  { id: 'cat-g-leisure', icon: 'party-popper', kind: 'expense', color: 6 },
  { id: 'cat-entertainment', icon: 'film', kind: 'expense', parent: 'cat-g-leisure' },
  { id: 'cat-travel', icon: 'plane', kind: 'expense', parent: 'cat-g-leisure' },
  { id: 'cat-g-family', icon: 'users', kind: 'expense', color: 1 },
  { id: 'cat-gifts', icon: 'gift', kind: 'expense', parent: 'cat-g-family' },
  { id: 'cat-education', icon: 'graduation-cap', kind: 'expense', parent: 'cat-g-family' },
  { id: CATEGORY_IDS.pets, icon: 'paw-print', kind: 'expense', optional: true, parent: 'cat-g-family' },
  { id: CATEGORY_IDS.other, icon: 'package', kind: 'expense' },
  { id: CATEGORY_IDS.untracked, icon: 'coins', kind: 'expense', system: true, parent: CATEGORY_IDS.other },
  { id: CATEGORY_IDS.salary, icon: 'wallet', kind: 'income' },
  { id: 'inc-bonus', icon: 'award', kind: 'income' },
  { id: 'inc-side', icon: 'briefcase', kind: 'income' },
  { id: 'inc-gift', icon: 'gift', kind: 'income' },
  { id: CATEGORY_IDS.otherIncome, icon: 'plus', kind: 'income' },
]

/** Categories every install has. They can be renamed or switched off, not deleted. */
export const BUILT_IN_CATEGORY_IDS: ReadonlySet<string> = new Set(CATEGORY_SEEDS.map((seed) => seed.id))

export function defaultCategories(timestamp: ISODateTime): Category[] {
  return CATEGORY_SEEDS.map(seedCategory(timestamp))
}

function seedCategory(timestamp: ISODateTime) {
  return (seed: CategorySeed, order: number): Category => ({
    id: seed.id,
    name: t.seeds.categories[seed.id],
    icon: seed.icon,
    kind: seed.kind,
    optional: seed.optional ?? false,
    enabled: !seed.optional,
    system: seed.system ?? false,
    archived: false,
    order,
    ...(seed.parent && { parentId: seed.parent }),
    ...(seed.color && { color: seed.color }),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

/**
 * When main categories arrived (schema 11). Every device that groups its categories gives the
 * records this time, so they all agree and sync has nothing to send back and forth; anything
 * changed afterwards is newer and wins.
 */
export const GROUPED_AT: ISODateTime = '2026-11-06T00:00:00.000Z'

/**
 * Sorts older categories into main ones: adds the built-in main categories that are missing,
 * puts each built-in category under its main one and colours the main ones, and puts anyone's
 * own spending categories under Other until they're moved. A category already under a main one,
 * or one that has subcategories of its own, is left where it is.
 */
export function groupCategories(categories: Category[]): Category[] {
  const seeds = new Map(CATEGORY_SEEDS.map((seed, order) => [seed.id, { seed, order }]))
  const byId = new Map(categories.map((c) => [c.id, c]))
  const stamp = (c: Category): Category => (c.updatedAt < GROUPED_AT ? { ...c, updatedAt: GROUPED_AT } : c)
  const added = CATEGORY_SEEDS.filter((seed) => seed.id.startsWith('cat-g-') && !byId.has(seed.id)).map((seed) => seedCategory(GROUPED_AT)(seed, seeds.get(seed.id)!.order))
  const parents = new Set(categories.map((c) => c.parentId).filter(Boolean))
  const grouped = categories.map((c) => {
    if (c.kind !== 'expense' || c.parentId) return c
    const seed = seeds.get(c.id)?.seed
    if (seed) {
      if (seed.parent) return stamp({ ...c, parentId: seed.parent, order: seeds.get(c.id)!.order })
      if (seed.color && !c.color) return stamp({ ...c, color: seed.color, order: seeds.get(c.id)!.order })
      return c
    }
    // Someone's own category: under Other, unless it already leads a group.
    return parents.has(c.id) ? c : stamp({ ...c, parentId: CATEGORY_IDS.other })
  })
  return [...grouped, ...added]
}

export function defaultAccounts(today: ISODate, timestamp: ISODateTime): Account[] {
  const wallet = (id: string, kind: Account['kind']): Account => ({
    id,
    name: t.seeds.accounts[id],
    kind,
    startingBalance: 0,
    startDate: today,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return [wallet(ACCOUNT_IDS.cash, 'cash'), wallet(ACCOUNT_IDS.bank, 'bank')]
}

/**
 * How setup suggests splitting free-to-spend money. Other categories start
 * without a limit. "Other" comes last: it takes the rounding remainder.
 */
export const SUGGESTED_BUDGET_SPLIT: [string, number][] = [
  ['cat-groceries', 0.45],
  ['cat-eating-out', 0.14],
  ['cat-shopping', 0.14],
  ['cat-entertainment', 0.08],
  ['cat-personal-care', 0.07],
  ['cat-household', 0.05],
  [CATEGORY_IDS.other, 0.07],
]

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  weeklyReminder: { enabled: true, weekday: 6, time: '20:00' },
  cashCheck: { enabled: true },
  alerts: { enabled: true, warnAtPercent: 80, paceTolerancePercent: 15, bigPurchasePercent: 10 },
  showWorkHours: true,
  coolingOffHours: 48,
}

export function defaultProfile(today: ISODate): Profile {
  return {
    currency: 'DZD',
    language,
    salary: { amount: 0, frequency: 'monthly', payday: 1, accountId: ACCOUNT_IDS.bank },
    work: { hoursPerDay: 8, daysPerWeek: 5 },
    hourlyRateBasis: 'net-salary',
    startDate: today,
    onboardingCompleted: false,
  }
}

/** A fresh install: built-in wallets and categories, no salary yet, onboarding not done. */
export function createInitialData(now: Date = new Date()): AppData {
  const today = todayISO(now)
  return {
    deviceId: createId(),
    profile: defaultProfile(today),
    settings: DEFAULT_SETTINGS,
    accounts: defaultAccounts(today, NEVER),
    categories: defaultCategories(NEVER),
    bills: [],
    transactions: [],
    goals: [],
    debts: [],
    incomes: [],
    quickItems: [],
    assets: [],
    wishlist: [],
  }
}
