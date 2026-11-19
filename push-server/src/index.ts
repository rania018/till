import { DEVICE_ID, dueNotifications, parseDevice, rememberSent, withoutBillText, type Device } from './schedule'
import { createVapidSigner, sendWebPush } from './webpush'

/**
 * The app's push server, a Cloudflare Worker.
 *  - HTTP: the app registers this device (PUT /push/devices/:id) with its push
 *    subscription and the little the server needs to decide when to notify it, and
 *    forgets it again (DELETE). Devices live in KV and expire after KEEP_DAYS without a check-in.
 *    Bill names and amounts arrive sealed with a key only the device has: this server never reads them.
 *  - Cron (wrangler.toml, every 15 minutes): sends the weekly reminder and bill
 *    notifications that are due, as Web Push.
 */

export interface Env {
  DEVICES: KVNamespace
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  /** Comma-separated origins allowed to call the API from a browser. */
  ALLOWED_ORIGINS: string
}

interface StoredDevice extends Device {
  sentKeys: string[]
  /** ms since epoch */
  updatedAt: number
  lastSentAt?: number
}

const KEY_PREFIX = 'device:'
/** Devices that haven't checked in for this long are forgotten (KV expiry). */
const KEEP_DAYS = 180
/** How long the push service keeps an undelivered message (phone off). */
const PUSH_TTL_SECONDS = 6 * 3600

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin')
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', Vary: 'Origin' }
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = 'PUT, DELETE, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type'
    headers['Access-Control-Max-Age'] = '86400'
  }
  return headers
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const headers = corsHeaders(request, env)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })

  const match = /^\/push\/devices\/([^/]+)\/?$/.exec(new URL(request.url).pathname)
  if (!match) return json({ error: 'Not found.' }, 404, headers)
  const id = decodeURIComponent(match[1])
  if (!DEVICE_ID.test(id)) return json({ error: 'Bad device id.' }, 400, headers)
  const key = KEY_PREFIX + id

  if (request.method === 'PUT') {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Bad JSON.' }, 400, headers)
    }
    const parsed = parseDevice(body)
    if (typeof parsed === 'string') return json({ error: `Bad field: ${parsed}.` }, 400, headers)
    // The server's own sent list survives; everything the app owns is replaced.
    const existing = await env.DEVICES.get<StoredDevice>(key, 'json')
    const stored: StoredDevice = { ...parsed, sentKeys: existing?.sentKeys ?? [], updatedAt: Date.now(), lastSentAt: existing?.lastSentAt }
    await env.DEVICES.put(key, JSON.stringify(stored), { expirationTtl: KEEP_DAYS * 86_400 })
    return new Response(null, { status: 204, headers })
  }
  if (request.method === 'DELETE') {
    await env.DEVICES.delete(key)
    return new Response(null, { status: 204, headers })
  }
  return json({ error: 'Method not allowed.' }, 405, { ...headers, Allow: 'PUT, DELETE, OPTIONS' })
}

export interface RunSummary {
  devices: number
  sent: number
  removed: number
  failed: number
}

/** One scheduler tick: tells every device what's due for it right now. */
export async function sendDueReminders(env: Env, now: Date): Promise<RunSummary> {
  const authorization = createVapidSigner({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT })
  const summary: RunSummary = { devices: 0, sent: 0, removed: 0, failed: 0 }

  let cursor: string | undefined
  do {
    const page = await env.DEVICES.list({ prefix: KEY_PREFIX, cursor })
    for (const { name } of page.keys) {
      let device = await env.DEVICES.get<StoredDevice>(name, 'json')
      if (!device?.subscription) continue
      summary.devices++

      const cleanBills = withoutBillText(device.bills ?? [])
      if (cleanBills) {
        // Saved by an older version with bill names and amounts in the clear: they go now.
        device = { ...device, bills: cleanBills }
        await env.DEVICES.put(name, JSON.stringify(device), { expirationTtl: KEEP_DAYS * 86_400 })
      }

      const sentKeys: string[] = []
      let gone = false
      for (const message of dueNotifications(device, now)) {
        // public/sw-notifications.js reads these fields, and opens `sealed` itself.
        const payload = JSON.stringify({ title: message.title, body: message.body, tag: message.key, url: message.url, sealed: message.sealed, template: message.template })
        const result = await sendWebPush(device.subscription, payload, authorization, { ttl: PUSH_TTL_SECONDS })
        if (result.outcome === 'sent') sentKeys.push(message.key)
        else if (result.outcome === 'gone') {
          gone = true
          break
        } else {
          summary.failed++
          console.warn('Push failed.', { device: name, key: message.key, status: result.status, detail: result.detail })
        }
      }

      if (gone) {
        await env.DEVICES.delete(name)
        summary.removed++
      } else if (sentKeys.length > 0) {
        summary.sent += sentKeys.length
        const updated: StoredDevice = { ...device, sentKeys: rememberSent(device.sentKeys, sentKeys), lastSentAt: now.getTime() }
        await env.DEVICES.put(name, JSON.stringify(updated), { expirationTtl: KEEP_DAYS * 86_400 })
      }
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  console.log('Reminders run finished.', summary)
  return summary
}

export default {
  fetch: handleRequest,
  scheduled(_event, env, ctx) {
    ctx.waitUntil(sendDueReminders(env, new Date()))
  },
} satisfies ExportedHandler<Env>
