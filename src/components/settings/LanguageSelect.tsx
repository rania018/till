import { LANGUAGE_NAMES, type Language } from '../../i18n/language'
import { appStore, useAppStore } from '../../store'
import { Select } from '../ui/Select'

/** Lists each language in its own name, so it can be found whatever the app is showing. */
export function LanguageSelect({ id }: { id: string }) {
  const value = useAppStore((s) => s.profile.language)
  return (
    <Select id={id} value={value} onChange={(e) => appStore.getState().updateProfile({ language: e.target.value as Language })}>
      {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
        <option key={code} value={code} lang={code}>
          {name}
        </option>
      ))}
    </Select>
  )
}
