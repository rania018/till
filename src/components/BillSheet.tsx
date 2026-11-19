import { Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { todayISO } from '../lib/dates'
import { isMainCurrency } from '../lib/currency'
import { fundForBill } from '../lib/funds'
import { live } from '../lib/id'
import { formatMoney } from '../lib/money'
import { t } from '../i18n'
import { appStore, useAppStore } from '../store'
import type { BillFrequency } from '../types'
import { draftToBill, type BillDraft } from './billDraft'
import { AmountInput } from './ui/AmountInput'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'
import { Field } from './ui/Field'
import { inputClass } from './ui/formStyles'
import { Select } from './ui/Select'
import { toast } from './ui/toastStore'
import { Toggle } from './ui/Toggle'
import { WalletPicker } from './wallets/WalletPicker'

interface BillSheetProps {
  /** The bill to edit or create; `null` closes the sheet. */
  draft: BillDraft | null
  onClose: () => void
}

/** Add or edit a bill. Saves straight to the store. */
export function BillSheet({ draft, onClose }: BillSheetProps) {
  return (
    <BottomSheet open={draft !== null} onOpenChange={(open) => !open && onClose()} title={draft?.id ? t.billSheet.editTitle : t.billSheet.newTitle}>
      {draft && <BillForm key={draft.id ?? draft.name} initial={draft} onDone={onClose} />}
    </BottomSheet>
  )
}

const FREQUENCIES: BillFrequency[] = ['monthly', 'quarterly', 'yearly', 'weekly']

function BillForm({ initial, onDone }: { initial: BillDraft; onDone: () => void }) {
  const id = useId()
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<{ name?: string; amount?: string; form?: string }>({})
  const categories = useAppStore((s) => s.categories)
  const accounts = useAppStore((s) => s.accounts)
  const goals = useAppStore((s) => s.goals)
  const hadFund = !!fundForBill(goals, draft.id)
  const [fund, setFund] = useState(hadFund)
  // Only a bill that comes now and then needs saving up for.
  const canHaveFund = draft.frequency === 'quarterly' || draft.frequency === 'yearly'

  const update = (patch: Partial<BillDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const categoryOptions = live(categories)
    .filter((c) => c.kind === 'expense' && !c.system && (c.enabled || c.id === draft.categoryId))
    .sort((a, b) => a.order - b.order)
  const main = useAppStore((s) => s.profile.currency)
  // Bills are planned in the main currency, so that's what pays them.
  const accountOptions = live(accounts).filter((a) => !a.archived && isMainCurrency(a, main))

  function save() {
    const nextErrors = {
      name: draft.name.trim() ? undefined : t.billSheet.nameError,
      amount: draft.amount && draft.amount > 0 ? undefined : t.billSheet.amountError,
    }
    if (nextErrors.name || nextErrors.amount) return setErrors(nextErrors)
    const today = todayISO()
    const store = appStore.getState()
    const wantFund = canHaveFund && fund
    // Left alone unless it changes, so editing a bill never starts or stops its fund by surprise.
    const fundOption = wantFund !== hadFund ? { fund: wantFund } : {}
    try {
      let bill = draft.id
      if (bill) store.updateBill(bill, draftToBill(draft, today, store.bills.find((b) => b.id === draft.id)), fundOption)
      else bill = store.addBill(draftToBill(draft, today), fundOption).id
      const started = wantFund && !hadFund ? fundForBill(appStore.getState().goals, bill) : undefined
      if (started) toast(t.funds.started(started.name, formatMoney(started.monthlyContribution, appStore.getState().profile.currency)), { tone: 'good' })
      if (hadFund && !wantFund) toast(t.funds.stopped(draft.name.trim()))
      onDone()
    } catch (error) {
      setErrors({ form: (error as Error).message })
    }
  }

  function remove() {
    if (!draft.id) return
    const billId = draft.id
    appStore.getState().deleteBill(billId)
    onDone()
    toast(t.onboarding.bills.deleted, { action: { label: t.common.undo, onClick: () => appStore.getState().restoreBill(billId) } })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Field label={t.billSheet.name} htmlFor={`${id}-name`} error={errors.name}>
        <input
          id={`${id}-name`}
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder={t.billSheet.namePlaceholder}
          aria-invalid={!!errors.name || undefined}
          className={inputClass({ invalid: !!errors.name })}
        />
      </Field>
      <Field label={t.billSheet.amount} htmlFor={`${id}-amount`} error={errors.amount}>
        <AmountInput id={`${id}-amount`} value={draft.amount} onChange={(amount) => update({ amount })} invalid={!!errors.amount} />
      </Field>
      <Field label={t.billSheet.frequency} htmlFor={`${id}-frequency`}>
        <Select id={`${id}-frequency`} value={draft.frequency} onChange={(e) => update({ frequency: e.target.value as BillFrequency })}>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {t.billSheet.frequencies[f]}
            </option>
          ))}
        </Select>
      </Field>

      {draft.frequency === 'monthly' && (
        <Field label={t.billSheet.dueDay} htmlFor={`${id}-due`}>
          <Select id={`${id}-due`} value={draft.dueDay} onChange={(e) => update({ dueDay: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {t.billSheet.dueDayOption(day)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {draft.frequency === 'weekly' && (
        <Field label={t.billSheet.dueWeekday} htmlFor={`${id}-due`}>
          <Select id={`${id}-due`} value={draft.dueDay % 7} onChange={(e) => update({ dueDay: Number(e.target.value) })}>
            {t.format.weekdays.map((name, day) => (
              <option key={name} value={day}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {(draft.frequency === 'quarterly' || draft.frequency === 'yearly') && (
        <Field label={t.billSheet.nextDue} htmlFor={`${id}-due`}>
          <input
            id={`${id}-due`}
            type="date"
            value={draft.nextDue}
            onChange={(e) => e.target.value && update({ nextDue: e.target.value })}
            className={inputClass()}
          />
        </Field>
      )}

      <Field label={t.billSheet.category} htmlFor={`${id}-category`}>
        <Select id={`${id}-category`} value={draft.categoryId} onChange={(e) => update({ categoryId: e.target.value })}>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.billSheet.paidFrom}>
        <WalletPicker label={t.billSheet.paidFrom} value={draft.accountId} onChange={(accountId) => update({ accountId })} wallets={accountOptions} />
      </Field>
      {canHaveFund && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
          <span className="min-w-0">
            <span className="block text-sm font-bold">{t.funds.billSwitch}</span>
            <span className="block text-xs text-muted">{t.funds.billSwitchHint}</span>
          </span>
          <Toggle label={t.funds.billSwitch} checked={fund} onChange={setFund} />
        </div>
      )}

      {errors.form && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {errors.form}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        {draft.id && (
          <Button variant="ghost" icon={Trash2} onClick={remove} className="text-crit-ink">
            {t.billSheet.delete}
          </Button>
        )}
        <Button type="submit" block>
          {t.billSheet.save}
        </Button>
      </div>
    </form>
  )
}
