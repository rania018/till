import clsx from 'clsx'
import { ArrowLeft } from '../../components/ui/directionalIcons'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button, IconButton } from '../../components/ui/Button'
import { t } from '../../i18n'
import { postponeOnboarding } from './postpone'

export const TOTAL_STEPS = 6

export interface StepProps {
  step: number
  /** Go to the next step, or finish after the last one. */
  next: () => void
}

interface StepFrameProps {
  step: number
  title: string
  intro?: string
  children: ReactNode
  onContinue: () => void
  continueLabel?: string
  /** Moves on without saving this step. Hidden when not given. */
  onSkip?: () => void
  skipLabel?: string
}

/** Header with progress, the step's content, and a Continue button kept at the bottom of the screen. */
export function StepFrame({ step, title, intro, children, onContinue, continueLabel = t.onboarding.continue, onSkip, skipLabel = t.onboarding.skip }: StepFrameProps) {
  const navigate = useNavigate()
  const back = () => {
    if (step > 1) return navigate(`/onboarding/${step - 1}`)
    postponeOnboarding()
    navigate('/')
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <header className="flex min-h-12 items-center gap-2">
        <IconButton icon={ArrowLeft} label={step === 1 ? t.onboarding.later : t.common.back} variant="ghost" onClick={back} className="-ms-2" />
        <p className="flex-1 text-center text-sm font-bold text-ink-2">{t.onboarding.stepOf(step, TOTAL_STEPS)}</p>
        {onSkip ? (
          <button type="button" onClick={onSkip} className="min-h-11 rounded-lg px-2 text-sm font-bold text-accent hover:bg-accent-soft">
            {skipLabel}
          </button>
        ) : (
          <span className="w-11" />
        )}
      </header>
      <div aria-hidden className="mt-1 grid grid-cols-6 gap-1">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span key={i} className={clsx('h-1 rounded-full transition-colors', i < step ? 'bg-accent' : 'bg-line')} />
        ))}
      </div>

      <main className="flex-1 pb-6 pt-6">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {intro && <p className="mt-1.5 text-[0.9375rem] text-ink-2">{intro}</p>}
        <div className="mt-6 space-y-5">{children}</div>
      </main>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <Button block size="lg" onClick={onContinue}>
          {continueLabel}
        </Button>
      </div>
    </div>
  )
}
