import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore as createVanillaStore } from 'zustand/vanilla'
import { toast } from '../components/ui/toastStore'
import { readCloudSettings } from '../config/cloudSettings'
import { t } from '../i18n'
import { appStore } from '../store'
import { clearSyncedAccount, isSyncOn, setSyncOn, syncedAccount, rememberSyncedAccount } from '../store/deviceState'
import { createIdbStorage } from '../store/storage'
import type { AppState } from '../store'
import { deviceKeys, KEYS_SAVED } from './deviceKeys'
import { createSyncEngine, type EnginePhase, type SyncCursor, type SyncCursorStore, type SyncEngine, type SyncTarget } from './engine'
import type { OnlineKey, OnlineStore } from './firestoreRemote'
import { mergeDocs, type SyncedData } from './records'
import { createSealedRemote } from './sealedRemote'
import {
  formatRecoveryKey,
  lockWithPassphrase,
  lockWithRecovery,
  newKeyDoc,
  newKeyId,
  newMasterKey,
  newRecoveryKey,
  openWithPassphrase,
  openWithRecovery,
  parseRecoveryKey,
  workingKeys,
  type KeyDoc,
  type SyncKeys,
} from './vault'

/**
 * Google sign-in and end-to-end encrypted sync, for the rest of the app. Firebase itself only
 * runs when someone signs in, or has before on this device.
 *
 * Signed in, a device is in one of three places:
 *  - setup: the account has no key online yet. A passphrase makes one (see vault.ts).
 *  - locked: the account has a key, and this device hasn't opened it yet. The passphrase or recovery key opens it.
 *  - syncing: this device holds the account's working keys, and the engine runs (engine.ts phases).
 */

export type SyncPhase = 'off' | 'signing-in' | 'setup' | 'locked' | EnginePhase

export interface SyncStatus {
  phase: SyncPhase
  email?: string
  lastSyncedAt?: string
}

const statusStore = createVanillaStore<SyncStatus>(() => ({ phase: 'off' }))
const report = (status: SyncStatus) => statusStore.setState(status, true)

export function useSyncStatus(): SyncStatus {
  return useStore(statusStore)
}

function syncedPart({ profile, settings, accounts, categories, bills, transactions, goals, debts, incomes, quickItems, assets, wishlist }: AppState): SyncedData {
  return { profile, settings, accounts, categories, bills, transactions, goals, debts, incomes, quickItems, assets, wishlist }
}

const target: SyncTarget = {
  read: () => syncedPart(appStore.getState()),
  apply: (data) => appStore.getState().applySynced(data),
  subscribe: (listener) => appStore.subscribe(listener),
}

const CURSOR_KEY = 'sync-cursor'
const cursorStorage = createIdbStorage()
const cursors: SyncCursorStore = {
  load: async () => {
    const saved = await cursorStorage.getItem(CURSOR_KEY)
    return saved ? (JSON.parse(saved as string) as SyncCursor) : null
  },
  save: async (cursor) => {
    await cursorStorage.setItem(CURSOR_KEY, JSON.stringify(cursor))
  },
  clear: async () => {
    await cursorStorage.removeItem(CURSOR_KEY)
  },
}

type Firebase = typeof import('./firebase')
type User = import('./firebase').User

let firebase: Promise<Firebase> | undefined

/** Whether Google sign-in and sync exist in this build (see src/config/cloudSettings.ts). When they don't, Firebase's code is never imported. */
export const SYNC_ENABLED: boolean = readCloudSettings(import.meta.env).syncEnabled

const loadFirebase = () => (firebase ??= SYNC_ENABLED ? import('./firebase') : Promise.reject(new Error('Sync is not set up in this build.')))

/** Sync is on for this device and exists in this build. */
const syncIsOn = () => SYNC_ENABLED && isSyncOn()

/** How long a write waits for the server to confirm the key before trying again later. */
const KEY_CONFIRM_MS = 30_000
const KEY_RETRY_MS = 60_000

/** The signed-in account this device follows. */
interface Session {
  fb: Firebase
  user: User
  email?: string
  store: OnlineStore
  /** The key document as last confirmed by the server; undefined until it has answered. */
  online?: OnlineKey
  /** This device's working keys, once it has opened the account's key. */
  keys?: SyncKeys
  engine?: SyncEngine
  stopWatching?: () => void
  retryTimer?: ReturnType<typeof setTimeout>
  /** Writes waiting for the server to confirm the key. */
  waiters: Set<() => void>
  /** A setup or unlock is under way: news from the key watcher waits for it to finish. */
  busy: boolean
  /** Records left from before encryption were checked for this session. */
  tidied: boolean
  /** Ids of plaintext records merged here, to delete once they've gone back up sealed. */
  plainMerged?: string[]
}

let session: Session | undefined
let signingIn = false
let booted: Promise<void> | undefined

function stopEngine(s: Session) {
  s.engine?.stop()
  s.engine = undefined
}

function stopFollowing() {
  const s = session
  if (!s) return
  session = undefined
  stopEngine(s)
  s.stopWatching?.()
  clearTimeout(s.retryTimer)
  // Writes waiting on the key give up now.
  s.waiters.forEach((wake) => wake())
  s.waiters.clear()
}

/** Forgets this device's keys and sync position: whatever key comes next, everything is read and sent again. */
async function dropKeys(s: Session) {
  stopEngine(s)
  s.keys = undefined
  await Promise.all([deviceKeys.clear(), cursors.clear()]).catch((error: unknown) => console.error('Could not forget the sync keys.', error))
}

/** Resolves once the server confirms the key online is `keyId`; throws when it's another or none. */
function confirmKey(s: Session, keyId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    /** True once there's an answer, which it gives. */
    const answered = () => {
      if (session !== s) reject(new Error('Signed out.'))
      else if (s.online === undefined) return false
      else if (s.online && s.online !== 'unreadable' && s.online.keyId === keyId) resolve()
      else reject(new Error('The key online is no longer this device’s.'))
      return true
    }
    if (answered()) return
    const check = () => {
      if (!answered()) return
      clearTimeout(timer)
      s.waiters.delete(check)
    }
    const timer = setTimeout(() => {
      s.waiters.delete(check)
      reject(new Error('The key online could not be confirmed.'))
    }, KEY_CONFIRM_MS)
    s.waiters.add(check)
  })
}

/**
 * Takes the records saved before sync was encrypted down from online, once this device holds
 * them: they're merged in here, sent back up sealed by the engine, and only then deleted.
 * Also removes records sealed with a key that's no longer the account's. Runs on "synced",
 * which the engine only reports once everything here is online.
 */
async function tidyOnline(s: Session) {
  if (s.tidied || !s.keys) return
  s.tidied = true
  try {
    if (s.plainMerged) {
      // Merged on the last "synced", and sent up sealed since: now they can go.
      await s.store.remove(s.plainMerged)
      s.plainMerged = undefined
    }
    const plain = await s.store.readPlain()
    if (plain.length > 0) {
      const { data, changed } = mergeDocs(target.read(), plain)
      if (changed) {
        s.plainMerged = plain.map((doc) => doc.id)
        s.tidied = false
        target.apply(data)
        return
      }
      await s.store.remove(plain.map((doc) => doc.id))
    }
    const keyId = s.keys.keyId
    const online = await s.store.readKey()
    if (online && online !== 'unreadable' && online.keyId === keyId) {
      const stale = await s.store.staleIds(keyId)
      if (stale.length > 0) await s.store.remove(stale)
    }
  } catch (error) {
    s.tidied = false
    console.error('Could not tidy the online copy.', error)
  }
}

function startEngine(s: Session) {
  if (s.engine || !s.keys) return
  const keys = s.keys
  const engine = createSyncEngine({
    uid: s.user.uid,
    target,
    remote: createSealedRemote({ store: s.store, uid: s.user.uid, keys, confirmKey: (keyId) => confirmKey(s, keyId) }),
    cursors,
    isOnline: () => navigator.onLine,
    onStatus: (phase, lastSyncedAt) => {
      if (session !== s || s.engine !== engine) return
      report({ phase, email: s.email, lastSyncedAt })
      if (phase === 'synced') void tidyOnline(s)
    },
  })
  s.engine = engine
  void engine.start()
}

/**
 * The online copy and the account were deleted from another device: this one signs out and
 * forgets the account, rather than offering a setup that would save data under an account
 * that no longer exists. True when that's what happened.
 */
async function leaveIfAccountGone(s: Session): Promise<boolean> {
  try {
    if (await s.fb.accountExists(s.user)) return false
  } catch {
    // Offline, or Firebase couldn't say: nothing to conclude.
    return false
  }
  // Firebase may already have signed out on its own, which stopped following.
  if (session === s) stopFollowing()
  await Promise.all([cursors.clear(), deviceKeys.clear()]).catch(() => undefined)
  clearSyncedAccount()
  setSyncOn(false)
  report({ phase: 'off' })
  toast(t.vault.accountGone, { tone: 'warn', duration: 10_000 })
  await s.fb.signOut().catch(() => undefined)
  return true
}

/** Puts the device where the key online and the keys it holds say it should be. */
function settle(s: Session) {
  if (session !== s || s.busy) return
  const { online, keys, email } = s
  if (online === undefined) {
    // Not heard from the server yet. A device with its key starts at once so it works offline;
    // its writes still wait for the server to confirm the key (confirmKey).
    if (keys) startEngine(s)
    else report({ phase: navigator.onLine ? 'connecting' : 'offline', email })
    return
  }
  if (online === 'unreadable') {
    stopEngine(s)
    report({ phase: 'outdated', email })
    return
  }
  if (online === null) {
    // No key online: a first setup, or the online copy was deleted from another device,
    // maybe with the account itself.
    if (keys) void dropKeys(s)
    stopEngine(s)
    report({ phase: 'setup', email })
    void leaveIfAccountGone(s)
    return
  }
  if (keys?.keyId === online.keyId) {
    startEngine(s)
    return
  }
  stopEngine(s)
  report({ phase: 'locked', email })
  // Another tab of the app on this device may have opened this key already.
  const keyId = online.keyId
  void storedKeysFor(s, keyId).then((stored) => {
    const latest = s.online
    if (session !== s || s.busy || !latest || latest === 'unreadable' || latest.keyId !== keyId) return
    if (stored) {
      s.keys = stored
      s.tidied = false
      settle(s)
    } else if (s.keys) {
      // Sync was started over on another device, with a new key. This one needs the new passphrase.
      void dropKeys(s)
      toast(t.vault.keyChanged, { tone: 'warn', duration: 10_000 })
    }
  })
}

/** Keys saved on this device for this account, when they're for `keyId`. */
async function storedKeysFor(s: Session, keyId: string): Promise<SyncKeys | null> {
  const saved = await deviceKeys.load()
  return saved?.uid === s.user.uid && saved.keyId === keyId ? { keyId, records: saved.records, ids: saved.ids } : null
}

// A tab that opened the key tells the app's other tabs, so the passphrase is typed once per device.
const keysSaved = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(KEYS_SAVED)
if (keysSaved) {
  keysSaved.onmessage = () => {
    if (session && !session.engine) settle(session)
  }
}

function watchKey(s: Session) {
  s.stopWatching?.()
  clearTimeout(s.retryTimer)
  s.stopWatching = s.store.watchKey(
    (key) => {
      if (session !== s) return
      s.online = key
      s.waiters.forEach((wake) => wake())
      settle(s)
    },
    (error) => {
      if (session !== s) return
      console.error('Sync could not read the key online.', error)
      s.online = undefined
      stopEngine(s)
      report({ phase: 'error', email: s.email })
      s.retryTimer = setTimeout(() => {
        if (session === s) watchKey(s)
      }, KEY_RETRY_MS)
    },
  )
}

function follow(fb: Firebase, user: User) {
  const s: Session = { fb, user, email: user.email ?? undefined, store: fb.remoteFor(user.uid), waiters: new Set(), busy: false, tidied: false }
  session = s
  report({ phase: 'connecting', email: s.email })
  void (async () => {
    const saved = await deviceKeys.load()
    if (session !== s) return
    if (saved?.uid === user.uid) s.keys = { keyId: saved.keyId, records: saved.records, ids: saved.ids }
    else if (saved) await deviceKeys.clear().catch(() => undefined)
    watchKey(s)
    settle(s)
  })()
}

function handleUser(fb: Firebase, user: User | null) {
  if (!user) {
    stopFollowing()
    if (signingIn) return
    setSyncOn(false)
    report({ phase: 'off' })
    return
  }
  if (session?.user.uid === user.uid) return
  const previous = syncedAccount()
  if (previous && previous !== user.uid) {
    // Merging would put one person's money into another's account.
    toast(t.sync.wrongAccount, { tone: 'crit', duration: 10_000 })
    signingIn = false
    void fb.signOut()
    return
  }
  rememberSyncedAccount(user.uid)
  setSyncOn(true)
  follow(fb, user)
}

function signInMessage(error: unknown): string | null {
  const code = (error as { code?: string }).code
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') return null
  if (code === 'auth/network-request-failed') return t.sync.offline
  return t.sync.signInFailed
}

function showSignInError(error: unknown) {
  console.error('Google sign-in failed.', error)
  const message = signInMessage(error)
  if (message) toast(message, { tone: 'crit' })
}

/** Loads Firebase and starts following the signed-in user. Finishes a redirect sign-in first. */
function boot(): Promise<void> {
  booted ??= (async () => {
    const fb = await loadFirebase()
    await fb.finishRedirect().catch(showSignInError)
    await new Promise<void>((resolve) => {
      fb.onUserChange((user) => {
        handleUser(fb, user)
        resolve()
      })
    })
  })().catch((error: unknown) => {
    // Firebase's file couldn't load. Forget the attempt, so the next one starts over.
    firebase = undefined
    booted = undefined
    throw error
  })
  return booted
}

export async function signIn(): Promise<void> {
  if (!SYNC_ENABLED) return
  if (!navigator.onLine) {
    toast(t.sync.offline, { tone: 'crit' })
    return
  }
  signingIn = true
  report({ phase: 'signing-in' })
  try {
    await boot()
    const fb = await loadFirebase()
    // Set before leaving for Google's page, so the app picks the sign-in up when it comes back.
    setSyncOn(true)
    await fb.signInWithGoogle()
  } catch (error) {
    setSyncOn(false)
    showSignInError(error)
  } finally {
    signingIn = false
    if (statusStore.getState().phase === 'signing-in') report({ phase: 'off' })
  }
}

/** Starts sync if it's on but couldn't start when the app opened. */
function bootIfOn() {
  boot().catch((error: unknown) => {
    console.error('Sync could not start.', error)
    report({ phase: 'error' })
  })
}

export function syncNow(): void {
  const s = session
  if (s?.engine) s.engine.resync()
  else if (s) watchKey(s)
  else if (syncIsOn()) bootIfOn()
}

/** Stops syncing. The data stays here and online; signing in again (and the passphrase) merges whatever changed. */
export async function signOut(): Promise<void> {
  session?.engine?.flush()
  stopFollowing()
  await Promise.all([cursors.clear(), deviceKeys.clear()])
  setSyncOn(false)
  report({ phase: 'off' })
  if (SYNC_ENABLED) await (await loadFirebase()).signOut()
}

/**
 * Removes everything online (records and the locked key), removes the account from the app's
 * Firebase project, and signs out. This device keeps its data. Throws with a message if it can't.
 */
export async function deleteOnlineCopy(): Promise<void> {
  const s = session
  if (!s) return
  if (!navigator.onLine) throw new Error(t.sync.deleteOffline)
  stopEngine(s)
  s.busy = true
  try {
    await s.store.deleteAll()
  } catch (error) {
    console.error('Could not delete the online copy.', error)
    s.busy = false
    settle(s)
    throw new Error(t.sync.deleteFailed, { cause: error })
  }
  stopFollowing()
  await Promise.all([cursors.clear(), deviceKeys.clear()])
  setSyncOn(false)
  report({ phase: 'off' })
  if (await s.fb.deleteAccount()) {
    // A new sign-in with the same Google account is a new account now, and may take this data.
    clearSyncedAccount()
  } else {
    toast(t.vault.accountKept, { tone: 'warn', duration: 10_000 })
    await s.fb.signOut()
  }
}

/** "Delete everything": this device and, when signed in, the online copy. Throws with a message if it can't. */
export async function deleteEverything(): Promise<void> {
  if (syncIsOn()) await boot()
  await deleteOnlineCopy()
  appStore.getState().resetAll()
  clearSyncedAccount()
}

/**
 * A forgotten lock PIN: this device's data goes and the online copy stays, so signing in again brings
 * it all back. What hasn't reached the online copy yet is sent first, if the device is online.
 */
export async function forgetThisDevice(): Promise<void> {
  if (syncIsOn()) {
    try {
      await signOut()
    } catch (error) {
      console.error('Could not sign out before forgetting this device.', error)
    }
  }
  appStore.getState().resetAll()
  clearSyncedAccount()
}

// The passphrase and recovery key. Each function throws an Error with a message for the person.

function current(): Session {
  if (!session) throw new Error(t.vault.signedOut)
  return session
}

function onlineKey(s: Session): KeyDoc {
  if (!s.online || s.online === 'unreadable') throw new Error(t.vault.notReady)
  return s.online
}

function offlineCheck() {
  if (!navigator.onLine) throw new Error(t.vault.offline)
}

async function whileBusy<T>(s: Session, work: () => Promise<T>): Promise<T> {
  s.busy = true
  try {
    return await work()
  } finally {
    s.busy = false
    settle(s)
  }
}

/** This device now holds `keys`: everything is read and sent again under them. */
async function adopt(s: Session, keys: SyncKeys) {
  stopEngine(s)
  await cursors.clear()
  await deviceKeys.save({ uid: s.user.uid, ...keys })
  s.keys = keys
  s.tidied = false
}

export interface PendingKey {
  /** Shown once, for the person to keep. */
  recoveryKey: string
  /** Saves it online. Nothing is saved before this. */
  finish(): Promise<void>
}

/** Setting up an account that has no key yet: makes the keys here. finish() saves them and starts syncing. */
export async function prepareSetup(passphrase: string): Promise<PendingKey> {
  const s = current()
  const master = newMasterKey()
  const keyId = newKeyId()
  const recovery = newRecoveryKey()
  const key = await newKeyDoc(master, s.user.uid, keyId, passphrase, recovery)
  return {
    recoveryKey: formatRecoveryKey(recovery),
    finish: () => {
      offlineCheck()
      return whileBusy(s, async () => {
        if (await leaveIfAccountGone(s)) throw new Error(t.vault.signedOut)
        try {
          await s.store.createKey(key)
        } catch (error) {
          if ((error as { code?: string }).code === 'till/key-exists') {
            s.online = await s.store.readKey().catch(() => s.online)
            throw new Error(t.vault.alreadySetUp)
          }
          console.error('Could not save the sync key.', error)
          throw new Error(t.vault.saveFailed, { cause: error })
        }
        s.online = key
        await adopt(s, await workingKeys(master, keyId))
      })
    },
  }
}

/** Opens the account's key on this device. False when the passphrase doesn't match. */
export async function unlock(passphrase: string): Promise<boolean> {
  const s = current()
  const key = onlineKey(s)
  const master = await openWithPassphrase(key, s.user.uid, passphrase)
  if (!master) return false
  await whileBusy(s, async () => adopt(s, await workingKeys(master, key.keyId)))
  return true
}

/** A forgotten passphrase: the recovery key opens the account here and a new passphrase replaces the old one. False when the recovery key doesn't match. */
export async function unlockWithRecovery(recoveryKey: string, newPassphrase: string): Promise<boolean> {
  const s = current()
  const key = onlineKey(s)
  const raw = parseRecoveryKey(recoveryKey)
  const master = raw && (await openWithRecovery(key, s.user.uid, raw))
  if (!master) return false
  offlineCheck()
  await whileBusy(s, async () => {
    const next: KeyDoc = { ...key, passphrase: await lockWithPassphrase(master, s.user.uid, key.keyId, newPassphrase) }
    try {
      await s.store.updateKey(next)
    } catch (error) {
      console.error('Could not save the new passphrase.', error)
      throw new Error(t.vault.saveFailed, { cause: error })
    }
    s.online = next
    await adopt(s, await workingKeys(master, key.keyId))
  })
  return true
}

/** False when the current passphrase doesn't match. Other devices keep syncing: the key itself doesn't change. */
export async function changePassphrase(currentPassphrase: string, newPassphrase: string): Promise<boolean> {
  const s = current()
  const key = onlineKey(s)
  const master = await openWithPassphrase(key, s.user.uid, currentPassphrase)
  if (!master) return false
  offlineCheck()
  const next: KeyDoc = { ...key, passphrase: await lockWithPassphrase(master, s.user.uid, key.keyId, newPassphrase) }
  try {
    await s.store.updateKey(next)
  } catch (error) {
    console.error('Could not save the new passphrase.', error)
    throw new Error(t.vault.saveFailed, { cause: error })
  }
  s.online = next
  return true
}

/** A new recovery key in place of the old one, which stops working on finish(). Null when the passphrase doesn't match. */
export async function prepareRecoveryKey(passphrase: string): Promise<PendingKey | null> {
  const s = current()
  const key = onlineKey(s)
  const master = await openWithPassphrase(key, s.user.uid, passphrase)
  if (!master) return null
  const recovery = newRecoveryKey()
  return {
    recoveryKey: formatRecoveryKey(recovery),
    finish: async () => {
      offlineCheck()
      const latest = onlineKey(s)
      if (latest.keyId !== key.keyId) throw new Error(t.vault.notReady)
      const next: KeyDoc = { ...latest, recovery: await lockWithRecovery(master, s.user.uid, key.keyId, recovery) }
      try {
        await s.store.updateKey(next)
      } catch (error) {
        console.error('Could not save the new recovery key.', error)
        throw new Error(t.vault.saveFailed, { cause: error })
      }
      s.online = next
    },
  }
}

/**
 * Passphrase and recovery key both lost: deletes the online copy, which no one can open any
 * more, and goes back to setup. This device's data stays and goes back up under a new passphrase.
 */
export async function startOver(): Promise<void> {
  const s = current()
  offlineCheck()
  await whileBusy(s, async () => {
    try {
      await s.store.deleteAll()
    } catch (error) {
      console.error('Could not delete the online copy.', error)
      throw new Error(t.sync.deleteFailed, { cause: error })
    }
    await dropKeys(s)
    s.online = null
  })
}

/** How long the app can be away before coming back also checks for changes. */
const RESYNC_AFTER_MS = 60_000

/** Starts sync when the app has loaded, if it's on, and keeps it going through the app's life. */
export function useCloudSync(ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    if (syncIsOn()) {
      report({ phase: 'connecting' })
      bootIfOn()
    }
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        session?.engine?.flush()
      } else if (Date.now() - hiddenAt > RESYNC_AFTER_MS) {
        syncNow()
      }
    }
    const onOnline = () => syncNow()
    const onOffline = () => session?.engine?.wentOffline()
    // Back from Google's page with the browser's Back button: the page wasn't reloaded.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && statusStore.getState().phase === 'signing-in') {
        setSyncOn(false)
        report({ phase: 'off' })
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [ready])
}
