import { messages, type Language } from '../i18n'
import { nowISO } from '../lib/id'

type Seeds = 'categories' | 'accounts'

const SPOKEN = Object.values(messages)

/**
 * Built-in categories and wallets are saved with their names, so they can be renamed.
 * Puts the ones still carrying a built-in name, in any language, into `language`;
 * a name the user chose stays. Returns `records` itself when nothing changes.
 */
export function withBuiltInNames<T extends { id: string; name: string; updatedAt: string }>(records: T[], kind: Seeds, language: Language): T[] {
  const names = messages[language].seeds[kind]
  let changed = false
  const next = records.map((record) => {
    const wanted = names[record.id]
    if (!wanted || record.name === wanted) return record
    if (!SPOKEN.some((m) => m.seeds[kind][record.id] === record.name)) return record
    changed = true
    return { ...record, name: wanted, updatedAt: nowISO() }
  })
  return changed ? next : records
}
