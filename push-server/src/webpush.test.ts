import assert from 'node:assert/strict'
import { createECDH, createPublicKey, verify } from 'node:crypto'
import { describe, it } from 'node:test'
import { createVapidSigner, encrypt, fromBase64url, importSenderKeys, sendWebPush, toBase64url, vapidAuthorization } from './webpush'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ece = require('http_ece') as { encrypt(data: Buffer, params: Record<string, unknown>): Buffer }

/** RFC 8291, Section 5 and Appendix A. */
const rfc = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  senderPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  senderPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

describe('base64url', () => {
  it('round-trips without padding', () => {
    for (const text of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar']) {
      const encoded = toBase64url(new TextEncoder().encode(text))
      assert.equal(encoded.includes('='), false)
      assert.equal(new TextDecoder().decode(fromBase64url(encoded)), text)
    }
    assert.equal(toBase64url(new Uint8Array([0xfb, 0xff, 0xbf])), '-_-_')
  })
})

describe('encrypt (RFC 8291)', () => {
  it('reproduces the RFC example byte for byte', async () => {
    const senderKeys = await importSenderKeys(rfc.senderPublic, rfc.senderPrivate)
    const body = await encrypt(fromBase64url(rfc.plaintext), fromBase64url(rfc.uaPublic), fromBase64url(rfc.authSecret), { senderKeys, salt: fromBase64url(rfc.salt) })
    assert.equal(toBase64url(body), rfc.message)
    assert.equal(body.length, 16 + 4 + 1 + 65 + fromBase64url(rfc.plaintext).length + 1 + 16, 'header, plaintext, delimiter, tag')
  })

  it('matches the http_ece library (used by web-push) for random keys', async () => {
    const ua = createECDH('prime256v1')
    const uaPublic = ua.generateKeys()
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const sender = createECDH('prime256v1')
    sender.generateKeys()
    const senderKeys = await importSenderKeys(toBase64url(sender.getPublicKey()), toBase64url(sender.getPrivateKey()))
    const text = new TextEncoder().encode(JSON.stringify({ title: 'Bill due', body: 'Rent, 20,000 DA, is due tomorrow' }))

    const mine = await encrypt(text, new Uint8Array(uaPublic), auth, { senderKeys, salt })
    const theirs = ece.encrypt(Buffer.from(text), {
      version: 'aes128gcm',
      dh: toBase64url(uaPublic),
      authSecret: toBase64url(auth),
      privateKey: sender,
      salt: toBase64url(salt),
    })
    assert.equal(toBase64url(mine), toBase64url(new Uint8Array(theirs)))
  })

  it('uses a fresh sender key and salt each time', async () => {
    const ua = createECDH('prime256v1')
    const uaPublic = new Uint8Array(ua.generateKeys())
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const text = new TextEncoder().encode('hi')
    const a = await encrypt(text, uaPublic, auth)
    const b = await encrypt(text, uaPublic, auth)
    assert.notEqual(toBase64url(a.slice(0, 16)), toBase64url(b.slice(0, 16)), 'salt')
    assert.notEqual(toBase64url(a.slice(21, 86)), toBase64url(b.slice(21, 86)), 'sender key')
  })
})

/** A key pair in the format `web-push generate-vapid-keys` prints. */
function vapidPair() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return { publicKey: toBase64url(ecdh.getPublicKey()), privateKey: toBase64url(ecdh.getPrivateKey()), subject: 'https://push.example.com' }
}

describe('VAPID', () => {
  it('signs a JWT for the push service origin that verifies with the public key', async () => {
    const vapid = vapidPair()
    const now = Date.parse('2026-10-31T19:00:00Z')
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc:def', vapid, now)
    const match = /^vapid t=([^,]+), k=(\S+)$/.exec(header)
    assert.ok(match, header)
    assert.equal(match[2], vapid.publicKey)
    const [h, p, s] = match[1].split('.')
    assert.deepEqual(JSON.parse(new TextDecoder().decode(fromBase64url(h))), { typ: 'JWT', alg: 'ES256' })
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(p)))
    assert.equal(claims.aud, 'https://fcm.googleapis.com')
    assert.equal(claims.sub, vapid.subject)
    assert.equal(claims.exp, Math.floor(now / 1000) + 12 * 3600)

    const publicKey = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: toBase64url(fromBase64url(vapid.publicKey).slice(1, 33)), y: toBase64url(fromBase64url(vapid.publicKey).slice(33, 65)) },
      format: 'jwk',
    })
    assert.equal(verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(fromBase64url(s))), true)
  })

  it('signs once per push service', async () => {
    const sign = createVapidSigner(vapidPair())
    const a = await sign('https://updates.push.services.mozilla.com/wpush/v2/one')
    const b = await sign('https://updates.push.services.mozilla.com/wpush/v2/two')
    const c = await sign('https://web.push.apple.com/three')
    assert.equal(a, b)
    assert.notEqual(a, c)
  })
})

describe('sendWebPush', () => {
  const ua = createECDH('prime256v1')
  const subscription = {
    endpoint: 'https://push.example/send/abc',
    keys: { p256dh: toBase64url(ua.generateKeys()), auth: toBase64url(crypto.getRandomValues(new Uint8Array(16))) },
  }
  const sign = createVapidSigner(vapidPair())

  function fakeFetch(status: number, seen: { request?: Request } = {}) {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.request = new Request(input, init)
      return new Response(status >= 400 ? 'nope' : null, { status })
    }) as typeof fetch
  }

  it('posts the encrypted body with the push headers', async () => {
    const seen: { request?: Request } = {}
    const result = await sendWebPush(subscription, '{"title":"Anything to log?"}', sign, { ttl: 3600, fetch: fakeFetch(201, seen) })
    assert.deepEqual(result, { outcome: 'sent', status: 201 })
    const request = seen.request!
    assert.equal(request.url, subscription.endpoint)
    assert.equal(request.method, 'POST')
    assert.equal(request.headers.get('TTL'), '3600')
    assert.equal(request.headers.get('Urgency'), 'normal')
    assert.equal(request.headers.get('Content-Encoding'), 'aes128gcm')
    assert.match(request.headers.get('Authorization') ?? '', /^vapid t=.+, k=.+$/)
    const body = new Uint8Array(await request.arrayBuffer())
    assert.equal(body.length, 86 + '{"title":"Anything to log?"}'.length + 1 + 16)
  })

  it('reports expired subscriptions and other failures', async () => {
    assert.equal((await sendWebPush(subscription, 'x', sign, { ttl: 1, fetch: fakeFetch(410) })).outcome, 'gone')
    assert.equal((await sendWebPush(subscription, 'x', sign, { ttl: 1, fetch: fakeFetch(404) })).outcome, 'gone')
    const failed = await sendWebPush(subscription, 'x', sign, { ttl: 1, fetch: fakeFetch(429) })
    assert.equal(failed.outcome, 'failed')
    assert.equal(failed.status, 429)
    assert.equal(failed.detail, 'nope')
    const broken = await sendWebPush(subscription, 'x', sign, { ttl: 1, fetch: (async () => { throw new Error('offline') }) as typeof fetch })
    assert.deepEqual(broken, { outcome: 'failed', detail: 'offline' })
  })
})
