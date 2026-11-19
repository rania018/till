import { NEVER, nowISO } from '../lib/id'
import { isUsableProfile, isUsableTransaction } from '../store/backup'
import { SCHEMA_VERSION, withDefaults } from '../store/migrations'
import type { AppData, BaseRecord, Profile, Settings, Transaction } from '../types'

/**
 * How the app's data maps to documents online, and how the two merge. Each record
 * is one document, so a change only sends that record. Merging is "last write wins"
 * on `updatedAt`, record by record; deletes are soft, so they merge the same way.
 */

export const LIST_KINDS = ['accounts', 'categories', 'bills', 'transactions', 'goals', 'debts', 'incomes', 'quickItems', 'assets', 'wishlist'] as const
type ListKind = (typeof LIST_KINDS)[number]

export type SyncedData = Omit<AppData, 'deviceId'>

export interface SyncDoc {
  /** `profile`, `settings`, or `<kind>:<record id>`. */
  id: string
  kind: ListKind | 'profile' | 'settings'
  updatedAt: string
  /** The record as JSON: one opaque field, so Firestore doesn't index every value of it. */
  json: string
  schema: number
}

function toDoc(id: string, kind: SyncDoc['kind'], updatedAt: string, record: unknown): SyncDoc {
  return { id, kind, updatedAt, json: JSON.stringify(record), schema: SCHEMA_VERSION }
}

/** Documents for everything that differs from what's known to be online. */
export function dirtyDocs(data: SyncedData, seen: Record<string, string>): SyncDoc[] {
  const docs: SyncDoc[] = []
  for (const kind of ['profile', 'settings'] as const) {
    const updatedAt = data[kind].updatedAt ?? NEVER
    if (seen[kind] !== updatedAt) docs.push(toDoc(kind, kind, updatedAt, data[kind]))
  }
  for (const kind of LIST_KINDS) {
    for (const record of data[kind]) {
      const id = `${kind}:${record.id}`
      if (seen[id] !== record.updatedAt) docs.push(toDoc(id, kind, record.updatedAt, record))
    }
  }
  return docs
}

function parse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

function isRecord(kind: ListKind, value: unknown): value is BaseRecord {
  const record = value as Partial<BaseRecord> | null
  if (typeof record !== 'object' || record === null || typeof record.id !== 'string' || typeof record.updatedAt !== 'string') return false
  return kind !== 'transactions' || isUsableTransaction(record)
}

/** The online copy wins when newer. On an exact tie it also wins, so every device ends up the same. */
function remoteWins(localStamp: string, local: unknown, doc: SyncDoc): boolean {
  if (doc.updatedAt !== localStamp) return doc.updatedAt > localStamp
  return JSON.stringify(local) !== doc.json
}

/** A half-finished setup never replaces a finished one, however recently it was typed. */
function profileWins(local: Profile, remote: Profile, doc: SyncDoc): boolean {
  if (remote.onboardingCompleted !== local.onboardingCompleted) return remote.onboardingCompleted
  return remoteWins(local.updatedAt ?? NEVER, local, doc)
}

/**
 * Keeps one salary per payday. Salaries logged before their ids came from the date can
 * meet here with a different id; every device keeps the same one. An id from the date
 * says which payday it answers, whatever day the money arrived: two late salaries
 * confirmed on one day are two salaries.
 */
function settleSalaries(transactions: Transaction[], now: string): Transaction[] {
  const kept = new Map<string, Transaction>()
  const extra = new Set<string>()
  const rank = (t: Transaction) => (t.id.startsWith('salary-') ? `0${t.id}` : `1${t.id}`)
  for (const t of transactions) {
    if (t.deleted || t.type !== 'income' || t.source !== 'salary') continue
    const payday = t.id.startsWith('salary-') ? t.id.slice('salary-'.length) : t.date
    const other = kept.get(payday)
    if (!other) {
      kept.set(payday, t)
    } else if (rank(t) < rank(other)) {
      extra.add(other.id)
      kept.set(payday, t)
    } else {
      extra.add(t.id)
    }
  }
  if (extra.size === 0) return transactions
  return transactions.map((t) => (extra.has(t.id) ? { ...t, deleted: true, updatedAt: now } : t))
}

/** Merges documents from online into local data. Damaged documents are skipped. */
export function mergeDocs(local: SyncedData, docs: SyncDoc[], now = nowISO()): { data: SyncedData; changed: boolean } {
  const next: SyncedData = { ...local }
  const lists = next as Record<ListKind, BaseRecord[]>
  let changed = false

  for (const kind of LIST_KINDS) {
    const incoming = docs.filter((doc) => doc.kind === kind)
    if (incoming.length === 0) continue
    const records = new Map<string, BaseRecord>(local[kind].map((r) => [r.id, r]))
    let listChanged = false
    for (const doc of incoming) {
      const record = parse(doc.json)
      if (!isRecord(kind, record)) continue
      const current = records.get(record.id)
      if (!current || remoteWins(current.updatedAt, current, doc)) {
        records.set(record.id, record)
        listChanged = true
      }
    }
    if (listChanged) {
      lists[kind] = [...records.values()]
      changed = true
    }
  }

  const settled = settleSalaries(next.transactions, now)
  if (settled !== next.transactions) {
    next.transactions = settled
    changed = true
  }

  // withDefaults fills in anything a device on an older version didn't know about.
  const profileDoc = docs.find((doc) => doc.kind === 'profile')
  const profile = profileDoc && parse(profileDoc.json)
  if (profileDoc && isUsableProfile(profile) && profileWins(local.profile, profile as Profile, profileDoc)) {
    next.profile = withDefaults({ profile }).profile
    changed = true
  }
  const settingsDoc = docs.find((doc) => doc.kind === 'settings')
  const settings = settingsDoc && parse(settingsDoc.json)
  if (settingsDoc && typeof settings === 'object' && settings !== null && remoteWins(local.settings.updatedAt ?? NEVER, local.settings, settingsDoc)) {
    next.settings = withDefaults({ settings: settings as Settings }).settings
    changed = true
  }

  return { data: next, changed }
}

/**
 * Makes restored data win over what's online: a backup is older by nature, so its
 * records are stamped as changed now, and records it doesn't have become deletions.
 */
export function restoredData(current: SyncedData, backup: AppData, now = nowISO()): AppData {
  const result: AppData = {
    ...backup,
    profile: { ...backup.profile, updatedAt: now },
    settings: { ...backup.settings, updatedAt: now },
  }
  const lists = result as unknown as Record<ListKind, BaseRecord[]>
  for (const kind of LIST_KINDS) {
    const ids = new Set(backup[kind].map((r) => r.id))
    const restored = backup[kind].map((r) => ({ ...r, updatedAt: now }))
    const removed = current[kind].filter((r) => !ids.has(r.id)).map((r) => ({ ...r, deleted: true, updatedAt: now }))
    lists[kind] = [...restored, ...removed]
  }
  return result
}
