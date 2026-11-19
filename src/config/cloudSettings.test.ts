import { describe, expect, it } from 'vitest'
import { readCloudSettings } from './cloudSettings'

const FIREBASE = { VITE_FIREBASE_API_KEY: 'AIza-made-up', VITE_FIREBASE_PROJECT_ID: 'my-till', VITE_FIREBASE_APP_ID: '1:1:web:abc' }
const PUSH = { VITE_PUSH_API: 'https://push.example.workers.dev', VITE_VAPID_PUBLIC_KEY: 'Bmade-up' }

describe('readCloudSettings', () => {
  it('has everything off when nothing is set', () => {
    const settings = readCloudSettings({})
    expect(settings.syncEnabled).toBe(false)
    expect(settings.pushEnabled).toBe(false)
    expect(settings.sites).toEqual([])
    expect(settings.push).toEqual({ api: '', vapidPublicKey: '' })
  })

  it('turns sync on only when all three Firebase values are set', () => {
    expect(readCloudSettings(FIREBASE).syncEnabled).toBe(true)
    for (const missing of Object.keys(FIREBASE)) {
      const partial = { ...FIREBASE, [missing]: '' }
      expect(readCloudSettings(partial).syncEnabled, missing).toBe(false)
    }
    expect(readCloudSettings({ VITE_FIREBASE_API_KEY: 'AIza-made-up' }).syncEnabled).toBe(false)
  })

  it('treats blank spaces as not set', () => {
    expect(readCloudSettings({ ...FIREBASE, VITE_FIREBASE_APP_ID: '   ' }).syncEnabled).toBe(false)
  })

  it('defaults the sites to the project’s two Hosting addresses, web.app first', () => {
    expect(readCloudSettings(FIREBASE).sites).toEqual(['my-till.web.app', 'my-till.firebaseapp.com'])
  })

  it('lets the sites be overridden', () => {
    const settings = readCloudSettings({ ...FIREBASE, VITE_FIREBASE_SITES: ' a.example.com , b.example.com,' })
    expect(settings.sites).toEqual(['a.example.com', 'b.example.com'])
  })

  it('turns push on only when both the address and the key are set', () => {
    expect(readCloudSettings(PUSH).pushEnabled).toBe(true)
    expect(readCloudSettings(PUSH).push).toEqual({ api: PUSH.VITE_PUSH_API, vapidPublicKey: PUSH.VITE_VAPID_PUBLIC_KEY })
    expect(readCloudSettings({ VITE_PUSH_API: PUSH.VITE_PUSH_API }).pushEnabled).toBe(false)
    expect(readCloudSettings({ VITE_VAPID_PUBLIC_KEY: PUSH.VITE_VAPID_PUBLIC_KEY }).pushEnabled).toBe(false)
  })

  it('counts a push address that is not https as off', () => {
    for (const api of ['http://push.example.com', 'push.example.com', 'ftp://push.example.com', 'https://']) {
      const settings = readCloudSettings({ ...PUSH, VITE_PUSH_API: api })
      expect(settings.pushEnabled, api).toBe(false)
      expect(settings.push.api).toBe('')
    }
  })

  it('keeps the two features independent', () => {
    expect(readCloudSettings({ ...FIREBASE }).pushEnabled).toBe(false)
    expect(readCloudSettings({ ...PUSH }).syncEnabled).toBe(false)
    const both = readCloudSettings({ ...FIREBASE, ...PUSH })
    expect([both.syncEnabled, both.pushEnabled]).toEqual([true, true])
  })

  it('uses a made-up project under the emulator flag, with no other setting', () => {
    const settings = readCloudSettings({ VITE_FIREBASE_EMULATOR: '1' })
    expect(settings.emulator).toBe(true)
    expect(settings.syncEnabled).toBe(true)
    expect(settings.firebase.projectId).toBe('demo-till')
    expect(settings.pushEnabled).toBe(false)
  })

  it('ignores the project id under the emulator flag', () => {
    expect(readCloudSettings({ ...FIREBASE, VITE_FIREBASE_EMULATOR: '1' }).firebase.projectId).toBe('demo-till')
  })

  it('does not treat any other emulator value as on', () => {
    expect(readCloudSettings({ VITE_FIREBASE_EMULATOR: 'true' }).syncEnabled).toBe(false)
  })
})
