import { ar } from './ar'
import { en, type Messages } from './en'
import { fr } from './fr'
import { language, type Language } from './language'

export { language, type Language } from './language'
export type { Messages } from './en'

export const messages: Record<Language, Messages> = { en, fr, ar }

/** All text the app shows, in the language of this page load. */
export const t: Messages = messages[language]
