import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { t } from '../../i18n'
import type { Debt, ID } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Toggle } from '../ui/Toggle'
import type { DebtDraft } from './debtDraft'

const chipClass = (selected: boolean) =>
  clsx(
    'inline-flex min-h-11 items-center gap-2 rounded-full border px-4',
    selected ? 'border-accent bg-accent-soft font-bold text-accent' : 'border-line bg-surface font-semibold hover:bg-surface-2',
  )

interface DebtFieldsProps {
  draft: DebtDraft
  onChange: (patch: Partial<DebtDraft>) => void
  /** Debts with something still owed. */
  openDebts: Debt[]
  /** The debt a payment goes to. */
  debtId?: ID
  onPickDebt: (id: ID) => void
  /** Debts to pick the person from, in any currency. Picking one also picks its currency. */
  people: Debt[]
  onPickPerson: (debt: Debt) => void
  /** What's already on this person's debt, to pick again. */
  items: { name: string; amount: string; onPick: () => void }[]
  /** Fills in everything that's owed. */
  payAll?: { label: string; onClick: () => void }
  /** Who owes what on the debt in question, when there is one. */
  owedLine: string | null
  personError?: string | null
}

/** The top of the Debt tab: what happened, and who with. */
export function DebtFields({ draft, onChange, openDebts, debtId, onPickDebt, people, onPickPerson, items, payAll, owedLine, personError }: DebtFieldsProps) {
  const id = useId()
  const copy = t.transactions
  const { action, person } = draft
  const sameSide = action === 'repay' ? [] : people.filter((d) => d.direction === action)
  // Once someone is chosen the other names are in the way: what's on their debt matters now.
  const chosen = sameSide.some((d) => d.person.trim().toLowerCase() === person.trim().toLowerCase())

  return (
    <div className="space-y-3">
      <SegmentedControl
        label={copy.debtMoveLabel}
        value={action}
        onChange={(next) => onChange({ action: next })}
        options={[
          { value: 'lent', label: copy.debtActions.lent },
          { value: 'borrowed', label: copy.debtActions.borrowed },
          { value: 'repay', label: copy.debtActions.repay },
        ]}
      />
      {action === 'repay' ? (
        openDebts.length > 0 ? (
          <div role="group" aria-label={copy.debtLabel} className="flex flex-wrap gap-2">
            {openDebts.map((debt) => (
              <button key={debt.id} type="button" aria-pressed={debt.id === debtId} onClick={() => onPickDebt(debt.id)} className={chipClass(debt.id === debtId)}>
                {debt.currency ? `${debt.person} · ${debt.currency}` : debt.person}
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-center text-[0.9375rem] text-ink-2">{copy.noDebts}</p>
        )
      ) : (
        <Field label={t.debtSheet.person[action]} htmlFor={`${id}-person`} error={personError}>
          <input
            id={`${id}-person`}
            value={person}
            onChange={(e) => onChange({ person: e.target.value, repeatId: undefined })}
            placeholder={t.debtSheet.personPlaceholder}
            aria-invalid={!!personError || undefined}
            className={inputClass({ invalid: !!personError })}
          />
          {sameSide.length > 0 && !chosen && (
            <div role="group" aria-label={copy.debtLabel} className="mt-2 flex flex-wrap gap-1.5">
              {sameSide.map((debt) => (
                <button
                  key={debt.id}
                  type="button"
                  onClick={() => onPickPerson(debt)}
                  className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2"
                >
                  {debt.currency ? `${debt.person} · ${debt.currency}` : debt.person}
                </button>
              ))}
            </div>
          )}
        </Field>
      )}
      {owedLine && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-sm text-muted">{owedLine}</p>
          {payAll && (
            <button type="button" onClick={payAll.onClick} className="min-h-9 rounded-lg border border-line px-3 text-sm font-bold text-accent hover:bg-surface-2">
              {payAll.label}
            </button>
          )}
        </div>
      )}
      {items.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-bold">{copy.sameAsBefore}</p>
          <div role="group" aria-label={copy.sameAsBefore} className="flex flex-wrap gap-1.5">
            {items.map((item) => (
              <button key={item.name} type="button" onClick={item.onPick} className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 text-sm font-semibold text-ink-2 hover:bg-surface-2">
                {item.name} · {item.amount}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** The Debt tab's less common choices, folded away so the usual case stays short. */
export function DebtOptions({ draft, onChange, currency, monthlyError }: { draft: DebtDraft; onChange: (patch: Partial<DebtDraft>) => void; currency: string; monthlyError?: string | null }) {
  const id = useId()
  const copy = t.debtSheet
  const [open, setOpen] = useState(false)
  // A problem with a field inside has to be visible.
  const shown = open || !!monthlyError
  const borrowed = draft.action === 'borrowed'

  return (
    <div className="rounded-2xl border border-line">
      <button type="button" aria-expanded={shown} onClick={() => setOpen(!shown)} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-start">
        <span className="min-w-0">
          <span className="block text-sm font-bold">{t.transactions.debtOptions}</span>
          <span className="block truncate text-xs text-muted">{borrowed ? t.transactions.debtOptionsBorrowed : t.transactions.debtOptionsLent}</span>
        </span>
        <ChevronDown aria-hidden className={clsx('size-4 shrink-0 text-muted transition-transform', shown && 'rotate-180')} />
      </button>
      {shown && (
        <div className="space-y-3 border-t border-line p-3">
          <Field label={copy.dueDate} aside={copy.dueDateAside} htmlFor={`${id}-due`}>
            <input id={`${id}-due`} type="date" value={draft.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} className={inputClass()} />
          </Field>
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold">{copy.repeats}</span>
              <Toggle checked={draft.repeats} onChange={(repeats) => onChange({ repeats })} label={copy.repeats} />
            </div>
            <p className="text-sm text-muted">{copy.repeatsHint}</p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold">{copy.noWallet}</span>
              <Toggle checked={draft.noMoney} onChange={(noMoney) => onChange({ noMoney })} label={copy.noWallet} />
            </div>
            <p className="text-sm text-muted">{copy.noWalletHint}</p>
          </div>
          {borrowed && (
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold">{copy.instalments}</span>
                <Toggle checked={draft.instalments} onChange={(instalments) => onChange({ instalments })} label={copy.instalments} />
              </div>
              {draft.instalments && (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Field label={copy.monthly} htmlFor={`${id}-monthly`} error={monthlyError}>
                    <AmountInput id={`${id}-monthly`} value={draft.monthly} onChange={(monthly) => onChange({ monthly })} currency={currency} invalid={!!monthlyError} />
                  </Field>
                  <Field label={copy.firstPayment} htmlFor={`${id}-first`}>
                    <input id={`${id}-first`} type="date" value={draft.firstPayment} onChange={(e) => e.target.value && onChange({ firstPayment: e.target.value })} className={inputClass()} />
                  </Field>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
