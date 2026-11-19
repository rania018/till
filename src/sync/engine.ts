import { SCHEMA_VERSION } from '../store/migrations'
import { dirtyDocs, mergeDocs, type SyncDoc, type SyncedData } from './records'

/** A document as it came back from online, with the server's time of its last write. */
export interface RemoteDoc extends SyncDoc {
  syncedAtMs: number
}

/** The online side. Firestore in the app (firestoreRemote.ts), an in-memory one in tests. */
export interface SyncRemote {
  /** Calls `onDocs` with documents written after `sinceMs`, once confirmed by the server, and again on every later change. */
  listen(sinceMs: number, onDocs: (docs: RemoteDoc[]) => void, onError: (error: unknown) => void): () => void
  write(docs: SyncDoc[]): Promise<void>
}

/** What this device remembers between runs. */
export interface SyncCursor {
  uid: string
  /** Server time of the newest document seen, so a restart only reads what's new. */
  sinceMs: number
  /** What's online, as far as this device knows: document id → `updatedAt`. */
  seen: Record<string, string>
  lastSyncedAt?: string
}

export interface SyncCursorStore {
  load(): Promise<SyncCursor | null>
  save(cursor: SyncCursor): Promise<void>
  clear(): Promise<void>
}

/** The app's data, as sync sees it. */
export interface SyncTarget {
  read(): SyncedData
  apply(data: SyncedData): void
  subscribe(listener: () => void): () => void
}

export type EnginePhase = 'connecting' | 'syncing' | 'synced' | 'offline' | 'error' | 'outdated'

export interface SyncEngineOptions {
  uid: string
  target: SyncTarget
  remote: SyncRemote
  cursors: SyncCursorStore
  isOnline: () => boolean
  onStatus: (phase: EnginePhase, lastSyncedAt?: string) => void
  /** Called after each merge from online. */
  onPulled?: () => void
  /** A burst of edits within this pause is one write. */
  pushDelayMs?: number
  retryDelayMs?: number
}

/** Reads overlap by this much, in case two writes landed close together around the cursor. */
export const CURSOR_MARGIN_MS = 5 * 60_000

/**
 * Keeps local data and the online copy the same. Always reads before it writes:
 * nothing is sent until the online copy has been merged in, so a new or long-offline
 * device can't overwrite newer data. Anything unsent stays different from `seen`,
 * so it goes out on the next run, however the last one ended.
 */
export function createSyncEngine({ uid, target, remote, cursors, isOnline, onStatus, onPulled, pushDelayMs = 1_500, retryDelayMs = 60_000 }: SyncEngineOptions) {
  let cursor: SyncCursor = { uid, sinceMs: 0, seen: {} }
  let stopped = false
  let pulled = false
  let pushing = false
  let outdated = false
  let stopListening: (() => void) | undefined
  let stopWatching: (() => void) | undefined
  let pushTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  const remember = () => void cursors.save(cursor).catch((error) => console.error('Could not save the sync position.', error))
  const report = (phase: EnginePhase) => {
    if (!stopped) onStatus(phase, cursor.lastSyncedAt)
  }

  function retryLater() {
    report('error')
    clearTimeout(retryTimer)
    retryTimer = setTimeout(resync, retryDelayMs)
  }

  function listen() {
    stopListening?.()
    pulled = false
    if (stopped || outdated) return
    report(isOnline() ? 'connecting' : 'offline')
    stopListening = remote.listen(Math.max(0, cursor.sinceMs - CURSOR_MARGIN_MS), onDocs, (error) => {
      console.error('Sync could not read the online copy.', error)
      retryLater()
    })
  }

  function onDocs(docs: RemoteDoc[]) {
    if (stopped) return
    if (docs.some((doc) => doc.schema > SCHEMA_VERSION)) {
      // Written by a newer version of the app: leave everything alone until this one updates.
      outdated = true
      stopListening?.()
      report('outdated')
      return
    }
    const { data, changed } = mergeDocs(target.read(), docs)
    for (const doc of docs) {
      cursor.seen[doc.id] = doc.updatedAt
      cursor.sinceMs = Math.max(cursor.sinceMs, doc.syncedAtMs)
    }
    pulled = true
    if (changed) target.apply(data)
    onPulled?.()
    remember()
    void push()
  }

  async function push(): Promise<void> {
    clearTimeout(pushTimer)
    if (stopped || pushing || !pulled || outdated) return
    const docs = dirtyDocs(target.read(), cursor.seen)
    if (docs.length === 0) {
      cursor.lastSyncedAt = new Date().toISOString()
      remember()
      report('synced')
      return
    }
    if (!isOnline()) {
      report('offline')
      return
    }
    pushing = true
    report('syncing')
    try {
      await remote.write(docs)
      for (const doc of docs) cursor.seen[doc.id] = doc.updatedAt
      remember()
      pushing = false
    } catch (error) {
      pushing = false
      console.error('Sync could not save to the online copy.', error)
      retryLater()
      return
    }
    // Anything changed while that was on its way goes out now.
    return push()
  }

  /** Reads what's new, then sends what's different. */
  function resync() {
    clearTimeout(retryTimer)
    listen()
  }

  return {
    async start(): Promise<void> {
      const saved = await cursors.load()
      if (stopped) return
      // Another account's position means nothing here: start over and merge.
      if (saved?.uid === uid) cursor = saved
      stopWatching = target.subscribe(() => {
        clearTimeout(pushTimer)
        pushTimer = setTimeout(() => void push(), pushDelayMs)
      })
      listen()
    },
    resync,
    /** Sends pending changes now, when the app is about to leave the screen. */
    flush: () => void push(),
    /** The connection dropped: a read that's waiting finishes by itself when it's back. */
    wentOffline: () => report('offline'),
    stop() {
      stopped = true
      clearTimeout(pushTimer)
      clearTimeout(retryTimer)
      stopListening?.()
      stopWatching?.()
    },
  }
}

export type SyncEngine = ReturnType<typeof createSyncEngine>
