import { createStore, del, get, set, type UseStore } from 'idb-keyval'
import type { StateStorage } from 'zustand/middleware'

/**
 * Key the app's data is saved under. The old two-person app used the
 * localStorage key `expense-tracker-data`; it's left untouched, not migrated.
 */
export const STORAGE_KEY = 'expense-tracker'

/**
 * Saves the store in IndexedDB, which holds far more than localStorage and
 * works offline. This is the piece to swap or wrap for Firebase sync later.
 * The database opens on first use, so importing this never touches IndexedDB.
 */
let sharedStore: UseStore | undefined

/**
 * The app's own IndexedDB store, for values that aren't JSON: the sync and push CryptoKeys,
 * which the browser can store and use but never hands back as bytes. Opens on first use.
 */
export const appIdbStore = (): UseStore => (sharedStore ??= createStore('expense-tracker', 'state'))

export function createIdbStorage(dbName = 'expense-tracker', storeName = 'state'): StateStorage {
  let db: UseStore | undefined
  const store = () => (db ??= createStore(dbName, storeName))
  return {
    getItem: async (name) => (await get<string>(name, store())) ?? null,
    setItem: (name, value) => set(name, value, store()),
    removeItem: (name) => del(name, store()),
  }
}
