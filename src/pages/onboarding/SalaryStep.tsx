import { PayFields } from '../../components/settings/PayFields'
import { usePayDraft } from '../../components/settings/usePayDraft'
import { t } from '../../i18n'
import { appStore } from '../../store'
import { StepFrame, type StepProps } from './StepFrame'

export function SalaryStep({ step, next }: StepProps) {
  const pay = usePayDraft()
  const copy = t.onboarding.salary

  function save() {
    const changes = pay.toProfile()
    if (!changes) return
    appStore.getState().updateProfile(changes)
    next()
  }

  return (
    <StepFrame step={step} title={copy.title} intro={copy.intro} onContinue={save} onSkip={next}>
      <PayFields state={pay} />
    </StepFrame>
  )
}
