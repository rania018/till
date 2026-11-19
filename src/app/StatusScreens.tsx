import { DatabaseZap, RefreshCw, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { t } from '../i18n'
import { appStore } from '../store'
import { updateApp } from './updateApp'

/** While saved data loads (usually a split second). Fades in late so a quick load shows nothing. */
export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex animate-fade-in flex-col items-center gap-3 opacity-0 [animation-delay:400ms] [animation-fill-mode:forwards]">
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-on-accent">
          <Wallet aria-hidden className="size-6" />
        </span>
        <p className="text-sm font-semibold text-muted">{t.loading}</p>
      </div>
    </div>
  )
}

/** Saved data couldn't be loaded: says why, and what can be done about it. Nothing here changes the saved data. */
export function LoadError() {
  const copy = t.loadFailed
  const failure = appStore.loadFailure()
  const newer = failure?.reason === 'newer-data'
  // The app is out of date: look for the update straight away, so this usually fixes itself.
  const [checking, setChecking] = useState(newer)

  function check() {
    setChecking(true)
    void updateApp().then((updating) => {
      if (!updating) setChecking(false)
    })
  }

  useEffect(() => {
    if (newer) check()
    // Once, when the screen appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const title = newer ? copy.newerTitle : failure?.reason === 'damaged' ? copy.damagedTitle : copy.title
  const body = newer ? copy.newerBody : failure?.reason === 'damaged' ? copy.damagedBody : copy.body

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div role="alert" className="flex max-w-sm flex-col items-center text-center">
        <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-crit-soft text-crit-ink">
          {newer ? <RefreshCw aria-hidden className="size-6" /> : <DatabaseZap aria-hidden className="size-6" />}
        </span>
        <h1 className="text-xl font-extrabold">{title}</h1>
        <p className="mt-2 text-[0.9375rem] text-ink-2">{body}</p>
        {newer && <p className="mt-2 text-[0.9375rem] font-semibold text-ink-2">{checking ? copy.updating : copy.noUpdate}</p>}
        {newer ? (
          <Button className="mt-6" disabled={checking} onClick={check}>
            {copy.update}
          </Button>
        ) : (
          <Button className="mt-6" onClick={() => window.location.reload()}>
            {copy.retry}
          </Button>
        )}
        {failure && (
          <details className="mt-4 text-xs text-muted">
            <summary className="cursor-pointer font-semibold">{copy.details}</summary>
            <p className="mt-1 break-words">{failure.message}</p>
          </details>
        )}
      </div>
    </div>
  )
}
