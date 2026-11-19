import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { t } from '../../i18n'
import { fromISODate, isShortPay, todayISO } from '../../lib/dates'
import { live } from '../../lib/id'
import { formatMoney } from '../../lib/money'
import { ACCOUNT_IDS, CATEGORY_IDS } from '../../store/defaults'
import { appStore, useAppStore } from '../../store'
import type { IncomeSource } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { BottomSheet } from '../ui/BottomSheet'
import { Button, IconButton } from '../ui/Button'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { Select } from '../ui/Select'
import { toast } from '../ui/toastStore'
import { WalletPicker } from '../wallets/WalletPicker'

type Draft = Pick<IncomeSource, 'name' | 'frequency' | 'payday' | 'accountId' | 'categoryId'> & { id?: string; amount: number | null; anchor: string }

const FREQUENCIES: Draft['frequency'][] = ['monthly', 'biweekly', 'weekly']

/** Settings › Pay and work: regular money that isn't the salary. Saved as you go, apart from the page's own form. */
export function IncomeSources() {
  const incomes = useAppStore((s) => s.incomes)
  const main = useAppStore((s) => s.profile.currency)
  const categories = useAppStore((s) => s.categories)
  const salaryAccount = useAppStore((s) => s.profile.salary.accountId)
  const [draft, setDraft] = useState<Draft | null>(null)
  const copy = t.income
  const frequencies = t.settings.frequencies
  const sources = live(incomes).sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  function newDraft(): Draft {
    // The salary has its own place: what comes on top of it starts from something else.
    const category = live(categories).find((c) => c.kind === 'income' && !c.system && c.enabled && c.id !== CATEGORY_IDS.salary)
    return { name: '', amount: null, frequency: 'monthly', payday: 1, anchor: todayISO(), accountId: salaryAccount || ACCOUNT_IDS.bank, categoryId: category?.id ?? '' }
  }

  return (
    <section aria-labelledby="income-sources" className="space-y-3">
      <div>
        <h2 id="income-sources" className="text-sm font-extrabold">
          {copy.sourcesTitle}
        </h2>
        <p className="text-sm text-muted">{copy.sourcesBody}</p>
      </div>
      {sources.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {sources.map((source) => (
            <li key={source.id} className="flex items-center gap-3 py-2 pe-2 ps-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{source.name}</p>
                <p className="text-sm text-muted">{copy.sourceSummary(formatMoney(source.amount, source.currency ?? main), frequencies[source.frequency])}</p>
              </div>
              <IconButton icon={Pencil} label={copy.editSourceFor(source.name)} variant="ghost" onClick={() => setDraft({ ...source, anchor: source.anchor ?? todayISO() })} />
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" icon={Plus} block onClick={() => setDraft(newDraft())}>
        {copy.addSource}
      </Button>
      <BottomSheet open={draft !== null} onOpenChange={(open) => !open && setDraft(null)} title={draft?.id ? copy.editSource : copy.newSource}>
        {draft && <SourceForm key={draft.id ?? 'new'} initial={draft} onDone={() => setDraft(null)} />}
      </BottomSheet>
    </section>
  )
}

function SourceForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const id = useId()
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<{ name?: string; amount?: string; form?: string }>({})
  const accounts = useAppStore((s) => s.accounts)
  const categories = useAppStore((s) => s.categories)
  const main = useAppStore((s) => s.profile.currency)
  const copy = t.income
  const payCopy = t.onboarding.salary
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setErrors({})
  }
  const wallets = live(accounts).filter((a) => !a.archived)
  const wallet = wallets.find((a) => a.id === draft.accountId)
  const currency = wallet?.currency ?? main
  const categoryOptions = live(categories)
    .filter((c) => c.kind === 'income' && !c.system && (c.enabled || c.id === draft.categoryId))
    .sort((a, b) => a.order - b.order)

  function save() {
    const nextErrors = { name: draft.name.trim() ? undefined : copy.sourceNameError, amount: draft.amount && draft.amount > 0 ? undefined : copy.sourceAmountError }
    if (nextErrors.name || nextErrors.amount) return setErrors(nextErrors)
    const fields = {
      name: draft.name,
      amount: draft.amount ?? 0,
      frequency: draft.frequency,
      payday: draft.payday,
      anchor: isShortPay(draft) ? draft.anchor : undefined,
      accountId: draft.accountId,
      categoryId: draft.categoryId,
    }
    const store = appStore.getState()
    try {
      if (draft.id) store.updateIncomeSource(draft.id, fields)
      else store.addIncomeSource({ ...fields, startDate: todayISO() })
      toast(copy.sourceSaved, { tone: 'good' })
      onDone()
    } catch (error) {
      setErrors({ form: (error as Error).message })
    }
  }

  function remove() {
    if (!draft.id) return
    const sourceId = draft.id
    appStore.getState().deleteIncomeSource(sourceId)
    onDone()
    toast(copy.sourceDeleted, { action: { label: t.common.undo, onClick: () => appStore.getState().restoreIncomeSource(sourceId) } })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Field label={copy.sourceName} htmlFor={`${id}-name`} error={errors.name}>
        <input
          id={`${id}-name`}
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder={copy.sourceNamePlaceholder}
          aria-invalid={!!errors.name || undefined}
          className={inputClass({ invalid: !!errors.name })}
        />
      </Field>
      <Field label={copy.wallet}>
        <WalletPicker label={copy.wallet} value={draft.accountId} onChange={(accountId) => update({ accountId })} wallets={wallets} />
      </Field>
      <Field label={copy.sourceAmount} htmlFor={`${id}-amount`} error={errors.amount} hint={currency !== main ? copy.anotherCurrency(currency) : undefined}>
        <AmountInput id={`${id}-amount`} value={draft.amount} onChange={(amount) => update({ amount })} invalid={!!errors.amount} currency={currency} />
      </Field>
      <Field label={payCopy.frequencyLabel} htmlFor={`${id}-frequency`}>
        <Select id={`${id}-frequency`} value={draft.frequency} onChange={(e) => update({ frequency: e.target.value as Draft['frequency'] })}>
          {FREQUENCIES.map((frequency) => (
            <option key={frequency} value={frequency}>
              {payCopy[frequency]}
            </option>
          ))}
        </Select>
      </Field>
      {isShortPay(draft) ? (
        <Field label={payCopy.anchorLabel} htmlFor={`${id}-anchor`} hint={payCopy.anchorHint(t.format.weekdays[fromISODate(draft.anchor).getDay()], draft.frequency === 'weekly')}>
          <input id={`${id}-anchor`} type="date" value={draft.anchor} onChange={(e) => e.target.value && update({ anchor: e.target.value })} className={inputClass()} />
        </Field>
      ) : (
        <Field label={payCopy.paydayLabel} htmlFor={`${id}-payday`}>
          <Select id={`${id}-payday`} value={draft.payday} onChange={(e) => update({ payday: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {payCopy.paydayOption(day)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={copy.sourceCategory} htmlFor={`${id}-category`}>
        <Select id={`${id}-category`} value={draft.categoryId} onChange={(e) => update({ categoryId: e.target.value })}>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      {errors.form && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {errors.form}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        {draft.id && (
          <Button variant="ghost" icon={Trash2} onClick={remove} className="text-crit-ink">
            {copy.deleteSource}
          </Button>
        )}
        <Button type="submit" block>
          {copy.save}
        </Button>
      </div>
    </form>
  )
}
