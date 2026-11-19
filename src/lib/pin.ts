/**
 * The app lock's PIN: kept on this device only, as a salted PBKDF2 hash, never the digits. The lock
 * is a privacy screen, not encryption: the saved data itself isn't encrypted by it.
 */

export const PIN_MIN = 4
export const PIN_MAX = 8
const ITERATIONS = 150_000

export interface PinHash {
  salt: string
  hash: string
  iterations: number
  /** How many digits, so the lock screen can check as soon as the last one is typed. */
  length: number
}

export function isValidPin(pin: string): boolean {
  return /^\d+$/.test(pin) && pin.length >= PIN_MIN && pin.length <= PIN_MAX
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let text = ''
  for (const byte of view) text += String.fromCharCode(byte)
  return btoa(text)
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return toBase64(bits)
}

export async function hashPin(pin: string, iterations = ITERATIONS): Promise<PinHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { salt: toBase64(salt), hash: await derive(pin, salt, iterations), iterations, length: pin.length }
}

export async function checkPin(pin: string, saved: PinHash): Promise<boolean> {
  const hash = await derive(pin, fromBase64(saved.salt), saved.iterations)
  // Same length always; compared in full so the time taken doesn't hint at how much matched.
  let difference = hash.length ^ saved.hash.length
  for (let i = 0; i < Math.max(hash.length, saved.hash.length); i++) difference |= (hash.charCodeAt(i) || 0) ^ (saved.hash.charCodeAt(i) || 0)
  return difference === 0
}

/** Wrong tries allowed before a wait, and the first wait. Each wait after that is twice as long. */
export const FREE_TRIES = 5
const FIRST_WAIT_MS = 30_000

export interface Tries {
  failed: number
  /** No more tries before this moment (ms since 1970). */
  waitUntil: number
}

export const NO_TRIES: Tries = { failed: 0, waitUntil: 0 }

/** After a wrong PIN: every try past the free ones means a wait, doubling each time. */
export function afterWrongPin(tries: Tries, now: number): Tries {
  const failed = tries.failed + 1
  const past = failed - FREE_TRIES
  return { failed, waitUntil: past >= 0 ? now + FIRST_WAIT_MS * 2 ** Math.min(past, 6) : 0 }
}

/** Tries left before the next wait, or 0 while waiting. */
export function triesLeft(tries: Tries, now: number): number {
  if (tries.waitUntil > now) return 0
  return Math.max(1, FREE_TRIES - tries.failed)
}
