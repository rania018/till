import { useSyncExternalStore } from 'react'
import { useStore } from 'zustand'
import type { StateStorage } from 'zustand/middleware'
import { createIdbStorage, STORAGE_KEY } from './storage'
import { createAppStore, type AppState, type LoadStatus } from './store'

export { pickData, whenHydrated, type AppActions, type AppState, type LoadStatus, type TransactionInput } from './store'

/** The app's single store, saved in IndexedDB. Loading starts when this module is first imported. */
const idb = createIdbStorage()
// Tells the app's other tabs and windows when the saved copy changes, so they can't overwrite it with older data.
const otherTabs = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('till-saved-data')
const storage: StateStorage = {
  getItem: idb.getItem,
  removeItem: idb.removeItem,
  setItem: async (name, value) => {
    await idb.setItem(name, value)
    if (name === STORAGE_KEY) otherTabs?.postMessage('saved')
  },
}
export const appStore = createAppStore(storage)

function takeInSaved() {
  appStore.takeInSaved().catch((error: unknown) => console.error('Could not read what another tab saved.', error))
}
if (otherTabs) otherTabs.onmessage = takeInSaved
// A tab from before this code can't say it saved: coming back to the screen catches that too.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') takeInSaved()
  })
}

/** Resolves once changes made so far are on disk: IndexedDB runs this read after any write already started. */
export async function savedDataWritten(): Promise<void> {
  await storage.getItem(STORAGE_KEY)
}

/**
 * Reads from the store in a component. Selectors that build new arrays or
 * objects need `useShallow` from `zustand/react/shallow` to avoid re-render loops.
 */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector)
}

/** `loading` until saved data is in, then `ready`, or `failed` if it couldn't be read. */
export function useLoadStatus(): LoadStatus {
  return useSyncExternalStore(appStore.subscribeLoadStatus, appStore.loadStatus)
}
