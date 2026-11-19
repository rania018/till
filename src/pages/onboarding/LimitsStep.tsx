import { LimitsEditor } from '../../components/budget/LimitsEditor'
import { useLimitsDraft } from '../../components/budget/useLimitsDraft'
import { t } from '../../i18n'
import { StepFrame, type StepProps } from './StepFrame'

export function LimitsStep({ step, next }: StepProps) {
  const draft = useLimitsDraft()
  const copy = t.onboarding.limits
  return (
    <StepFrame
      step={step}
      title={copy.title}
      intro={copy.intro}
      onContinue={() => {
        draft.save()
        next()
      }}
      continueLabel={t.onboarding.finish}
      onSkip={next}
      skipLabel={copy.skip}
    >
      <LimitsEditor draft={draft} />
    </StepFrame>
  )
}
