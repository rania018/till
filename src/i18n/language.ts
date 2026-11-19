// Which language this page load runs in. It is decided once, before any text is read,
// because many modules read `t` as they load. Changing language reloads the page
// (see src/app/useApplyLanguage.ts). This file imports no text, so low-level helpers
// like src/lib/money.ts can use it.

export type Language = 'en' | 'fr' | 'ar'

/** Each language in its own name, whatever language the app is in. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', fr: 'Français', ar: 'العربية' }

const LANGUAGE_KEY = 'expense-tracker:language'

// Arabic keeps Latin digits, as used in Algeria. `ar-DZ` would write 1.450,5, where a typed
// "." is ambiguous, so Arabic uses the plain `ar` separators: 1,450.5.
const NUMBER_LOCALES: Record<Language, string> = { en: 'en-US', fr: 'fr-FR', ar: 'ar-u-nu-latn' }

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'fr' || value === 'ar'
}

/** The first of the browser's languages the app has, or English. */
export function preferredLanguage(browserLanguages: readonly string[]): Language {
  for (const tag of browserLanguages) {
    const base = tag.split('-')[0].toLowerCase()
    if (isLanguage(base)) return base
  }
  return 'en'
}

function startLanguage(): Language {
  // Tests run in English whatever the machine's language is.
  if (typeof window === 'undefined') return 'en'
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    // Storage blocked: follow the browser.
  }
  return preferredLanguage(navigator.languages ?? [])
}

export const language: Language = startLanguage()
export const numberLocale = NUMBER_LOCALES[language]
export const direction = language === 'ar' ? 'rtl' : 'ltr'

/** Remembers the language for the next page load. `false` if the browser blocks storage. */
export function saveLanguage(next: Language): boolean {
  try {
    localStorage.setItem(LANGUAGE_KEY, next)
    return true
  } catch {
    return false
  }
}

/** Puts the language and text direction on <html>. Runs before the first render. */
export function applyLanguageToDocument(): void {
  document.documentElement.lang = language
  document.documentElement.dir = direction
}
