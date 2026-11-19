/**
 * The one place the optional cloud features are configured. Everything that needs to know whether
 * sync or closed-app reminders exist (the Firebase setup, the push client, the Content-Security-Policy,
 * the deploy scripts) reads it here, so they can't disagree.
 *
 * It takes a plain object and touches no globals, so the build config and the scripts can use it too:
 * the app passes `import.meta.env`, `vite.config.ts` passes what `loadEnv` read, scripts pass `process.env`.
 * Every value is public by design (it ships in the built app); none is a secret. See `.env.example`.
 */

export type CloudEnv = Record<string, string | undefined>

export interface CloudSettings {
  firebase: { apiKey: string; projectId: string; appId: string }
  /** Addresses Firebase Hosting serves; also where Google sign-in's pages live. */
  sites: string[]
  push: { api: string; vapidPublicKey: string }
  /** Local checks against the Firebase emulators. */
  emulator: boolean
  /** Google sign-in and sync exist: all three Firebase values are set, or the emulator is on. */
  syncEnabled: boolean
  /** Closed-app reminders exist: a secure push address and its public key are both set. */
  pushEnabled: boolean
}

const clean = (value: string | undefined) => (value ?? '').trim()

export function readCloudSettings(env: CloudEnv): CloudSettings {
  const emulator = clean(env.VITE_FIREBASE_EMULATOR) === '1'
  const apiKey = clean(env.VITE_FIREBASE_API_KEY)
  const appId = clean(env.VITE_FIREBASE_APP_ID)
  const configuredProject = clean(env.VITE_FIREBASE_PROJECT_ID)

  // The emulator needs no real project: it uses a made-up one.
  const projectId = emulator ? 'demo-till' : configuredProject
  const firebase = emulator ? { apiKey: apiKey || 'demo-key', projectId, appId: appId || 'demo-app' } : { apiKey, projectId, appId }

  const listed = clean(env.VITE_FIREBASE_SITES)
    .split(',')
    .map((site) => site.trim())
    .filter(Boolean)
  const sites = listed.length > 0 ? listed : projectId ? [`${projectId}.web.app`, `${projectId}.firebaseapp.com`] : []

  const api = clean(env.VITE_PUSH_API)
  const vapidPublicKey = clean(env.VITE_VAPID_PUBLIC_KEY)
  const pushEnabled = /^https:\/\/[^\s/]+/i.test(api) && vapidPublicKey !== ''

  return {
    firebase,
    sites,
    push: pushEnabled ? { api, vapidPublicKey } : { api: '', vapidPublicKey: '' },
    emulator,
    syncEnabled: emulator || (apiKey !== '' && configuredProject !== '' && appId !== ''),
    pushEnabled,
  }
}
