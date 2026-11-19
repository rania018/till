import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { setAmountsHidden } from '../lib/money'
import { afterWrongPin, checkPin, fromBase64, hashPin, NO_TRIES, toBase64, type PinHash, type Tries } from '../lib/pin'

/**
 * The app lock and hidden amounts. Both belong to this device, not to the data: they live in
 * localStorage and never sync, so a borrowed phone's settings can't follow the person around.
 * The lock is a privacy screen: while it's up the app isn't rendered at all, but the saved data
 * isn't encrypted.
 */

const LOCK_KEY = 'expense-tracker:lock'
const TRIES_KEY = 'expense-tracker:lock-tries'
const HIDDEN_KEY = 'expense-tracker:hide-amounts'
const HIDE_ON_OPEN_KEY = 'expense-tracker:hide-on-open'

/** Minutes away before the lock comes back. 0: as soon as the app is left. */
export const LOCK_AFTER = [0, 1, 5, 15] as const
export type LockAfter = (typeof LOCK_AFTER)[number]

export interface LockConfig {
  pin: PinHash
  after: LockAfter
  /** The fingerprint or face credential made on this device, when that's on. */
  credentialId?: string
}

function read<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key)
    return text ? (JSON.parse(text) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked: the lock can't be kept, and Settings says it's off.
  }
}

interface LockState {
  config: LockConfig | null
  locked: boolean
  tries: Tries
  /** Amounts show as ••• everywhere. */
  hidden: boolean
  hideOnOpen: boolean
}

function initial(): LockState {
  const config = read<LockConfig>(LOCK_KEY)
  const hideOnOpen = read<boolean>(HIDE_ON_OPEN_KEY) === true
  const hidden = hideOnOpen || read<boolean>(HIDDEN_KEY) === true
  setAmountsHidden(hidden)
  return { config, locked: !!config, tries: read<Tries>(TRIES_KEY) ?? NO_TRIES, hidden, hideOnOpen }
}

export const lockStore = createStore<LockState>(initial)

export function useLock<T>(pick: (state: LockState) => T): T {
  return useStore(lockStore, pick)
}

function setConfig(config: LockConfig | null): void {
  write(LOCK_KEY, config)
  lockStore.setState({ config })
}

export async function setPin(pin: string): Promise<void> {
  const before = lockStore.getState().config
  setConfig({ after: before?.after ?? 1, credentialId: before?.credentialId, pin: await hashPin(pin) })
  resetTries()
}

export function removeLock(): void {
  setConfig(null)
  resetTries()
  lockStore.setState({ locked: false })
}

export function setLockAfter(after: LockAfter): void {
  const config = lockStore.getState().config
  if (config) setConfig({ ...config, after })
}

export function lockNow(): void {
  if (lockStore.getState().config) lockStore.setState({ locked: true })
}

function resetTries(): void {
  write(TRIES_KEY, null)
  lockStore.setState({ tries: NO_TRIES })
}

/** Checks a PIN against the lock, counting wrong tries. Unlocks when it's right. */
export async function tryPin(pin: string, now = Date.now()): Promise<boolean> {
  const { config, tries } = lockStore.getState()
  if (!config || tries.waitUntil > now) return false
  if (await checkPin(pin, config.pin)) {
    resetTries()
    lockStore.setState({ locked: false })
    return true
  }
  const next = afterWrongPin(tries, now)
  write(TRIES_KEY, next)
  lockStore.setState({ tries: next })
  return false
}

/** Checks a PIN without unlocking or counting tries: Settings asks for it before changing the lock. */
export async function isCurrentPin(pin: string): Promise<boolean> {
  const config = lockStore.getState().config
  return !!config && checkPin(pin, config.pin)
}

export function setAmountsHiddenOn(hidden: boolean): void {
  write(HIDDEN_KEY, hidden)
  setAmountsHidden(hidden)
  lockStore.setState({ hidden })
}

export function setHideOnOpen(on: boolean): void {
  write(HIDE_ON_OPEN_KEY, on)
  lockStore.setState({ hideOnOpen: on })
}

// Fingerprint or face: the device's own check (WebAuthn, with a platform authenticator). There's
// no server, so nothing is signed for anyone: a yes from the device, with the person verified, opens
// the lock, which is all a privacy screen needs.

export async function canUseBiometrics(): Promise<boolean> {
  try {
    return typeof PublicKeyCredential !== 'undefined' && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

/** Asks the device to set up fingerprint or face for this app. False if the person cancelled. */
export async function turnOnBiometrics(appName: string): Promise<boolean> {
  const config = lockStore.getState().config
  if (!config) return false
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: appName },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: appName, displayName: appName },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        attestation: 'none',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    if (!credential) return false
    setConfig({ ...config, credentialId: toBase64(credential.rawId) })
    return true
  } catch (error) {
    console.error('Fingerprint or face could not be set up.', error)
    return false
  }
}

export function turnOffBiometrics(): void {
  const config = lockStore.getState().config
  if (config) setConfig({ ...config, credentialId: undefined })
}

/** The "user verified" flag in WebAuthn's authenticator data. */
const USER_VERIFIED = 0x04

/** Unlocks with fingerprint or face. False if it was cancelled or failed. */
export async function tryBiometrics(): Promise<boolean> {
  const id = lockStore.getState().config?.credentialId
  if (!id) return false
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: fromBase64(id), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    const data = assertion && new Uint8Array((assertion.response as AuthenticatorAssertionResponse).authenticatorData)
    if (!data || (data[32] & USER_VERIFIED) === 0) return false
    resetTries()
    lockStore.setState({ locked: false })
    return true
  } catch {
    return false
  }
}

/**
 * Locks again when the app comes back after being away longer than the setting. "Right away" locks
 * as the app is left, so the phone's app switcher shows the lock screen, not the money.
 */
export function useAutoLock(): void {
  useEffect(() => {
    let hiddenAt: number | null = null
    const onChange = () => {
      const { config } = lockStore.getState()
      if (!config) return
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        if (config.after === 0) lockNow()
      } else if (hiddenAt !== null && Date.now() - hiddenAt >= config.after * 60_000) {
        lockNow()
      }
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
}
