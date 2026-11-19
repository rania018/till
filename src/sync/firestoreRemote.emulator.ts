import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore'
import { afterAll, describe, expect, it } from 'vitest'
import type { RemoteDoc, SyncRemote } from './engine'
import { createFirestoreRemote, KEY_EXISTS, type OnlineKey } from './firestoreRemote'
import type { SyncDoc } from './records'
import { createSealedRemote } from './sealedRemote'
import { newKeyDoc, newKeyId, newMasterKey, newRecoveryKey, openWithPassphrase, workingKeys, type KeyDoc, type SyncKeys } from './vault'

// The real SDK against the real rules (firestore.rules), in the Firebase emulators.

const PROJECT = 'demo-till'
const apps: FirebaseApp[] = []
let nextApp = 0

function openApp(): { app: FirebaseApp; db: Firestore } {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, appId: 'demo' }, `app-${nextApp++}`)
  apps.push(app)
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  return { app, db }
}

async function signedIn(email: string): Promise<{ db: Firestore; uid: string }> {
  const { app, db } = openApp()
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const { user } = await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })))
  return { db, uid: user.uid }
}

const ITERATIONS = 100_000

/** An account with a key set up, and a device holding it. */
async function setUp(email: string) {
  const device = await signedIn(email)
  const master = newMasterKey()
  const keyId = newKeyId()
  const key = await newKeyDoc(master, device.uid, keyId, 'a long enough passphrase', newRecoveryKey(), ITERATIONS)
  const store = createFirestoreRemote(device.db, device.uid)
  await store.createKey(key)
  const keys = await workingKeys(master, keyId)
  return { ...device, key, keys, store, remote: sealedRemote(device.db, device.uid, keys) }
}

function sealedRemote(db: Firestore, uid: string, keys: SyncKeys, confirmKey = async () => {}): SyncRemote {
  return createSealedRemote({ store: createFirestoreRemote(db, uid), uid, keys, confirmKey })
}

const record = (id: string, updatedAt = '2026-11-03T10:00:00.000Z'): SyncDoc => ({
  id: `transactions:${id}`,
  kind: 'transactions',
  updatedAt,
  json: JSON.stringify({ id, updatedAt, note: 'Loyer novembre', amount: 45000 }),
  schema: 11,
})

/** Resolves with the next delivery that passes `until`. */
function firstDelivery<T>(listen: (onDocs: (docs: T[]) => void, onError: (e: unknown) => void) => () => void, until: (docs: T[]) => boolean = () => true): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const stop = listen(
      (docs) => {
        if (!until(docs)) return
        stop()
        resolve(docs)
      },
      reject,
    )
  })
}

function nextKey(watch: (onKey: (key: OnlineKey) => void, onError: (e: unknown) => void) => () => void, until: (key: OnlineKey) => boolean): Promise<OnlineKey> {
  return new Promise((resolve, reject) => {
    const stop = watch((key) => {
      if (!until(key)) return
      stop()
      resolve(key)
    }, reject)
  })
}

/** Writes past the rules, as the emulator allows an admin to: for records older apps saved in plaintext. */
async function adminWrite(path: string, fields: Record<string, { stringValue: string } | { integerValue: string }>) {
  const response = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!response.ok) throw new Error(`Admin write failed: ${response.status} ${await response.text()}`)
}

afterAll(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)))
})

describe('sealed sync through Firestore', () => {
  it('writes records and reads them back on another device that opened the key with the passphrase', async () => {
    const phone = await setUp('reader@example.com')
    await phone.remote.write([record('a'), record('b')])

    const laptop = await signedIn('reader@example.com')
    expect(laptop.uid).toBe(phone.uid)
    const key = (await createFirestoreRemote(laptop.db, laptop.uid).readKey()) as KeyDoc
    const master = await openWithPassphrase(key, laptop.uid, 'a long enough passphrase')
    const keys = await workingKeys(master!, key.keyId)
    const docs = await firstDelivery<RemoteDoc>((onDocs, onError) => sealedRemote(laptop.db, laptop.uid, keys).listen(0, onDocs, onError))
    expect(docs.map((d) => d.id).sort()).toEqual(['transactions:a', 'transactions:b'])
    expect(docs[0].syncedAtMs).toBeGreaterThan(0)
    expect(JSON.parse(docs.find((d) => d.id === 'transactions:a')!.json)).toMatchObject({ note: 'Loyer novembre', amount: 45000 })
  })

  it('leaves nothing readable online: no ids, kinds, times, notes or amounts', async () => {
    const { db, uid, remote } = await setUp('server-view@example.com')
    await remote.write([record('rent')])
    const { docs } = await getDocs(collection(db, 'users', uid, 'records'))
    expect(docs).toHaveLength(1)
    expect(Object.keys(docs[0].data()).sort()).toEqual(['data', 'iv', 'key', 'syncedAt', 'v'])
    const everything = JSON.stringify({ id: docs[0].id, ...docs[0].data() })
    for (const secret of ['rent', 'transactions', 'Loyer', '45000', '2026-11-03']) expect(everything).not.toContain(secret)

    const key = JSON.stringify((await getDoc(doc(db, 'users', uid, 'vault', 'key'))).data())
    expect(key).not.toContain('a long enough passphrase')
  })

  it('delivers an empty list for an account with nothing online, confirmed by the server', async () => {
    const { db, uid, keys } = await setUp('empty@example.com')
    const docs = await firstDelivery<RemoteDoc>((onDocs, onError) => sealedRemote(db, uid, keys).listen(0, onDocs, onError))
    expect(docs).toEqual([])
  })

  it('only reads what was written after the cursor', async () => {
    const { remote } = await setUp('cursor@example.com')
    await remote.write([record('old')])
    const [old] = await firstDelivery<RemoteDoc>((onDocs, onError) => remote.listen(0, onDocs, onError))
    const later = await firstDelivery<RemoteDoc>((onDocs, onError) => remote.listen(old.syncedAtMs, onDocs, onError))
    expect(later).toEqual([])
  })

  it('hears changes from another device while listening', async () => {
    const phone = await setUp('live@example.com')
    const laptop = await signedIn('live@example.com')
    const heard = firstDelivery<RemoteDoc>(
      (onDocs, onError) => sealedRemote(laptop.db, laptop.uid, phone.keys).listen(0, onDocs, onError),
      (docs) => docs.some((d) => d.id === 'transactions:new'),
    )
    await phone.remote.write([record('new')])
    expect((await heard).find((d) => d.id === 'transactions:new')?.updatedAt).toBe('2026-11-03T10:00:00.000Z')
  })

  it('leaves out records sealed with another key', async () => {
    const { db, uid, remote, store, key } = await setUp('two-keys@example.com')
    await remote.write([record('mine')])
    const otherKeys = await workingKeys(newMasterKey(), newKeyId())
    await sealedRemote(db, uid, otherKeys).write([record('stale')])
    const docs = await firstDelivery<RemoteDoc>((onDocs, onError) => remote.listen(0, onDocs, onError))
    expect(docs.map((d) => d.id)).toEqual(['transactions:mine'])
    expect(await store.staleIds(key.keyId)).toHaveLength(1)
  })

  it('doesn’t write when the key online isn’t this device’s', async () => {
    const { db, uid, keys } = await setUp('confirm@example.com')
    const refusing = sealedRemote(db, uid, keys, async () => {
      throw new Error('The key online is no longer this device’s.')
    })
    await expect(refusing.write([record('x')])).rejects.toThrow('no longer')
    expect((await getDocs(collection(db, 'users', uid, 'records'))).size).toBe(0)
  })

  it('writes more records than fit in one batch, and deletes everything, key included', async () => {
    const { db, uid, remote, store } = await setUp('many@example.com')
    await remote.write(Array.from({ length: 450 }, (_, i) => record(`r${i}`)))
    expect((await getDocs(collection(db, 'users', uid, 'records'))).size).toBe(450)
    await store.deleteAll()
    expect((await getDocs(collection(db, 'users', uid, 'records'))).size).toBe(0)
    expect(await store.readKey()).toBeNull()
  })

  it('finds records saved in plaintext before encryption, and only those', async () => {
    const { db, uid, remote, store } = await setUp('legacy@example.com')
    await remote.write([record('sealed')])
    await adminWrite(`users/${uid}/records/transactions:old`, {
      kind: { stringValue: 'transactions' },
      updatedAt: { stringValue: '2026-10-01T09:00:00.000Z' },
      json: { stringValue: JSON.stringify({ id: 'old', updatedAt: '2026-10-01T09:00:00.000Z' }) },
      schema: { integerValue: '9' },
    })
    const plain = await store.readPlain()
    expect(plain).toEqual([{ id: 'transactions:old', kind: 'transactions', updatedAt: '2026-10-01T09:00:00.000Z', json: expect.any(String), schema: 9 }])
    // The sealed listener never hands plaintext to the engine.
    const docs = await firstDelivery<RemoteDoc>((onDocs, onError) => remote.listen(0, onDocs, onError))
    expect(docs.map((d) => d.id)).toEqual(['transactions:sealed'])

    await store.remove(plain.map((d) => d.id))
    expect(await store.readPlain()).toEqual([])
    expect((await getDocs(collection(db, 'users', uid, 'records'))).size).toBe(1)
  })
})

describe('the key document', () => {
  it('is created once: a second device setting up at the same time is told to use the first one’s', async () => {
    const { db, uid, key } = await setUp('race@example.com')
    const second = await newKeyDoc(newMasterKey(), uid, newKeyId(), 'another long passphrase', newRecoveryKey(), ITERATIONS)
    await expect(createFirestoreRemote(db, uid).createKey(second)).rejects.toMatchObject({ code: KEY_EXISTS })
    expect(await createFirestoreRemote(db, uid).readKey()).toEqual(key)
  })

  it('takes a new passphrase for the same key, never a different key', async () => {
    const { uid, key, store } = await setUp('rekey@example.com')
    const renewed = await newKeyDoc(newMasterKey(), uid, key.keyId, 'a brand new passphrase', newRecoveryKey(), ITERATIONS)
    await expect(store.updateKey(renewed)).resolves.toBeUndefined()
    expect(await store.readKey()).toEqual(renewed)

    const other = await newKeyDoc(newMasterKey(), uid, newKeyId(), 'a brand new passphrase', newRecoveryKey(), ITERATIONS)
    await expect(store.updateKey(other)).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('is heard by every device when it changes', async () => {
    const { key, store } = await setUp('watch@example.com')
    const laptop = await signedIn('watch@example.com')
    const watch = createFirestoreRemote(laptop.db, laptop.uid).watchKey
    expect(await nextKey(watch, () => true)).toEqual(key)

    const changed = nextKey(watch, (k) => k === null)
    await store.deleteAll()
    expect(await changed).toBeNull()
  })
})

describe('firestore.rules', () => {
  const sealed = () => ({ v: 1, key: 'k'.repeat(22), iv: 'i'.repeat(16), data: 'sealed bytes', syncedAt: serverTimestamp() })

  it('keeps one person out of another’s data and key', async () => {
    const owner = await setUp('owner@example.com')
    const other = await signedIn('other@example.com')
    await owner.remote.write([record('private')])

    await expect(getDocs(collection(other.db, 'users', owner.uid, 'records'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDoc(doc(other.db, 'users', owner.uid, 'vault', 'key'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(setDoc(doc(other.db, 'users', owner.uid, 'records', 'x'), sealed())).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(createFirestoreRemote(other.db, owner.uid).deleteAll()).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('keeps out anyone who isn’t signed in', async () => {
    const owner = await setUp('owner2@example.com')
    const { db } = openApp()
    await expect(getDocs(collection(db, 'users', owner.uid, 'records'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDoc(doc(db, 'users', owner.uid, 'vault', 'key'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(setDoc(doc(db, 'users', owner.uid, 'records', 'x'), sealed())).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('refuses anything outside a person’s records and key', async () => {
    const { db, uid } = await signedIn('outside@example.com')
    await expect(setDoc(doc(db, 'users', uid), { a: 1 })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(setDoc(doc(db, 'other', 'x'), { a: 1 })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(setDoc(doc(db, 'users', uid, 'other', 'x'), sealed())).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(setDoc(doc(db, 'users', uid, 'vault', 'other'), { a: 1 })).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('refuses plaintext records, the way older versions of the app saved them', async () => {
    const { db, uid } = await signedIn('plaintext@example.com')
    const plain = { kind: 'bills', updatedAt: '2026-11-03T10:00:00.000Z', json: '{"name":"Rent"}', schema: 11, syncedAt: serverTimestamp() }
    await expect(setDoc(doc(db, 'users', uid, 'records', 'bills:x'), plain)).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(setDoc(doc(db, 'users', uid, 'records', 'x'), { ...sealed(), kind: 'bills' })).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('refuses malformed sealed records', async () => {
    const { db, uid } = await signedIn('shape@example.com')
    const write = (data: object, id = 'x') => setDoc(doc(db, 'users', uid, 'records', id), data)

    await expect(write(sealed())).resolves.toBeUndefined()
    await expect(write({ ...sealed(), v: 2 })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(write({ ...sealed(), extra: 1 })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(write({ ...sealed(), iv: 'short' })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(write({ ...sealed(), data: 'x'.repeat(700_001) })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(write({ ...sealed(), syncedAt: new Date(0) })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(write(sealed(), 'x'.repeat(65))).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('refuses a key document that’s malformed or too easy to guess at', async () => {
    const { db, uid } = await signedIn('keyshape@example.com')
    const good = await newKeyDoc(newMasterKey(), uid, newKeyId(), 'a long enough passphrase', newRecoveryKey(), ITERATIONS)
    const write = (data: object) => setDoc(doc(db, 'users', uid, 'vault', 'key'), { ...data, updatedAt: serverTimestamp() })

    await expect(write({ ...good, passphrase: { ...good.passphrase, iterations: 1_000 } })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(write({ ...good, passphrase: { ...good.passphrase, hint: 'my cat' } })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(write({ ...good, passphraseText: 'oops' })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(write({ ...good, v: 2 })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(write(good)).resolves.toBeUndefined()
  })
})
