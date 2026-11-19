import { useEffect } from 'react'
import { isLanguage, language, saveLanguage } from '../i18n/language'
import { appStore, savedDataWritten, useAppStore } from '../store'

/**
 * Follows the language in the profile, however it changed: Settings, a restored backup,
 * or another device through sync. A different language needs a page reload, because
 * modules read their text as they load.
 */
export function useApplyLanguage(ready: boolean): void {
  const wanted = useAppStore((s) => s.profile.language)
  useEffect(() => {
    if (!ready || !isLanguage(wanted)) return
    if (wanted === language) {
      saveLanguage(wanted)
      appStore.getState().localizeBuiltInNames()
      return
    }
    // If storage is blocked the next load couldn't know the language, and would land here again.
    if (!saveLanguage(wanted)) return
    void savedDataWritten().finally(() => window.location.reload())
  }, [ready, wanted])
}
