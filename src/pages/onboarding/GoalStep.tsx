import { useState } from 'react'
import { draftToGoal, goalDraftErrors, goalToDraft, hasErrors, newGoalDraft, type GoalDraft, type GoalDraftErrors } from '../../components/goals/goalDraft'
import { GoalFields } from '../../components/goals/GoalFields'
import { t } from '../../i18n'
import { monthlyRoomForGoal } from '../../lib/budget'
import { monthlyIncomes } from '../../lib/income'
import { monthlyDebtPayments } from '../../lib/debts'
import { goalSaved } from '../../lib/goals'
import { live } from '../../lib/id'
import { appStore, useAppStore } from '../../store'
import { StepFrame, type StepProps } from './StepFrame'

export function GoalStep({ step, next }: StepProps) {
  const goals = live(useAppStore((s) => s.goals)).filter((g) => !g.archived)
  const profile = useAppStore((s) => s.profile)
  const bills = useAppStore((s) => s.bills)
  const transactions = useAppStore((s) => s.transactions)
  const debts = useAppStore((s) => s.debts)
  const incomes = useAppStore((s) => s.incomes)
  const { currency, salary } = profile
  const existing = goals[0]
  const [draft, setDraft] = useState<GoalDraft>(() => (existing ? goalToDraft(existing) : newGoalDraft()))
  const [errors, setErrors] = useState<GoalDraftErrors>({})
  const room = monthlyRoomForGoal(profile, bills, goals, existing?.id, monthlyDebtPayments(debts, transactions, currency), monthlyIncomes(incomes, currency))
  const copy = t.onboarding.goal

  function save() {
    if (!draft.name.trim() && !draft.target) return next()
    const nextErrors = goalDraftErrors(draft, { room, currency })
    if (hasErrors(nextErrors)) return setErrors(nextErrors)
    try {
      const store = appStore.getState()
      if (existing) store.updateGoal(existing.id, draftToGoal(draft, existing))
      else store.addGoal(draftToGoal(draft))
      next()
    } catch (error) {
      setErrors({ form: (error as Error).message })
    }
  }

  return (
    <StepFrame step={step} title={copy.title} intro={copy.intro} onContinue={save} onSkip={next} skipLabel={copy.skip}>
      <GoalFields
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        errors={errors}
        currency={currency}
        salary={salary}
        room={room}
        showIdeas
        tracked={existing ? goalSaved({ id: existing.id }, transactions) : 0}
      />
      {errors.form && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {errors.form}
        </p>
      )}
    </StepFrame>
  )
}
