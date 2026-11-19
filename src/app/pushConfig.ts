import { readCloudSettings } from '../config/cloudSettings'

const { push, pushEnabled } = readCloudSettings(import.meta.env)

/**
 * Where the push server lives (the Cloudflare Worker in push-server/), from the settings
 * (`VITE_PUSH_API`, written by `pnpm push:deploy`). Empty when it isn't set up: the "Also when
 * the app is closed" switch stays hidden and reminders work as before, in the app.
 */
export const PUSH_API: string = push.api

/** Public half of the server's VAPID key pair (`VITE_VAPID_PUBLIC_KEY`). Not a secret. */
export const VAPID_PUBLIC_KEY: string = push.vapidPublicKey

/** Whether closed-app reminders exist at all: both settings present and the address is https. */
export const PUSH_ENABLED: boolean = pushEnabled
