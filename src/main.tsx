import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled with the app (not loaded from Google), so the font works offline.
// Latin covers English and French. Each file only downloads when its letters are on screen.
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/manrope/latin-800.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css'
import './index.css'
import { App } from './app/App'
import { listenForInstall } from './app/install'
import { applyLanguageToDocument } from './i18n/language'

applyLanguageToDocument()
listenForInstall()
// The service worker only exists in production builds.
if (import.meta.env.PROD) void import('./app/pwa').then(({ registerPwa }) => registerPwa())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
