import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore'
import type { SyncDoc } from './records'
import { asKeyDoc, SEALED_FORMAT, type KeyDoc, type SealedDoc } from './vault'

/** Firestore allows 500 writes in one batch. */
const BATCH_SIZE = 400

/** A sealed record as it came back, with the server's time of its last write. */
export interface SealedRemoteDoc extends SealedDoc {
  syncedAtMs: number
}

/** The key document as last confirmed by the server: none yet, or one this app can't read (a newer version's). */
export type OnlineKey = KeyDoc | null | 'unreadable'

/** Set on the error createKey throws when another device set up sync first. */
export const KEY_EXISTS = 'till/key-exists'

class KeyAlreadySetUp extends Error {
  readonly code = KEY_EXISTS
  constructor() {
    super('Sync was already set up for this account.')
  }
}

/**
 * One person's encrypted data in Firestore: sealed records at users/{uid}/records, and the
 * locked master key at users/{uid}/vault/key. `firestore.rules` lets only that person in,
 * and only lets sealed records in. This file never sees anything readable.
 */
export interface OnlineStore {
  /** Sealed records written after `sinceMs`, once confirmed by the server, and again on every later change. */
  listen(sinceMs: number, onDocs: (docs: SealedRemoteDoc[]) => void, onError: (error: unknown) => void): () => void
  write(docs: SealedDoc[]): Promise<void>
  remove(ids: string[]): Promise<void>
  /** Plaintext records left from before sync was encrypted. Only those are read, so it's cheap when there are none. */
  readPlain(): Promise<SyncDoc[]>
  /** Ids of records sealed with any key but `keyId`: left behind by a device that missed a fresh start. */
  staleIds(keyId: string): Promise<string[]>
  /** The key document, fresh from the server. */
  readKey(): Promise<OnlineKey>
  /** The key document, each time the server confirms it. */
  watchKey(onKey: (key: OnlineKey) => void, onError: (error: unknown) => void): () => void
  /** Saves the first key document. Throws KeyAlreadySetUp when another device got there first. */
  createKey(key: KeyDoc): Promise<void>
  /** A new passphrase or recovery key for the same master key. */
  updateKey(key: KeyDoc): Promise<void>
  /** Every record, then the key document. */
  deleteAll(): Promise<void>
}

function toSealed(snapshot: DocumentSnapshot): SealedRemoteDoc | null {
  const data = snapshot.data()
  if (!data || data.v !== SEALED_FORMAT || typeof data.key !== 'string' || typeof data.iv !== 'string' || typeof data.data !== 'string') return null
  const syncedAt = data.syncedAt as Timestamp | undefined
  return { id: snapshot.id, v: data.v, key: data.key, iv: data.iv, data: data.data, syncedAtMs: syncedAt?.toMillis() ?? 0 }
}

/** A record saved by the app before sync was encrypted. */
function toPlain(snapshot: DocumentSnapshot): SyncDoc | null {
  const data = snapshot.data()
  if (!data || typeof data.kind !== 'string' || typeof data.updatedAt !== 'string' || typeof data.json !== 'string' || typeof data.schema !== 'number') return null
  return { id: snapshot.id, kind: data.kind as SyncDoc['kind'], updatedAt: data.updatedAt, json: data.json, schema: data.schema }
}

async function inBatches<T>(db: Firestore, items: T[], add: (batch: ReturnType<typeof writeBatch>, item: T) => void): Promise<void> {
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = writeBatch(db)
    items.slice(start, start + BATCH_SIZE).forEach((item) => add(batch, item))
    await batch.commit()
  }
}

function keyFields(key: KeyDoc) {
  return { v: key.v, keyId: key.keyId, passphrase: { ...key.passphrase }, recovery: { ...key.recovery }, updatedAt: serverTimestamp() }
}

export function createFirestoreRemote(db: Firestore, uid: string): OnlineStore {
  const records = collection(db, 'users', uid, 'records')
  const keyRef: DocumentReference = doc(db, 'users', uid, 'vault', 'key')

  return {
    listen(sinceMs, onDocs, onError) {
      // Before the server has answered, Firestore reports what it has in memory, which on a
      // restart is nothing. That must not count as "the online copy is empty", so documents
      // are held back until a snapshot is confirmed by the server.
      const held = new Map<string, SealedRemoteDoc>()
      return onSnapshot(
        query(records, where('syncedAt', '>', Timestamp.fromMillis(sinceMs))),
        { includeMetadataChanges: true },
        (snapshot) => {
          for (const change of snapshot.docChanges({ includeMetadataChanges: true })) {
            // Removed from the query (deleted online): nothing to merge. This device keeps its copy.
            // Pending writes are this device's own, on their way; they come back once confirmed.
            const sealed = change.type === 'removed' || change.doc.metadata.hasPendingWrites ? null : toSealed(change.doc)
            if (sealed) held.set(change.doc.id, sealed)
            else held.delete(change.doc.id)
          }
          if (snapshot.metadata.fromCache) return
          const docs = [...held.values()]
          held.clear()
          onDocs(docs)
        },
        onError,
      )
    },

    write(docs) {
      return inBatches(db, docs, (batch, { id, v, key, iv, data }) => {
        batch.set(doc(records, id), { v, key, iv, data, syncedAt: serverTimestamp() })
      })
    },

    remove(ids) {
      return inBatches(db, ids, (batch, id) => batch.delete(doc(records, id)))
    },

    async readPlain() {
      // Ordering by a field leaves out documents without it, and sealed records have no `kind`.
      const { docs } = await getDocsFromServer(query(records, orderBy('kind')))
      return docs.map(toPlain).filter((doc): doc is SyncDoc => doc !== null)
    },

    async staleIds(keyId) {
      const { docs } = await getDocsFromServer(query(records, where('key', '!=', keyId)))
      return docs.map((snapshot) => snapshot.id)
    },

    async readKey() {
      const snapshot = await getDocFromServer(keyRef)
      return snapshot.exists() ? asKeyDoc(snapshot.data()) : null
    },

    watchKey(onKey, onError) {
      return onSnapshot(
        keyRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          // Only what the server confirmed: a cached "no key" must not start a second setup.
          if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
          onKey(snapshot.exists() ? asKeyDoc(snapshot.data()) : null)
        },
        onError,
      )
    },

    async createKey(key) {
      await runTransaction(db, async (transaction) => {
        if ((await transaction.get(keyRef)).exists()) throw new KeyAlreadySetUp()
        transaction.set(keyRef, keyFields(key))
      })
    },

    async updateKey(key) {
      await setDoc(keyRef, keyFields(key))
    },

    async deleteAll() {
      const { docs } = await getDocs(records)
      await inBatches(db, docs, (batch, { ref }) => batch.delete(ref))
      await inBatches(db, [keyRef], (batch, ref) => batch.delete(ref))
    },
  }
}
