import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import serviceWorker from '../../public/sw-notifications.js?raw'
import { billText } from './push'
import { sealForPush } from './pushSeal'

type Listener = (event: unknown) => void

/** Loads the real service worker file with just enough of `self` for its push handler. */
function loadServiceWorker() {
  const listeners: Record<string, Listener> = {}
  const shown: { title: string; body: string; tag?: string }[] = []
  const self = {
    addEventListener: (type: string, listener: Listener) => (listeners[type] = listener),
    clients: { matchAll: async () => [] },
    registration: { showNotification: async (title: string, options: { body: string; tag?: string }) => void shown.push({ title, ...options }) },
  }
  new Function('self', serviceWorker)(self)
  async function push(payload: object) {
    const waits: Promise<unknown>[] = []
    listeners.push({ data: { json: () => payload, text: () => JSON.stringify(payload) }, waitUntil: (p: Promise<unknown>) => waits.push(p) })
    await Promise.all(waits)
    return shown.at(-1)
  }
  return { push }
}

describe('sealed bill text in push reminders', () => {
  it('is sealed by the app in a form the server accepts, and says nothing in the clear', async () => {
    const sealed = await sealForPush(billText('Loyer', '20 000 DA', 'fr'))
    expect(sealed).toMatch(/^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/=]{24,1000}$/)
    expect(sealed).not.toContain('Loyer')
    expect(await sealForPush('Loyer, 20 000 DA')).not.toBe(sealed)
  })

  it('is opened by this device’s service worker into the notification', async () => {
    const sealed = await sealForPush(billText('Électricité', '3 500 DA', 'fr'))
    const sw = loadServiceWorker()
    const shown = await sw.push({ title: 'Facture à payer', body: 'Une facture est à payer demain', tag: 'bill-b1-2026-11-01', url: '/plan/bills', sealed, template: '{bill}, à payer demain' })
    expect(shown).toMatchObject({ title: 'Facture à payer', body: 'Électricité, 3 500 DA, à payer demain', tag: 'bill-b1-2026-11-01' })
  })

  it('falls back to the generic text when the sealed part doesn’t open', async () => {
    const sw = loadServiceWorker()
    const shown = await sw.push({ title: 'Bill due', body: 'A bill is due tomorrow', sealed: 'AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', template: '{bill}, is due tomorrow' })
    expect(shown?.body).toBe('A bill is due tomorrow')
  })

  it('writes the name and amount the way each language does', () => {
    expect(billText('Rent', '20,000 DA', 'en')).toBe('Rent, 20,000 DA')
    expect(billText('إيجار', '20 000 دج', 'ar')).toBe('إيجار، 20 000 دج')
  })
})
