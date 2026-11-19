import { Pencil, Plus, Trash2, Zap } from 'lucide-react'
import { useId, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { AmountInput } from '../../components/ui/AmountInput'
import { Button, IconButton } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field } from '../../components/ui/Field'
import { inputClass } from '../../components/ui/formStyles'
import { PageHeader } from '../../components/ui/PageHeader'
import { Select } from '../../components/ui/Select'
import { toast } from '../../components/ui/toastStore'
import { QuantityInput } from '../../components/transactions/QuantityField'
import { WalletPicker } from '../../components/wallets/WalletPicker'
import { t } from '../../i18n'
import { getPayCycle, todayISO } from '../../lib/dates'
import { live } from '../../lib/id'
import { formatMoney, formatQuantity } from '../../lib/money'
import { itemEntries, itemHistory } from '../../lib/stats'
import { quickItemsByUse, quickSuggestions } from '../../lib/quickItems'
import { nameOf } from '../../lib/transactions'
import { appStore, useAppStore } from '../../store'
import { ACCOUNT_IDS } from '../../store/defaults'
import type { QuickItem } from '../../types'

type Draft = Pick<QuickItem, 'name' | 'accountId' | 'categoryId' | 'cycleLimit'> & { id?: string; amount: number | null }

/** Settings › One-tap items: what the + sheet can log with a single tap. */
export function QuickItemsPage() {
  const items = useAppStore((s) => s.quickItems)
  const transactions = useAppStore((s) => s.transactions)
  const accounts = useAppStore((s) => s.accounts)
  const categories = useAppStore((s) => s.categories)
  const main = useAppStore((s) => s.profile.currency)
  const salary = useAppStore((s) => s.profile.salary)
  const [draft, setDraft] = useState<Draft | null>(null)
  const copy = t.quickItems
  const today = todayISO()
  const list = quickItemsByUse(items, transactions, today)
  const suggestions = quickSuggestions(items, transactions, { accounts, categories }, today)
  const boughtThisCycle = (name: string) => itemHistory(itemEntries(transactions, name), [getPayCycle(today, salary)])[0].units

  function newDraft(): Draft {
    const wallet = live(accounts).find((a) => a.id === ACCOUNT_IDS.cash && !a.archived) ?? live(accounts).find((a) => !a.archived)
    const category = live(categories)
      .filter((c) => c.kind === 'expense' && !c.system && c.enabled)
      .sort((a, b) => a.order - b.order)[0]
    return { name: '', amount: null, accountId: wallet?.id ?? '', categoryId: category?.id ?? '' }
  }

  return (
    <div className="max-w-xl">
      <PageHeader title={copy.title} backTo="/settings/money" showSettings={false} />
      <p className="-mt-2 mb-5 text-sm text-muted">{copy.intro}</p>

      {list.length > 0 ? (
        <ul className="mb-3 divide-y divide-line rounded-2xl border border-line bg-surface">
          {list.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2 pe-2 ps-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{item.name}</p>
                <p className="truncate text-sm text-muted">{copy.summary(formatMoney(item.amount, item.currency ?? main), nameOf(categories, item.categoryId), nameOf(accounts, item.accountId))}</p>
                {item.cycleLimit && <p className="truncate text-sm font-semibold text-ink-2">{t.insights.item.limitUse(formatQuantity(boughtThisCycle(item.name)), formatQuantity(item.cycleLimit))}</p>}
              </div>
              <IconButton icon={Pencil} label={copy.editFor(item.name)} variant="ghost" onClick={() => setDraft(item)} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={Zap} title={copy.emptyTitle} body={copy.emptyBody} />
      )}
      <Button variant="secondary" icon={Plus} block onClick={() => setDraft(newDraft())}>
        {copy.add}
      </Button>

      {suggestions.length > 0 && (
        <section aria-labelledby="quick-suggestions" className="mt-6">
          <h2 id="quick-suggestions" className="text-sm font-extrabold">
            {copy.suggestionsTitle}
          </h2>
          <p className="mb-2 text-sm text-muted">{copy.suggestionsBody}</p>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {suggestions.map((s) => (
              <li key={`${s.name}|${s.amount}|${s.accountId}`} className="flex items-center gap-3 py-2 pe-2 ps-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{s.name}</p>
                  <p className="truncate text-sm text-muted">{copy.summary(formatMoney(s.amount, s.currency ?? main), nameOf(categories, s.categoryId), nameOf(accounts, s.accountId))}</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Plus}
                  aria-label={copy.addSuggestion(s.name)}
                  onClick={() => {
                    appStore.getState().addQuickItem({ name: s.name, amount: s.amount, accountId: s.accountId, categoryId: s.categoryId })
                    toast(copy.saved, { tone: 'good' })
                  }}
                >
                  {copy.addShort}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BottomSheet open={draft !== null} onOpenChange={(open) => !open && setDraft(null)} title={draft?.id ? copy.editTitle : copy.newTitle}>
        {draft && <ItemForm key={draft.id ?? 'new'} initial={draft} onDone={() => setDraft(null)} />}
      </BottomSheet>
    </div>
  )
}

function ItemForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const id = useId()
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<{ name?: string; amount?: string; form?: string }>({})
  const accounts = useAppStore((s) => s.accounts)
  const categories = useAppStore((s) => s.categories)
  const main = useAppStore((s) => s.profile.currency)
  const copy = t.quickItems
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setErrors({})
  }
  // A wallet or category that has closed since still shows as the one it had, until it's changed.
  const wallets = live(accounts).filter((a) => !a.archived || a.id === draft.accountId)
  const currency = wallets.find((a) => a.id === draft.accountId)?.currency ?? main
  const categoryOptions = live(categories)
    .filter((c) => c.kind === 'expense' && !c.system && (c.enabled || c.id === draft.categoryId))
    .sort((a, b) => a.order - b.order)

  function save() {
    const nextErrors = { name: draft.name.trim() ? undefined : t.errors.quickName, amount: draft.amount && draft.amount > 0 ? undefined : t.errors.amount }
    if (nextErrors.name || nextErrors.amount) return setErrors(nextErrors)
    const fields = { name: draft.name, amount: draft.amount ?? 0, accountId: draft.accountId, categoryId: draft.categoryId, cycleLimit: draft.cycleLimit ?? undefined }
    const store = appStore.getState()
    try {
      if (draft.id) store.updateQuickItem(draft.id, fields)
      else store.addQuickItem(fields)
      toast(copy.saved, { tone: 'good' })
      onDone()
    } catch (error) {
      setErrors({ form: (error as Error).message })
    }
  }

  function remove() {
    if (!draft.id) return
    const itemId = draft.id
    appStore.getState().deleteQuickItem(itemId)
    onDone()
    toast(copy.deleted, { action: { label: t.common.undo, onClick: () => appStore.getState().restoreQuickItem(itemId) } })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Field label={copy.name} htmlFor={`${id}-name`} error={errors.name}>
        <input id={`${id}-name`} value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder={copy.namePlaceholder} aria-invalid={!!errors.name || undefined} className={inputClass({ invalid: !!errors.name })} />
      </Field>
      <Field label={copy.wallet}>
        <WalletPicker label={copy.wallet} value={draft.accountId} onChange={(accountId) => update({ accountId })} wallets={wallets} />
      </Field>
      <Field label={copy.amount} htmlFor={`${id}-amount`} error={errors.amount}>
        <AmountInput id={`${id}-amount`} value={draft.amount} onChange={(amount) => update({ amount })} invalid={!!errors.amount} currency={currency} />
      </Field>
      <Field label={copy.category} htmlFor={`${id}-category`}>
        <Select id={`${id}-category`} value={draft.categoryId} onChange={(e) => update({ categoryId: e.target.value })}>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={copy.limit} htmlFor={`${id}-limit`} aside={copy.limitAside} hint={copy.limitHint}>
        <QuantityInput id={`${id}-limit`} value={draft.cycleLimit ?? null} onChange={(cycleLimit) => update({ cycleLimit: cycleLimit ?? undefined })} label={copy.limit} placeholder="–" />
      </Field>
      {errors.form && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {errors.form}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        {draft.id && (
          <Button variant="ghost" icon={Trash2} onClick={remove} className="text-crit-ink">
            {copy.delete}
          </Button>
        )}
        <Button type="submit" block>
          {copy.save}
        </Button>
      </div>
    </form>
  )
}
