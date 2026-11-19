import { Banknote, CalendarClock, Hourglass, LogIn } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { LanguageSelect } from '../../components/settings/LanguageSelect'
import { SyncKeyPanel } from '../../components/settings/SyncVault'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { inputClass } from '../../components/ui/formStyles'
import { toast } from '../../components/ui/toastStore'
import { t } from '../../i18n'
import { appStore, useAppStore } from '../../store'
import { signIn, SYNC_ENABLED, useSyncStatus } from '../../sync'
import { postponeOnboarding } from './postpone'
import { StepFrame, type StepProps } from './StepFrame'

const POINT_ICONS = [CalendarClock, Banknote, Hourglass]

export function WelcomeStep({ step, next }: StepProps) {
  const id = useId()
  const navigate = useNavigate()
  const savedName = useAppStore((s) => s.profile.name)
  const [name, setName] = useState(savedName ?? '')
  const copy = t.onboarding.welcome

  // A finished setup arriving from the online copy means this device has nothing left to ask.
  const { phase, email } = useSyncStatus()
  const finished = useAppStore((s) => s.profile.onboardingCompleted)
  const finishedAtStart = useRef(finished)
  useEffect(() => {
    if (!finished || finishedAtStart.current) return
    toast(t.sync.restored, { tone: 'good' })
    navigate('/', { replace: true })
  }, [finished, navigate])

  return (
    <StepFrame
      step={step}
      title={copy.title}
      intro={copy.intro}
      continueLabel={copy.start}
      skipLabel={t.onboarding.later}
      onSkip={() => {
        postponeOnboarding()
        navigate('/')
      }}
      onContinue={() => {
        appStore.getState().updateProfile({ name: name.trim() || undefined })
        next()
      }}
    >
      <Field label={t.settings.language} htmlFor={`${id}-language`}>
        <LanguageSelect id={`${id}-language`} />
      </Field>
      <ul className="space-y-3">
        {copy.points.map((point, i) => {
          const Icon = POINT_ICONS[i]
          return (
            <li key={point} className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="font-semibold">{point}</span>
            </li>
          )
        })}
      </ul>
      <Field label={copy.nameLabel} aside={t.common.optional} htmlFor={`${id}-name`}>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={copy.namePlaceholder}
          autoComplete="given-name"
          enterKeyHint="next"
          className={inputClass()}
        />
      </Field>
      <Field label={copy.currencyLabel}>
        <p className="flex min-h-12 items-center rounded-xl border border-line bg-surface-2 px-3.5 font-semibold">{copy.currencyValue}</p>
      </Field>
      {SYNC_ENABLED && (
        <div className="border-t border-line pt-5">
          {phase === 'off' || phase === 'signing-in' ? (
            <>
              <p className="mb-2 font-bold">{t.sync.alreadyUse}</p>
              <Button block variant="secondary" icon={LogIn} disabled={phase === 'signing-in'} onClick={() => void signIn()}>
                {phase === 'signing-in' ? t.sync.signingIn : t.sync.signIn}
              </Button>
              <Link to="/privacy" className="mt-2 inline-block text-sm font-bold text-accent underline-offset-2 hover:underline">
                {t.policy.title}
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">{email ? t.sync.signedInAs(email) : t.sync.signedIn}</p>
              {(phase === 'setup' || phase === 'locked') && (
                <div className="mt-4">
                  <SyncKeyPanel phase={phase} email={email} withTitle />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </StepFrame>
  )
}
