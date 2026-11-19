import { fromBase64, toBase64 } from '../lib/pin'
import type { SyncDoc } from './records'

/**
 * End-to-end encryption for sync. Everything here runs on the device; nothing that could
 * read a record ever leaves it.
 *
 *  - Each account has one random 256-bit master key, made on the first device that sets up sync.
 *  - Online, the master key exists only locked, twice over (`KeyDoc` at users/{uid}/vault/key):
 *    once with a key stretched from the person's sync passphrase (PBKDF2-SHA-256), once with a
 *    random recovery key they keep themselves. Neither the passphrase nor the recovery key is sent.
 *  - From the master key come two working keys (HKDF): AES-256-GCM for records and HMAC-SHA-256
 *    for document ids, so ids like `transactions:salary-2026-10-25` don't show either.
 *  - Each record is sealed whole (its id, kind, time and content), padded to a multiple of
 *    PAD_TO bytes, with the account, document and key bound in as associated data, so a sealed
 *    record can't be moved to another document or account without failing to open.
 */

export const PASSPHRASE_MIN = 12
/** OWASP's 2023 figure for PBKDF2-SHA-256. Stored with each lock, so it can be raised later. */
export const PBKDF2_ITERATIONS = 600_000
/** The sealed-record format. Bump it if the layout ever changes. */
export const SEALED_FORMAT = 1
const PAD_TO = 256

export interface PassphraseLock {
  salt: string
  iterations: number
  iv: string
  wrapped: string
}

export interface RecoveryLock {
  iv: string
  wrapped: string
}

/** The master key, locked two ways. The only key material online, and useless without a passphrase or recovery key. */
export interface KeyDoc {
  v: 1
  /** Random, says nothing. Changes only when the online copy is deleted and sync starts over. */
  keyId: string
  passphrase: PassphraseLock
  recovery: RecoveryLock
}

/** What a device needs to read and write records. Non-extractable: the browser won't hand the raw keys back. */
export interface SyncKeys {
  keyId: string
  records: CryptoKey
  ids: CryptoKey
}

/** A record as stored online: a random-looking id, which key sealed it, and the sealed bytes. */
export interface SealedDoc {
  id: string
  v: number
  key: string
  iv: string
  data: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const utf8 = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text) as Uint8Array<ArrayBuffer>
const HKDF_SALT = utf8('till/sync/v1')

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length))
}

function toBase64url(data: ArrayBuffer | Uint8Array): string {
  return toBase64(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const newKeyId = (): string => toBase64url(randomBytes(16))
export const newMasterKey = (): Uint8Array<ArrayBuffer> => randomBytes(32)

/** The same words typed on another keyboard can arrive as different code points (é vs e + accent). */
const normalized = (passphrase: string) => passphrase.normalize('NFC')

/** Why a new passphrase can't be used, or null when it can. */
export function passphraseProblem(passphrase: string): 'short' | null {
  return [...normalized(passphrase)].length < PASSPHRASE_MIN ? 'short' : null
}

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', utf8(normalized(passphrase)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function hkdfKey(secret: Uint8Array<ArrayBuffer>, info: string, algorithm: AesKeyGenParams | HmacKeyGenParams, usages: KeyUsage[]): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: utf8(info) }, base, algorithm, false, usages)
}

const AES: AesKeyGenParams = { name: 'AES-GCM', length: 256 }
const recoveryLockKey = (recovery: Uint8Array<ArrayBuffer>) => hkdfKey(recovery, 'till/recovery-key', AES, ['encrypt', 'decrypt'])

async function seal(key: CryptoKey, plain: Uint8Array<ArrayBuffer>, associated: string): Promise<{ iv: string; data: string }> {
  const iv = randomBytes(12)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(associated) }, key, plain)
  return { iv: toBase64(iv), data: toBase64(data) }
}

/** Null when the key is wrong, or the bytes were changed or moved. */
async function unseal(key: CryptoKey, iv: string, data: string, associated: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv), additionalData: utf8(associated) }, key, fromBase64(data))
    return new Uint8Array(plain)
  } catch {
    return null
  }
}

const lockContext = (how: 'passphrase' | 'recovery', uid: string, keyId: string) => `till/key/${how}/${uid}/${keyId}`
const recordContext = (uid: string, docId: string, keyId: string) => `till/record/${uid}/${docId}/${keyId}`

export async function lockWithPassphrase(master: Uint8Array<ArrayBuffer>, uid: string, keyId: string, passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<PassphraseLock> {
  const salt = randomBytes(16)
  const { iv, data } = await seal(await passphraseKey(passphrase, salt, iterations), master, lockContext('passphrase', uid, keyId))
  return { salt: toBase64(salt), iterations, iv, wrapped: data }
}

export async function lockWithRecovery(master: Uint8Array<ArrayBuffer>, uid: string, keyId: string, recovery: Uint8Array<ArrayBuffer>): Promise<RecoveryLock> {
  const { iv, data } = await seal(await recoveryLockKey(recovery), master, lockContext('recovery', uid, keyId))
  return { iv, wrapped: data }
}

export async function newKeyDoc(master: Uint8Array<ArrayBuffer>, uid: string, keyId: string, passphrase: string, recovery: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS): Promise<KeyDoc> {
  return {
    v: 1,
    keyId,
    passphrase: await lockWithPassphrase(master, uid, keyId, passphrase, iterations),
    recovery: await lockWithRecovery(master, uid, keyId, recovery),
  }
}

/** The master key, or null when the passphrase is wrong. */
export async function openWithPassphrase(doc: KeyDoc, uid: string, passphrase: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const { salt, iterations, iv, wrapped } = doc.passphrase
  try {
    return await unseal(await passphraseKey(passphrase, fromBase64(salt), iterations), iv, wrapped, lockContext('passphrase', uid, doc.keyId))
  } catch {
    return null
  }
}

/** The master key, or null when the recovery key is wrong. */
export async function openWithRecovery(doc: KeyDoc, uid: string, recovery: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  return unseal(await recoveryLockKey(recovery), doc.recovery.iv, doc.recovery.wrapped, lockContext('recovery', uid, doc.keyId))
}

export async function workingKeys(master: Uint8Array<ArrayBuffer>, keyId: string): Promise<SyncKeys> {
  return {
    keyId,
    records: await hkdfKey(master, 'till/records', AES, ['encrypt', 'decrypt']),
    ids: await hkdfKey(master, 'till/ids', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign']),
  }
}

/** The online document id for a record: the same on every device, meaningless to anyone else. */
export async function onlineId(keys: SyncKeys, localId: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', keys.ids, utf8(localId))
  // A letter first, so an id can never look like Firestore's reserved __name__ form.
  return `r${toBase64url(new Uint8Array(mac).slice(0, 24))}`
}

export async function sealDoc(keys: SyncKeys, uid: string, doc: SyncDoc): Promise<SealedDoc> {
  const id = await onlineId(keys, doc.id)
  const text = JSON.stringify({ id: doc.id, kind: doc.kind, updatedAt: doc.updatedAt, schema: doc.schema, json: doc.json })
  // Padded so the size online only hints at how big a record is. JSON ignores the trailing spaces.
  const size = utf8(text).length
  const padded = text + ' '.repeat((PAD_TO - (size % PAD_TO)) % PAD_TO)
  const { iv, data } = await seal(keys.records, utf8(padded), recordContext(uid, id, keys.keyId))
  return { id, v: SEALED_FORMAT, key: keys.keyId, iv, data }
}

/** The record, or null when it was sealed with another key, damaged, or moved from another document. */
export async function openDoc(keys: SyncKeys, uid: string, sealed: SealedDoc): Promise<SyncDoc | null> {
  if (sealed.v !== SEALED_FORMAT || sealed.key !== keys.keyId) return null
  const plain = await unseal(keys.records, sealed.iv, sealed.data, recordContext(uid, sealed.id, keys.keyId))
  if (!plain) return null
  try {
    const doc = JSON.parse(decoder.decode(plain)) as Partial<SyncDoc> | null
    if (!doc || typeof doc.id !== 'string' || typeof doc.kind !== 'string' || typeof doc.updatedAt !== 'string' || typeof doc.schema !== 'number' || typeof doc.json !== 'string') return null
    return { id: doc.id, kind: doc.kind, updatedAt: doc.updatedAt, schema: doc.schema, json: doc.json }
  } catch {
    return null
  }
}

// Recovery keys: 160 random bits as 32 Crockford base32 characters, in groups of four.
// Crockford leaves out I, L, O and U, so what's typed back is read the way it was meant.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const RECOVERY_BYTES = 20

export const newRecoveryKey = (): Uint8Array<ArrayBuffer> => randomBytes(RECOVERY_BYTES)

export function formatRecoveryKey(raw: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of raw) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    value &= (1 << bits) - 1
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out.match(/.{1,4}/g)?.join('-') ?? out
}

/** The raw key from what the person typed or pasted, or null when it can't be one. */
export function parseRecoveryKey(text: string): Uint8Array<ArrayBuffer> | null {
  const clean = text
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (clean.length !== Math.ceil((RECOVERY_BYTES * 8) / 5)) return null
  const raw = new Uint8Array(RECOVERY_BYTES)
  let bits = 0
  let value = 0
  let at = 0
  for (const char of clean) {
    const digit = ALPHABET.indexOf(char)
    if (digit < 0) return null
    value = (value << 5) | digit
    bits += 5
    if (bits >= 8) {
      raw[at++] = (value >>> (bits - 8)) & 255
      bits -= 8
      value &= (1 << bits) - 1
    }
  }
  return raw
}

/** A key document as read from online, checked. 'unreadable' when it's from a newer app or damaged. */
export function asKeyDoc(value: unknown): KeyDoc | 'unreadable' {
  const doc = value as Partial<KeyDoc> | null
  const text = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max
  if (!doc || doc.v !== 1 || !text(doc.keyId, 64)) return 'unreadable'
  const p = doc.passphrase
  const r = doc.recovery
  if (!p || !text(p.salt, 64) || typeof p.iterations !== 'number' || !text(p.iv, 64) || !text(p.wrapped, 256)) return 'unreadable'
  if (!r || !text(r.iv, 64) || !text(r.wrapped, 256)) return 'unreadable'
  return {
    v: 1,
    keyId: doc.keyId as string,
    passphrase: { salt: p.salt, iterations: p.iterations, iv: p.iv, wrapped: p.wrapped },
    recovery: { iv: r.iv, wrapped: r.wrapped },
  }
}
