import { useEffect } from 'react'
import type { Settings } from '../types'

/** Read by the script in index.html before the first paint. */
const THEME_KEY = 'expense-tracker:theme'
const BROWSER_BAR_COLORS = { light: '#f7f4f8', dark: '#120c18' }

/** Puts the chosen theme on <html> and follows the system setting when the choice is "system". */
export function useApplyTheme(choice: Settings['theme'] | null): void {
  useEffect(() => {
    if (!choice) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const theme = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice
      document.documentElement.dataset.theme = theme
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BROWSER_BAR_COLORS[theme])
    }
    apply()
    try {
      localStorage.setItem(THEME_KEY, choice)
    } catch {
      // Storage blocked: the theme still applies, it may just flash on the next start.
    }
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [choice])
}
