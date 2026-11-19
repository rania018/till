import { initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  deleteUser,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { readCloudSettings } from '../config/cloudSettings'
import { createFirestoreRemote } from './firestoreRemote'

// This module is the only one that loads Firebase, and it's imported on demand: it only
// runs for people who sign in. (The service worker still precaches its file for everyone,
// so sync can start with no connection.) The config below identifies the project and
// isn't a secret; access is decided by firestore.rules.

const settings = readCloudSettings(import.meta.env)

/** Local checks only (`VITE_FIREBASE_EMULATOR=1 pnpm dev`), so a test can sign in without Google's pages. */
const EMULATOR = settings.emulator

/**
 * Sites Firebase Hosting serves, which also serve Google sign-in's pages at /__/auth/.
 * Signing in through the site's own address keeps it first-party; browsers that block
 * third-party storage (Safari, and so iPhones) would otherwise lose the sign-in on the way back.
 */
const HOSTED = settings.sites

const app = initializeApp({
  apiKey: settings.firebase.apiKey,
  authDomain: HOSTED.includes(location.hostname) ? location.hostname : (HOSTED[1] ?? HOSTED[0]),
  projectId: settings.firebase.projectId,
  appId: settings.firebase.appId,
})
const auth = getAuth(app)
const db = getFirestore(app)

if (EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

export type { User }

export const onUserChange = (listener: (user: User | null) => void) => onAuthStateChanged(auth, listener)

/** Completes a sign-in that left the page for Google's. Throws if it failed. */
export const finishRedirect = () => getRedirectResult(auth)

export const signOut = () => firebaseSignOut(auth)

export const remoteFor = (uid: string) => createFirestoreRemote(db, uid)

/** False when the account was deleted (from another device). Throws when it can't tell, e.g. offline. */
export async function accountExists(user: User): Promise<boolean> {
  try {
    await user.reload()
    return true
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'auth/user-not-found' || code === 'auth/user-token-expired' || code === 'auth/user-disabled') return false
    throw error
  }
}

/**
 * Removes the person's sign-in from the app's Firebase project, so not even their email stays.
 * Firebase asks for a recent sign-in first; when the session is older, Google's window is
 * shown once. Resolves false when the account couldn't be removed (that window was closed or blocked).
 */
export async function deleteAccount(): Promise<boolean> {
  const user = auth.currentUser
  if (!user) return true
  try {
    await deleteUser(user)
    return true
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/requires-recent-login' || EMULATOR) {
      console.error('Could not remove the account.', error)
      return false
    }
  }
  try {
    const provider = new GoogleAuthProvider()
    if (user.email) provider.setCustomParameters({ login_hint: user.email })
    await reauthenticateWithPopup(user, provider)
    await deleteUser(user)
    return true
  } catch (error) {
    console.error('Could not remove the account after signing in again.', error)
    return false
  }
}

/** Popups are unreliable in installed apps and on phones, where a full-page redirect works instead. */
function shouldRedirect(): boolean {
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return installed || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export async function signInWithGoogle(): Promise<void> {
  if (EMULATOR) {
    const email = (window as unknown as { __tillTestEmail?: string }).__tillTestEmail ?? 'test@example.com'
    await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })))
    return
  }
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  if (shouldRedirect()) return signInWithRedirect(auth, provider)
  try {
    await signInWithPopup(auth, provider)
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/popup-blocked') throw error
    await signInWithRedirect(auth, provider)
  }
}
