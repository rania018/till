import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { installStore, isIos, promptInstall } from '../app/install'
import { t } from '../i18n'
import { dismissInstall, isInstallDismissed } from '../store/deviceState'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'

/** What installing looks like here: a button where the browser allows it, Safari's steps on iPhone, or nothing once installed. */
export function InstallAction() {
  const { prompt, installed } = useStore(installStore)
  if (installed) return <p className="text-sm font-bold text-good-ink">{t.install.installed}</p>
  if (prompt) {
    return (
      <Button size="sm" icon={Download} onClick={() => void promptInstall()}>
        {t.install.action}
      </Button>
    )
  }
  return <p className="text-sm font-semibold text-ink-2">{isIos() ? t.install.iosSteps : t.install.otherBrowser}</p>
}

/** A sheet is open or a field is being typed in. */
function isBusy(): boolean {
  return !!document.querySelector('[role="dialog"], [role="alertdialog"]') || !!document.activeElement?.matches('input, textarea, select')
}

/**
 * Offers to install every time the site is opened, until it's installed.
 * Only where installing can really happen: the browser made its offer, or an iPhone.
 * A browser that already has the app installed makes no offer, so it isn't asked again.
 */
export function InstallPopup() {
  const { prompt, installed } = useStore(installStore)
  const [dismissed, setDismissed] = useState(isInstallDismissed)
  const [ready, setReady] = useState(false)
  const offered = !installed && !dismissed && (!!prompt || isIos())

  // Chrome can make its offer long after the page opened, so it waits for a moment that interrupts nothing.
  useEffect(() => {
    if (!offered) return
    const timer = setInterval(() => {
      if (isBusy()) return
      clearInterval(timer)
      setReady(true)
    }, 500)
    return () => clearInterval(timer)
  }, [offered])

  const close = () => {
    dismissInstall()
    setDismissed(true)
  }

  return (
    <BottomSheet open={offered && ready} onOpenChange={(open) => !open && close()} title={t.install.title} description={t.install.body}>
      {prompt ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={close}>
            {t.install.later}
          </Button>
          <Button
            autoFocus
            icon={Download}
            onClick={() => {
              close()
              void promptInstall()
            }}
          >
            {t.install.action}
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-[0.9375rem] font-semibold text-ink-2">{t.install.iosSteps}</p>
          <Button block autoFocus variant="secondary" className="mt-4" onClick={close}>
            {t.install.later}
          </Button>
        </>
      )}
    </BottomSheet>
  )
}
