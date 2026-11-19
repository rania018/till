import type { BaseRecord, ID, ISODateTime } from '../types'

/**
 * Random UUID v4. Built on `crypto.getRandomValues` because `crypto.randomUUID`
 * only exists on https/localhost, and the app gets tested on phones over the
 * dev server's plain-http LAN address.
 */
export function createId(): ID {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Timestamp of records nobody has touched yet, such as the built-in wallets and
 * categories on a fresh install. Any real change is newer, so an untouched default
 * can never overwrite someone's data when two devices merge.
 */
export const NEVER: ISODateTime = '1970-01-01T00:00:00.000Z'

export function nowISO(): ISODateTime {
  return new Date().toISOString()
}

/** Records that haven't been soft-deleted. */
export function live<T extends BaseRecord>(records: T[]): T[] {
  return records.filter((r) => !r.deleted)
}
