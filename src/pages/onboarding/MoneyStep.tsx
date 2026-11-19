import { useId, useState } from 'react'
import { AmountInput } from '../../components/ui/AmountInput'
import { Field } from '../../components/ui/Field'
import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import { live } from '../../lib/id'
import { formatMoney } from '../../lib/money'
import { appStore, useAppStore } from '../../store'
import { ACCOUNT_IDS } from '../../store/defaults'
import type { ID } from '../../types'
import { StepFrame, type StepProps } from './StepFrame'

export function MoneyStep({ step, next }: StepProps) {
  const id = useId()
  const accounts = live(useAppStore((s) => s.accounts)).filter((a) => !a.archived)
  const onboarded = useAppStore((s) => s.profile.onboardingCompleted)
  const currency = useAppStore((s) => s.profile.currency)
  const [balances, setBalances] = useState<Record<ID, number | null>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, a.startingBalance || null])),
  )
  const copy = t.onboarding.money
  const total = accounts.reduce((sum, a) => sum + (balances[a.id] ?? 0), 0)

  function save() {
    const store = appStore.getState()
    for (const account of accounts) {
      store.updateAccount(account.id, {
        startingBalance: balances[account.id] ?? 0,
        // Balances are "as of today" the first time; later edits keep the original date.
        ...(!onboarded && { startDate: todayISO() }),
      })
    }
    next()
  }

  return (
    <StepFrame step={step} title={copy.title} intro={copy.intro} onContinue={save} onSkip={next}>
      {accounts.map((account) => (
        <Field key={account.id} label={account.id === ACCOUNT_IDS.cash ? copy.cashLabel : account.id === ACCOUNT_IDS.bank ? copy.bankLabel : account.name} htmlFor={`${id}-${account.id}`}>
          <AmountInput
            id={`${id}-${account.id}`}
            size="lg"
            value={balances[account.id] ?? null}
            onChange={(value) => setBalances((b) => ({ ...b, [account.id]: value }))}
          />
        </Field>
      ))}
      <p className="text-sm font-semibold text-muted">{copy.total(formatMoney(total, currency))}</p>
    </StepFrame>
  )
}
