import { Lock } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { canUseBiometrics, isCurrentPin, LOCK_AFTER, lockNow, removeLock, setAmountsHiddenOn, setHideOnOpen, setLockAfter, setPin, turnOffBiometrics, turnOnBiometrics, useLock, type LockAfter } from '../../app/lock'
import { t } from '../../i18n'
import { isValidPin, PIN_MAX, PIN_MIN } from '../../lib/pin'
import { PinDots, PinPad, type PinKey } from '../lock/PinPad'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Select } from '../ui/Select'
import { toast } from '../ui/toastStore'
import { Toggle } from '../ui/Toggle'
import { SettingRow } from './SettingRow'

type PinFlow = 'set' | 'change' | 'remove'

/** Hidden amounts and the app lock. Both stay on this device: they're never synced or sent anywhere. */
export function PrivacySettings() {
  const copy = t.lock
  const config = useLock((s) => s.config)
  const hidden = useLock((s) => s.hidden)
  const hideOnOpen = useLock((s) => s.hideOnOpen)
  const [flow, setFlow] = useState<PinFlow | null>(null)
  const [biometrics, setBiometrics] = useState(false)
  useEffect(() => {
    void canUseBiometrics().then(setBiometrics)
  }, [])

  async function toggleBiometrics(on: boolean) {
    if (!on) return turnOffBiometrics()
    if (!(await turnOnBiometrics(t.appName))) toast(copy.biometricsFailed, { tone: 'crit' })
  }

  return (
    <div className="space-y-3 desk:flex desk:flex-col desk:*:grow">
      <Card className="divide-y divide-line">
        <SettingRow title={copy.hideAmounts} hint={copy.hideAmountsHint} control={<Toggle checked={hidden} onChange={setAmountsHiddenOn} label={copy.hideAmounts} />} />
        <SettingRow title={copy.hideOnOpen} hint={copy.hideOnOpenHint} control={<Toggle checked={hideOnOpen} onChange={setHideOnOpen} label={copy.hideOnOpen} />} />
      </Card>

      <Card className="divide-y divide-line">
        {config ? (
          <>
            <SettingRow title={copy.lockOn} hint={copy.lockOnHint}>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setFlow('change')}>
                  {copy.changePin}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setFlow('remove')}>
                  {copy.removeLock}
                </Button>
                <Button variant="secondary" size="sm" icon={Lock} onClick={lockNow}>
                  {copy.lockNow}
                </Button>
              </div>
            </SettingRow>
            <SettingRow title={copy.after}>
              <Select aria-label={copy.after} value={config.after} onChange={(e) => setLockAfter(Number(e.target.value) as LockAfter)}>
                {LOCK_AFTER.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {copy.afterOptions(minutes)}
                  </option>
                ))}
              </Select>
            </SettingRow>
            {biometrics && <SettingRow title={copy.biometrics} hint={copy.biometricsHint} control={<Toggle checked={!!config.credentialId} onChange={(on) => void toggleBiometrics(on)} label={copy.biometrics} />} />}
          </>
        ) : (
          <SettingRow title={copy.setUp} hint={copy.setUpHint}>
            <Button variant="secondary" icon={Lock} onClick={() => setFlow('set')}>
              {copy.setPin}
            </Button>
          </SettingRow>
        )}
        <p className="pt-3 text-sm text-muted">{copy.notEncryption}</p>
      </Card>

      <BottomSheet open={flow !== null} onOpenChange={(open) => !open && setFlow(null)} title={flow === 'remove' ? copy.removeLock : flow === 'change' ? copy.changePin : copy.setPin}>
        {flow && <PinFlowForm key={flow} flow={flow} onDone={() => setFlow(null)} />}
      </BottomSheet>
    </div>
  )
}

type Step = 'current' | 'new' | 'again'

/** Asks for the current PIN where needed, then a new one twice. */
function PinFlowForm({ flow, onDone }: { flow: PinFlow; onDone: () => void }) {
  const copy = t.lock
  const currentLength = useLock((s) => s.config?.pin.length ?? PIN_MAX)
  const [step, setStep] = useState<Step>(flow === 'set' ? 'new' : 'current')
  const [digits, setDigits] = useState('')
  const [first, setFirst] = useState('')
  const [error, setError] = useState<string | null>(null)
  const max = step === 'current' ? currentLength : PIN_MAX

  const next = useCallback(
    async (value: string) => {
      if (step === 'current') {
        if (!(await isCurrentPin(value))) {
          setDigits('')
          return setError(copy.wrongCurrent)
        }
        if (flow === 'remove') {
          removeLock()
          onDone()
          return toast(copy.removed, { tone: 'good' })
        }
        setStep('new')
      } else if (step === 'new') {
        if (!isValidPin(value)) return setError(copy.pinLength(PIN_MIN, PIN_MAX))
        setFirst(value)
        setStep('again')
      } else {
        if (value !== first) {
          setDigits('')
          setFirst('')
          setStep('new')
          return setError(copy.mismatch)
        }
        await setPin(value)
        onDone()
        return toast(flow === 'set' ? copy.pinSet : copy.pinChanged, { tone: 'good' })
      }
      setDigits('')
      setError(null)
    },
    [step, flow, first, onDone, copy],
  )

  const onKey = useCallback(
    (key: PinKey) => {
      if (key === 'back') return setDigits((d) => d.slice(0, -1))
      const value = (digits + key).slice(0, max)
      setDigits(value)
      setError(null)
      // The current PIN's length is known, so it's checked as soon as it's all there.
      if (step === 'current' && value.length === currentLength) void next(value)
    },
    [digits, max, step, currentLength, next],
  )

  const prompt = step === 'current' ? copy.enterCurrent : step === 'new' ? copy.enterNew(PIN_MIN, PIN_MAX) : copy.enterAgain

  return (
    <div className="space-y-5 pb-2 text-center">
      <p className="text-[0.9375rem] font-semibold text-ink-2">{prompt}</p>
      <PinDots count={digits.length} length={step === 'current' ? currentLength : Math.max(PIN_MIN, digits.length)} error={!!error && digits.length === 0} />
      <p className="sr-only" aria-live="polite">
        {copy.typed(digits.length, max)}
      </p>
      <p role="alert" className="min-h-5 text-sm font-semibold text-crit-ink">
        {error}
      </p>
      <PinPad onKey={onKey} onEnter={step !== 'current' ? () => void next(digits) : undefined} />
      {step !== 'current' && (
        <Button block size="lg" disabled={digits.length < PIN_MIN} onClick={() => void next(digits)}>
          {step === 'new' ? copy.next : copy.save}
        </Button>
      )}
    </div>
  )
}
