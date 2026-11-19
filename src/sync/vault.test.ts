import { describe, expect, it } from 'vitest'
import { fromBase64, toBase64 } from '../lib/pin'
import type { SyncDoc } from './records'
import {
  asKeyDoc,
  formatRecoveryKey,
  newKeyDoc,
  newKeyId,
  newMasterKey,
  newRecoveryKey,
  onlineId,
  openDoc,
  openWithPassphrase,
  openWithRecovery,
  parseRecoveryKey,
  passphraseProblem,
  sealDoc,
  workingKeys,
} from './vault'

// Few iterations here: the tests are about the shape of the scheme, not the cost of guessing.
const FAST = 1_000
const UID = 'user-1'

const salary: SyncDoc = {
  id: 'transactions:salary-2026-10-25',
  kind: 'transactions',
  updatedAt: '2026-10-25T08:00:00.000Z',
  json: JSON.stringify({ id: 'salary-2026-10-25', note: 'Salaire octobre — مرتب', amount: 60000 }),
  schema: 11,
}

async function account() {
  const master = newMasterKey()
  const keyId = newKeyId()
  const recovery = newRecoveryKey()
  const doc = await newKeyDoc(master, UID, keyId, 'correct horse battery', recovery, FAST)
  return { master, keyId, recovery, doc, keys: await workingKeys(master, keyId) }
}

function flipFirstByte(base64: string): string {
  const bytes = fromBase64(base64)
  bytes[0] ^= 1
  return toBase64(bytes)
}

describe('the key document', () => {
  it('opens with the passphrase or the recovery key, and gives back the same master key', async () => {
    const { master, recovery, doc } = await account()
    expect(await openWithPassphrase(doc, UID, 'correct horse battery')).toEqual(master)
    expect(await openWithRecovery(doc, UID, recovery)).toEqual(master)
  })

  it('stays shut with a wrong passphrase or recovery key', async () => {
    const { doc } = await account()
    expect(await openWithPassphrase(doc, UID, 'correct horse batterY')).toBeNull()
    expect(await openWithRecovery(doc, UID, newRecoveryKey())).toBeNull()
  })

  it('only opens for the account it was made for', async () => {
    const { doc } = await account()
    expect(await openWithPassphrase(doc, 'someone-else', 'correct horse battery')).toBeNull()
  })

  it('treats differently composed accents as the same passphrase', async () => {
    const master = newMasterKey()
    const doc = await newKeyDoc(master, UID, newKeyId(), 'mot de passe déjà vu', newRecoveryKey(), FAST)
    expect(await openWithPassphrase(doc, UID, 'mot de passe déjà vu')).toEqual(master)
  })

  it('holds nothing readable: no passphrase, no master key', async () => {
    const { master, doc } = await account()
    const text = JSON.stringify(doc)
    expect(text).not.toContain('correct horse')
    expect(text).not.toContain(toBase64(master))
  })

  it('is checked when read back', async () => {
    const { doc } = await account()
    expect(asKeyDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
    expect(asKeyDoc({ ...doc, v: 2 })).toBe('unreadable')
    expect(asKeyDoc({ ...doc, passphrase: { ...doc.passphrase, iterations: '1' } })).toBe('unreadable')
    expect(asKeyDoc(null)).toBe('unreadable')
  })
})

describe('sealed records', () => {
  it('round-trip on another device that opened the same key document', async () => {
    const { doc, keys } = await account()
    const sealed = await sealDoc(keys, UID, salary)

    const master = await openWithPassphrase(doc, UID, 'correct horse battery')
    const otherDevice = await workingKeys(master!, doc.keyId)
    expect(await openDoc(otherDevice, UID, sealed)).toEqual(salary)
  })

  it('show nothing online: no amounts, notes, dates or kinds, and an id that says nothing', async () => {
    const { keys } = await account()
    const sealed = await sealDoc(keys, UID, salary)
    const online = JSON.stringify(sealed)
    for (const secret of ['salary', '2026-10-25', '60000', 'Salaire', 'transactions', 'مرتب']) expect(online).not.toContain(secret)
    expect(sealed.id).toMatch(/^r[A-Za-z0-9_-]{32}$/)
  })

  it('keep one online id per record, the same on every device', async () => {
    const { master, keyId, keys } = await account()
    const again = await workingKeys(master, keyId)
    expect(await onlineId(keys, salary.id)).toBe(await onlineId(again, salary.id))
    expect(await onlineId(keys, salary.id)).not.toBe(await onlineId(keys, 'transactions:other'))
  })

  it('hide the exact size of a record', async () => {
    const { keys } = await account()
    const short = await sealDoc(keys, UID, { ...salary, json: '{"a":1}' })
    const longer = await sealDoc(keys, UID, { ...salary, json: '{"a":1,"note":"a little longer"}' })
    expect(fromBase64(short.data).length).toBe(fromBase64(longer.data).length)
  })

  it('use a fresh nonce every time, so the same record never looks the same twice', async () => {
    const { keys } = await account()
    const a = await sealDoc(keys, UID, salary)
    const b = await sealDoc(keys, UID, salary)
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
  })

  it('refuse to open when changed, moved to another document or account, or sealed with another key', async () => {
    const { keys } = await account()
    const sealed = await sealDoc(keys, UID, salary)
    expect(await openDoc(keys, UID, { ...sealed, data: flipFirstByte(sealed.data) })).toBeNull()
    expect(await openDoc(keys, UID, { ...sealed, id: await onlineId(keys, 'bills:x') })).toBeNull()
    expect(await openDoc(keys, 'someone-else', sealed)).toBeNull()

    const other = await account()
    expect(await openDoc(other.keys, UID, sealed)).toBeNull()
    expect(await openDoc(keys, UID, { ...sealed, v: 2 })).toBeNull()
  })
})

describe('recovery keys', () => {
  it('print as eight groups of four and read back exactly', () => {
    const raw = newRecoveryKey()
    const text = formatRecoveryKey(raw)
    expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(parseRecoveryKey(text)).toEqual(raw)
  })

  it('forgive lower case, spaces and look-alike letters', () => {
    const raw = new Uint8Array(20).fill(0)
    raw[19] = 1
    const text = formatRecoveryKey(raw)
    expect(text).toBe('0000-0000-0000-0000-0000-0000-0000-0001')
    expect(parseRecoveryKey('oooo oooo OOOO-0000 0000 0000 0000 000l')).toEqual(raw)
    expect(parseRecoveryKey(text.toLowerCase())).toEqual(raw)
  })

  it('reject anything that can’t be one', () => {
    expect(parseRecoveryKey('')).toBeNull()
    expect(parseRecoveryKey('0000-0000')).toBeNull()
    expect(parseRecoveryKey('UUUU-0000-0000-0000-0000-0000-0000-0000')).toBeNull()
  })
})

describe('passphrases', () => {
  it('need at least twelve characters, counted as people see them', () => {
    expect(passphraseProblem('short one')).toBe('short')
    expect(passphraseProblem('twelve chars')).toBeNull()
    expect(passphraseProblem('كلمة سر طويلة')).toBeNull()
  })
})
