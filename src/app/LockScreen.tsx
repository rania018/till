import { Fingerprint } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PinDots, PinPad, type PinKey } from '../components/lock/PinPad'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { LogoTile } from '../components/ui/Logo'
import { t } from '../i18n'
import { triesLeft } from '../lib/pin'
import { forgetThisDevice } from '../sync'
import { removeLock, tryBiometrics, tryPin, useLock } from './lock'
import { router } from './router'

/** Shown instead of the whole app while it's locked: nothing of the app is rendered behind it. */
export function LockScreen() {
  const copy = t.lock
  const config = useLock((s) => s.config)
  const tries = useLock((s) => s.tries)
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(0)
  const [checking, setChecking] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [forgot, setForgot] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const waiting = tries.waitUntil > now
  const length = config?.pin.length ?? 4
  const hasBiometrics = !!config?.credentialId

  // Counts down a wait after too many wrong tries.
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [waiting])

  // Fingerprint or face is offered straight away, once, when it's set up.
  const asked = useRef(false)
  useEffect(() => {
    if (hasBiometrics && !asked.current && document.visibilityState === 'visible') {
      asked.current = true
      void tryBiometrics()
    }
  }, [hasBiometrics])

  const onKey = useCallback(
    async (key: PinKey) => {
      if (waiting || checking) return
      if (key === 'back') return setPin((p) => p.slice(0, -1))
      const next = (pin + key).slice(0, length)
      setPin(next)
      if (next.length < length) return
      setChecking(true)
      const ok = await tryPin(next)
      setChecking(false)
      setNow(Date.now())
      if (!ok) {
        setPin('')
        setWrong((n) => n + 1)
      }
    },
    [pin, length, waiting, checking],
  )

  const secondsLeft = Math.ceil((tries.waitUntil - now) / 1000)
  const message = waiting ? copy.wait(secondsLeft) : wrong > 0 ? copy.wrong(triesLeft(tries, now)) : null

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-10">
      <div className="w-full max-w-xs space-y-6 text-center">
        <LogoTile className="mx-auto size-12" />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{copy.title}</h1>
          <p className="mt-1 text-[0.9375rem] text-ink-2">{copy.enter}</p>
        </div>
        <PinDots key={wrong} count={pin.length} length={length} error={wrong > 0 && pin.length === 0} />
        <p className="sr-only" aria-live="polite">
          {copy.typed(pin.length, length)}
        </p>
        <p role="alert" className="min-h-5 text-sm font-semibold text-crit-ink">
          {message}
        </p>
        <PinPad
          onKey={onKey}
          disabled={waiting || checking}
          corner={
            hasBiometrics && (
              <button type="button" onClick={() => void tryBiometrics()} aria-label={copy.useBiometrics} title={copy.useBiometrics} className="grid size-14 place-items-center rounded-2xl text-accent hover:bg-surface-2">
                <Fingerprint aria-hidden className="size-7" />
              </button>
            )
          }
        />
        {forgot ? (
          <div className="rounded-2xl border border-line bg-surface p-4 text-start">
            <p className="font-bold">{copy.forgotTitle}</p>
            <p className="mt-1 text-sm text-ink-2">{copy.forgotBody}</p>
            <Button variant="danger" block className="mt-3" onClick={() => setConfirming(true)}>
              {copy.forgetDevice}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setForgot(true)}>
            {copy.forgot}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={copy.forgetTitle}
        body={copy.forgetConfirm}
        confirmLabel={copy.forgetDevice}
        onConfirm={() => {
          // Home sends a fresh app to setup; the app is still where it was locked.
          void forgetThisDevice().then(() => router.navigate('/', { replace: true })).then(removeLock)
        }}
      />
    </main>
  )
}
