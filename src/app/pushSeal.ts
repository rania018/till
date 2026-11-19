import { get, update } from 'idb-keyval'
import { toBase64 } from '../lib/pin'
import { appIdbStore } from '../store/storage'

/**
 * A key that never leaves this device, for the bill names and amounts in push reminders.
 * The app seals them before they go to the push server, which can't read them; this device's
 * service worker (public/sw-notifications.js) opens them when a reminder arrives. Kept in
 * IndexedDB as a non-extractable AES-GCM key, under PUSH_KEY: the SW reads it from there.
 */

export const PUSH_KEY = 'push-key'
/** Bound into every seal; the service worker uses the same. */
export const PUSH_CONTEXT = 'till/push'

let key: Promise<CryptoKey> | undefined

function deviceKey(): Promise<CryptoKey> {
  key ??= (async () => {
    const made = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    // In one transaction, so two open tabs end up with the same key.
    await update<CryptoKey>(PUSH_KEY, (saved) => saved ?? made, appIdbStore())
    const saved = await get<CryptoKey>(PUSH_KEY, appIdbStore())
    if (!saved) throw new Error('The push key could not be saved.')
    return saved
  })().catch((error: unknown) => {
    key = undefined
    throw error
  })
  return key
}

/** `nonce.sealed`, both base64: what the push server stores and sends back unread. */
export async function sealForPush(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(PUSH_CONTEXT) }, await deviceKey(), encoder.encode(text))
  return `${toBase64(iv)}.${toBase64(data)}`
}
