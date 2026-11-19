// Web Push with the Web Crypto API only, so it runs in a Cloudflare Worker (no Node `crypto`).
// Message encryption follows RFC 8291 (aes128gcm, RFC 8188); the sender identifies itself
// with VAPID (RFC 8292). Tested against the RFC's own example in webpush.test.ts.

export interface PushSubscriptionInfo {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface VapidKeys {
  /** Base64url, 65-byte uncompressed P-256 point (what `web-push generate-vapid-keys` prints). */
  publicKey: string
  /** Base64url, 32-byte scalar. */
  privateKey: string
  /** A URL or mailto: address the push service can contact. */
  subject: string
}

type Bytes = Uint8Array<ArrayBuffer>

const encoder = new TextEncoder()
/** UTF-8 bytes in a fresh buffer (TextEncoder's type allows a shared one). */
function utf8(text: string): Bytes {
  return new Uint8Array(encoder.encode(text))
}
const P256 = { name: 'ECDH', namedCurve: 'P-256' }
/** One record holds the whole (short) message. */
const RECORD_SIZE = 4096

export function toBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64url(text: string): Bytes {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** Splits a raw 65-byte public key into the x and y coordinates a JWK needs. */
function jwkCoordinates(rawPublicKey: Bytes): { x: string; y: string } {
  if (rawPublicKey.length !== 65 || rawPublicKey[0] !== 4) throw new Error('Expected a 65-byte uncompressed P-256 public key.')
  return { x: toBase64url(rawPublicKey.slice(1, 33)), y: toBase64url(rawPublicKey.slice(33, 65)) }
}

/** The sender's ECDH key pair from raw keys. Normally a fresh pair is generated per message; this is for tests. */
export async function importSenderKeys(publicKey: string, privateKey: string): Promise<CryptoKeyPair> {
  const raw = fromBase64url(publicKey)
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', ...jwkCoordinates(raw), d: privateKey, ext: true }
  return {
    publicKey: await crypto.subtle.importKey('raw', raw, P256, true, []),
    privateKey: await crypto.subtle.importKey('jwk', jwk, P256, true, ['deriveBits']),
  }
}

export interface EncryptOptions {
  /** Fixed sender keys and salt, for tests. */
  senderKeys?: CryptoKeyPair
  salt?: Bytes
}

/**
 * Encrypts `plaintext` for the browser that owns `uaPublicKey` and `authSecret`
 * (the subscription's p256dh and auth). Returns the full aes128gcm body:
 * salt · record size · key id length · sender public key · ciphertext.
 */
export async function encrypt(plaintext: Bytes, uaPublicKey: Bytes, authSecret: Bytes, options: EncryptOptions = {}): Promise<Bytes> {
  // Casts: the Workers types describe generateKey/exportKey/deriveBits more loosely than lib.dom.
  const sender = options.senderKeys ?? ((await crypto.subtle.generateKey(P256, true, ['deriveBits'])) as CryptoKeyPair)
  const senderPublic = new Uint8Array((await crypto.subtle.exportKey('raw', sender.publicKey)) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', uaPublicKey, P256, false, [])
  const ecdh = { name: 'ECDH', public: uaKey } as unknown as Parameters<SubtleCrypto['deriveBits']>[0]
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, sender.privateKey, 256))

  const keyInfo = concat(utf8('WebPush: info\0'), uaPublicKey, senderPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  if (plaintext.length + 1 + 16 > RECORD_SIZE) throw new Error('Message too long for one record.')
  // 0x02 marks the last (here, only) record. No extra padding: the messages are short and not secret in length.
  const padded = concat(plaintext, new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded))

  const header = new Uint8Array(16 + 4 + 1 + senderPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = senderPublic.length
  header.set(senderPublic, 21)
  return concat(header, ciphertext)
}

/** How long a VAPID token stays valid. The push service accepts up to 24 h. */
const VAPID_TOKEN_SECONDS = 12 * 3600

/** The `Authorization: vapid …` header value for a push service, signed with the sender's key. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now: number = Date.now()): Promise<string> {
  const header = toBase64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + VAPID_TOKEN_SECONDS, sub: vapid.subject }
  const payload = toBase64url(encoder.encode(JSON.stringify(claims)))
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', ...jwkCoordinates(fromBase64url(vapid.publicKey)), d: vapid.privateKey, ext: true }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${payload}`)))
  return `vapid t=${header}.${payload}.${toBase64url(signature)}, k=${vapid.publicKey}`
}

/** Signs once per push service (the `aud`), so a run with many devices doesn't repeat the work. */
export function createVapidSigner(vapid: VapidKeys): (endpoint: string) => Promise<string> {
  const cache = new Map<string, Promise<string>>()
  return (endpoint) => {
    const origin = new URL(endpoint).origin
    let token = cache.get(origin)
    if (!token) {
      token = vapidAuthorization(endpoint, vapid)
      cache.set(origin, token)
    }
    return token
  }
}

export type SendOutcome = 'sent' | 'gone' | 'failed'

export interface SendOptions {
  /** Seconds the push service keeps the message if the device is offline. */
  ttl: number
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
  fetch?: typeof fetch
}

/** Encrypts and posts one message. `gone` means the subscription no longer exists and should be forgotten. */
export async function sendWebPush(
  subscription: PushSubscriptionInfo,
  payload: string,
  authorization: (endpoint: string) => Promise<string>,
  options: SendOptions,
): Promise<{ outcome: SendOutcome; status?: number; detail?: string }> {
  try {
    const body = await encrypt(utf8(payload), fromBase64url(subscription.keys.p256dh), fromBase64url(subscription.keys.auth))
    const response = await (options.fetch ?? fetch)(subscription.endpoint, {
      method: 'POST',
      headers: {
        TTL: String(options.ttl),
        Urgency: options.urgency ?? 'normal',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: await authorization(subscription.endpoint),
      },
      body,
    })
    if (response.ok) return { outcome: 'sent', status: response.status }
    if (response.status === 404 || response.status === 410) return { outcome: 'gone', status: response.status }
    return { outcome: 'failed', status: response.status, detail: (await response.text()).slice(0, 200) }
  } catch (error) {
    return { outcome: 'failed', detail: error instanceof Error ? error.message : String(error) }
  }
}
