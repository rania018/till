import { Hourglass } from 'lucide-react'
import { useId } from 'react'
import { t } from '../../i18n'
import { isMainCurrency } from '../../lib/currency'
import { fromISODate, isShortPay } from '../../lib/dates'
import { live } from '../../lib/id'
import { formatMoney } from '../../lib/money'
import { hourlyRate } from '../../lib/workHours'
import { useAppStore } from '../../store'
import { AmountInput } from '../ui/AmountInput'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select } from '../ui/Select'
import { Stepper } from '../ui/Stepper'
import { WalletPicker } from '../wallets/WalletPicker'
import type { PayDraftState } from './usePayDraft'

/** Take-home pay, how often, payday, the wallet it lands in, working time and the hourly rate they give. */
export function PayFields({ state }: { state: PayDraftState }) {
  const id = useId()
  const { draft, basis, setBasis, error, setError, setSalary, setWork } = state
  const profile = useAppStore((s) => s.profile)
  const accounts = useAppStore((s) => s.accounts)
  const currency = useAppStore((s) => s.profile.currency)
  const copy = t.onboarding.salary
  const { salary, work } = draft
  const irregular = salary.frequency === 'irregular'
  const showAmount = !irregular || basis === 'estimate'
  const rate = hourlyRate({ salary: { ...salary, amount: showAmount ? (salary.amount ?? 0) : 0 }, work, hourlyRateBasis: profile.hourlyRateBasis })

  return (
    <>
      <Field label={copy.frequencyLabel} htmlFor={`${id}-frequency`}>
        <Select id={`${id}-frequency`} value={salary.frequency} onChange={(e) => setSalary({ frequency: e.target.value as typeof salary.frequency })}>
          <option value="monthly">{copy.monthly}</option>
          <option value="biweekly">{copy.biweekly}</option>
          <option value="weekly">{copy.weekly}</option>
          <option value="irregular">{copy.irregular}</option>
        </Select>
      </Field>

      {irregular && (
        <Field label={copy.basisLabel} hint={basis === 'received' ? copy.basisReceivedHint : copy.basisEstimateHint}>
          <SegmentedControl
            label={copy.basisLabel}
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'received', label: copy.basisReceived },
              { value: 'estimate', label: copy.basisEstimate },
            ]}
          />
        </Field>
      )}

      {showAmount && (
        <Field label={irregular ? copy.estimateLabel : copy.amountLabel} htmlFor={`${id}-amount`} error={error}>
          <AmountInput
            id={`${id}-amount`}
            size="lg"
            value={salary.amount}
            invalid={!!error}
            currency={profile.currency}
            onChange={(amount) => {
              setSalary({ amount })
              setError(null)
            }}
          />
        </Field>
      )}

      {isShortPay(salary) ? (
        <Field label={copy.anchorLabel} htmlFor={`${id}-anchor`} hint={salary.anchor && copy.anchorHint(t.format.weekdays[fromISODate(salary.anchor).getDay()], salary.frequency === 'weekly')}>
          <input id={`${id}-anchor`} type="date" value={salary.anchor ?? ''} onChange={(e) => e.target.value && setSalary({ anchor: e.target.value })} className={inputClass()} />
        </Field>
      ) : (
        <Field label={irregular ? copy.monthStartLabel : copy.paydayLabel} htmlFor={`${id}-payday`} hint={copy.cycleHint(salary.payday)}>
          <Select id={`${id}-payday`} value={salary.payday} onChange={(e) => setSalary({ payday: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {copy.paydayOption(day)}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label={copy.accountLabel}>
        <WalletPicker label={copy.accountLabel} value={salary.accountId} onChange={(accountId) => setSalary({ accountId })} wallets={live(accounts).filter((a) => !a.archived && isMainCurrency(a, currency))} />
      </Field>

      <Field label={copy.workLabel}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted">{copy.hoursPerDay}</p>
            <Stepper
              value={work.hoursPerDay}
              onChange={(hoursPerDay) => setWork({ hoursPerDay })}
              min={1}
              max={16}
              label={copy.hoursPerDay}
              decreaseLabel={copy.fewerHours}
              increaseLabel={copy.moreHours}
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted">{copy.daysPerWeek}</p>
            <Stepper
              value={work.daysPerWeek}
              onChange={(daysPerWeek) => setWork({ daysPerWeek })}
              min={1}
              max={7}
              label={copy.daysPerWeek}
              decreaseLabel={copy.fewerDays}
              increaseLabel={copy.moreDays}
            />
          </div>
        </div>
      </Field>

      {rate !== null && (
        <div className="flex gap-3 rounded-2xl bg-accent-soft p-4 text-[0.9375rem]">
          <Hourglass aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
          <p>
            <span className="font-bold">{copy.rate(formatMoney(Math.round(rate), profile.currency))}</span> {copy.rateUse}
          </p>
        </div>
      )}
    </>
  )
}
