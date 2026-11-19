import { registerSW } from 'virtual:pwa-register'
import { toast } from '../components/ui/toastStore'
import { t } from '../i18n'

/**
 * Registers the service worker (production builds only). A new version waits
 * until "Update" is tapped, so the page never reloads in the middle of an entry.
 */
export function registerPwa(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast(t.pwa.updateReady, { duration: null, action: { label: t.pwa.update, onClick: () => void updateSW(true) } })
    },
    onOfflineReady() {
      toast(t.pwa.offlineReady, { tone: 'good' })
    },
  })
}
