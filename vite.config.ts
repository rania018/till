/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readCloudSettings, type CloudSettings } from './src/config/cloudSettings.ts'

const ICON = { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }

/**
 * A Content-Security-Policy for the built app, so even injected code can't send data anywhere
 * but Firebase and the push server, or load scripts from anywhere else. Only in builds: the dev
 * server needs inline scripts of its own. A meta tag, not a header, so Firebase's sign-in pages
 * at /__/auth/ keep their own rules. Check sign-in after changing it.
 *
 * It only allows what the settings turn on (src/config/cloudSettings.ts): Google and Firebase's addresses
 * when sync is on, the push server's address when closed-app reminders are on. With neither, the page
 * can talk to nothing but its own site. Never loosen it.
 */
function contentSecurityPolicy({ syncEnabled, pushEnabled, push, sites, emulator: emulated }: CloudSettings): Plugin {
  const pushApi = pushEnabled ? push.api : ''
  const emulator = emulated ? ['http://127.0.0.1:8080', 'ws://127.0.0.1:8080', 'http://127.0.0.1:9099'] : []
  return {
    name: 'till-content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Each inline script (the theme, before first paint) is allowed by its hash. HTML parsing turns CRLF into LF first.
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, code]) => `'sha256-${createHash('sha256').update(code.replace(/\r\n?/g, '\n')).digest('base64')}'`)
        // Google sign-in's pages are served from the site's own addresses (the .firebaseapp.com one first).
        const authPages = [...sites].sort((a, b) => Number(b.endsWith('.firebaseapp.com')) - Number(a.endsWith('.firebaseapp.com'))).map((site) => `https://${site}`)
        const google = {
          script: ['https://apis.google.com'],
          connect: ['https://firestore.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://www.googleapis.com', 'https://apis.google.com'],
          frame: [...authPages, 'https://accounts.google.com', 'https://apis.google.com'],
        }
        const policy = {
          'default-src': ["'self'"],
          'script-src': ["'self'", ...hashes, ...(syncEnabled ? google.script : [])],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'", ...(syncEnabled ? google.connect : []), pushApi, ...emulator].filter(Boolean),
          'frame-src': ["'self'", ...(syncEnabled ? google.frame : [])],
          'worker-src': ["'self'"],
          'manifest-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
        }
        const content = Object.entries(policy)
          .map(([name, sources]) => `${name} ${sources.join(' ')}`)
          .join('; ')
        // Right after the charset, which browsers only look for in the first 1024 bytes, and before any script.
        const tag = `<meta http-equiv="Content-Security-Policy" content="${content}" />`
        if (!/<meta charset="UTF-8" \/>/.test(html)) throw new Error('index.html has no <meta charset="UTF-8" /> to put the CSP after.')
        return html.replace('<meta charset="UTF-8" />', (charset) => `${charset}\n    ${tag}`)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(readCloudSettings(loadEnv(mode, process.cwd(), 'VITE_'))),
    // Installable app that works offline. The service worker only exists in production builds.
    VitePWA({
      // Ask before updating, so a new version never reloads the page mid-entry (see src/app/pwa.ts).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png', 'pwa-badge.png'],
      manifest: {
        id: '/',
        name: 'Till',
        short_name: 'Till',
        description: 'What’s left till payday, budgets, bills, savings goals, and prices in hours of work. Works offline.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f7f4f8',
        theme_color: '#f7f4f8',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          ICON,
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the app icon on Android.
        shortcuts: [
          { name: 'Add an expense', short_name: 'Add', url: '/?add=expense', icons: [ICON] },
          { name: 'Is it worth it?', short_name: 'Worth it?', url: '/worth-it', icons: [ICON] },
        ],
      },
      workbox: {
        // The whole app, fonts and icons, so it opens with no connection.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // Firebase serves Google sign-in's pages from /__/auth/; the app must not answer for them.
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
        importScripts: ['sw-notifications.js'],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // React and the router change rarely, so they get their own file and stay cached across app updates.
        codeSplitting: {
          groups: [{ name: 'react', test: /[/\\]node_modules[/\\](react|react-dom|react-router|scheduler)[/\\]/ }],
        },
      },
    },
  },
  test: {
    // `pnpm test:sync` runs the checks that need the Firebase emulators.
    include: process.env.SYNC_EMULATOR ? ['src/sync/**/*.emulator.ts'] : ['src/**/*.test.ts'],
    environment: 'node',
  },
}))
