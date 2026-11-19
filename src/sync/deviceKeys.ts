import { del, get, set } from 'idb-keyval'
import { appIdbStore } from '../store/storage'
import type { SyncKeys } from './vault'

/**
 * This device's working keys, so the passphrase is typed once per device. Kept in IndexedDB
 * as non-extractable CryptoKeys: the page can use them, but the browser never hands their
 * bytes back, not even to the app. Removed on sign-out and when the online copy goes.
 */

export interface SavedKeys extends SyncKeys {
  uid: string
}

const KEY = 'sync-keys'
/** The BroadcastChannel a tab posts on once it has saved keys, for the app's other tabs. */
export const KEYS_SAVED = 'till-sync-keys'

export const deviceKeys = {
  async load(): Promise<SavedKeys | null> {
    try {
      const saved = await get<SavedKeys>(KEY, appIdbStore())
      return saved && typeof saved.uid === 'string' && typeof saved.keyId === 'string' && saved.records && saved.ids ? saved : null
    } catch (error) {
      console.error('Could not read this device’s sync keys.', error)
      return null
    }
  },
  async save(keys: SavedKeys): Promise<void> {
    await set(KEY, keys, appIdbStore())
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(KEYS_SAVED)
      channel.postMessage('saved')
      channel.close()
    }
  },
  clear: (): Promise<void> => del(KEY, appIdbStore()),
}
