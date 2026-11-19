import type { AppData, ISODate, ISODateTime } from '../types'
import { t } from '../i18n'
import { live, nowISO } from '../lib/id'
import { isValidDate } from '../lib/validation'
import { migrate, SCHEMA_VERSION } from './migrations'

export const BACKUP_APP = 'expense-tracker'

export interface BackupFile {
  app: typeof BACKUP_APP
  schemaVersion: number
  exportedAt: ISODateTime
  data: AppData
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

export function createBackup(data: AppData, exportedAt: ISODateTime = nowISO()): string {
  const file: BackupFile = { app: BACKUP_APP, schemaVersion: SCHEMA_VERSION, exportedAt, data }
  return JSON.stringify(file, null, 2)
}

export function backupFileName(today: ISODate): string {
  return `till-backup-${today}.json`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const TRANSACTION_TYPES = new Set(['expense', 'refund', 'income', 'transfer', 'goal-deposit', 'goal-withdrawal', 'debt-out', 'debt-in'])
const LISTS = ['accounts', 'categories', 'bills', 'transactions', 'goals', 'debts', 'incomes', 'quickItems', 'assets', 'wishlist'] as const
/** Added after version 1: older backups don't have them, and migrating fills them in. */
const LATER_LISTS: readonly string[] = ['debts', 'incomes', 'quickItems', 'assets']

/** The profile fields the app can't run without. */
export function isUsableProfile(profile: unknown): boolean {
  return isObject(profile) && isObject(profile.salary) && typeof profile.salary.amount === 'number' && isObject(profile.work)
}

/** A transaction the calculations can work with. */
export function isUsableTransaction(value: unknown): boolean {
  return (
    isObject(value) &&
    TRANSACTION_TYPES.has(value.type as string) &&
    typeof value.amount === 'number' &&
    Number.isFinite(value.amount) &&
    value.amount >= 0 &&
    typeof value.date === 'string' &&
    isValidDate(value.date) &&
    typeof value.accountId === 'string'
  )
}

/** Problems that would break the app, described for a person; empty when the data is usable. */
export function validateAppData(value: unknown): string[] {
  if (!isObject(value)) return [t.errors.backup.missingData]
  const problems: string[] = []
  if (!isUsableProfile(value.profile)) problems.push(t.errors.backup.profile)
  if (!isObject(value.settings)) problems.push(t.errors.backup.settings)

  for (const key of LISTS) {
    const list = value[key]
    if (list === undefined && LATER_LISTS.includes(key)) continue
    if (!Array.isArray(list)) {
      problems.push(t.errors.backup.listMissing(t.errors.backup.lists[key]))
      continue
    }
    const broken = list.filter((r) => !isObject(r) || typeof r.id !== 'string').length
    if (broken > 0) problems.push(t.errors.backup.noId(broken, t.errors.backup.lists[key]))
  }

  if (Array.isArray(value.transactions)) {
    const broken = value.transactions.filter((t) => !isUsableTransaction(t)).length
    if (broken > 0) problems.push(t.errors.backup.badTransactions(broken))
  }
  return problems
}

/** Reads a backup file's text. Throws a BackupError with a message for the user if it can't be used. */
export function readBackup(text: string): AppData {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupError(t.errors.backup.unreadable)
  }
  if (!isObject(parsed) || parsed.app !== BACKUP_APP) {
    throw new BackupError(t.errors.backup.notBackup)
  }
  const version = parsed.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BackupError(t.errors.backup.noVersion)
  }
  if (version > SCHEMA_VERSION) {
    throw new BackupError(t.errors.backup.newer)
  }
  // Checks the current shape, allowing for lists older versions didn't have yet.
  const problems = validateAppData(parsed.data)
  if (problems.length > 0) {
    throw new BackupError(t.errors.backup.damaged(problems.slice(0, 3).join('; ')))
  }
  return migrate(parsed.data, version)
}

function csvCell(value: string | number | undefined): string {
  let text = value === undefined ? '' : String(value)
  // Stop spreadsheet apps from running a note like "=SUM(...)" as a formula.
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Transactions as a spreadsheet-friendly CSV, oldest first. */
export function transactionsToCsv(data: Pick<AppData, 'transactions' | 'categories' | 'accounts' | 'goals' | 'debts' | 'profile'>): string {
  const name = (list: { id: string; name: string }[], id?: string) => list.find((r) => r.id === id)?.name
  const words = t.data.csv
  const header = [words.date, words.type, words.amount, words.currency, words.category, words.wallet, words.toWallet, words.toAmount, words.goal, words.fundAmount, words.person, words.debtAmount, words.note, words.tags]
  const rows = live(data.transactions)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((tx) => [
      tx.date,
      words.types[tx.type],
      tx.amount,
      tx.currency ?? data.profile.currency,
      name(data.categories, tx.categoryId),
      name(data.accounts, tx.accountId),
      name(data.accounts, tx.toAccountId),
      tx.toAmount,
      name(data.goals, tx.goalId),
      tx.fundAmount,
      data.debts.find((d) => d.id === tx.debtId)?.person,
      tx.debtAmount,
      tx.note,
      tx.tags?.join(', '),
    ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
