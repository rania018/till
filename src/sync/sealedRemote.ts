import type { RemoteDoc, SyncRemote } from './engine'
import type { OnlineStore } from './firestoreRemote'
import { openDoc, sealDoc, type SyncKeys } from './vault'

interface SealedRemoteOptions {
  store: Pick<OnlineStore, 'listen' | 'write'>
  uid: string
  keys: SyncKeys
  /**
   * Resolves when the server has confirmed that the key online is still this device's, and
   * throws when it isn't. Checked before every write, so a device that missed a fresh start
   * elsewhere never sends records sealed with a key nobody else has any more.
   */
  confirmKey: (keyId: string) => Promise<void>
}

/**
 * The sync engine's view of the online copy: plain records, as before. Records are sealed
 * on their way out and opened on their way in; anything that doesn't open with this
 * device's key (another key, damaged, moved) is left out.
 */
export function createSealedRemote({ store, uid, keys, confirmKey }: SealedRemoteOptions): SyncRemote {
  return {
    listen(sinceMs, onDocs, onError) {
      let open = true
      // Opening is asynchronous; deliveries still reach the engine one at a time, in order.
      let queue = Promise.resolve()
      const stop = store.listen(
        sinceMs,
        (sealed) => {
          queue = queue
            .then(async () => {
              const opened = await Promise.all(
                sealed.map(async (one): Promise<RemoteDoc | null> => {
                  const doc = await openDoc(keys, uid, one)
                  return doc && { ...doc, syncedAtMs: one.syncedAtMs }
                }),
              )
              if (open) onDocs(opened.filter((doc): doc is RemoteDoc => doc !== null))
            })
            .catch((error: unknown) => {
              if (open) onError(error)
            })
        },
        onError,
      )
      return () => {
        open = false
        stop()
      }
    },

    async write(docs) {
      await confirmKey(keys.keyId)
      await store.write(await Promise.all(docs.map((doc) => sealDoc(keys, uid, doc))))
    },
  }
}
