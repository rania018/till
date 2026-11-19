import { Archive, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import { isRepayment } from '../../lib/debts'
import { live } from '../../lib/id'
import { appStore, useAppStore } from '../../store'
import type { Debt } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { Select } from '../ui/Select'
import { toast } from '../ui/toastStore'
import { Toggle } from '../ui/Toggle'

interface DebtSheetProps {
  /** The debt to edit; `null` closes the sheet. New debts start on the + sheet's Debt tab. */
  debt: Debt | null
  onClose: () => void
  /** After the debt is deleted, e.g. to leave its page. */
  onDeleted?: () => void
}

/** Edit, close or delete a debt. Saves straight to the store. */
export function DebtSheet({ debt, onClose, onDeleted }: DebtSheetProps) {
  return (
    <BottomSheet open={debt !== null} onOpenChange={(open) => !open && onClose()} title={t.debtSheet.editTitle}>
      {debt && <DebtForm key={debt.id} existing={debt} onDone={onClose} onDeleted={onDeleted} />}
    </BottomSheet>
  )
}

function DebtForm({ existing, onDone, onDeleted }: { existing: Debt; onDone: () => void; onDeleted?: () => void }) {
  const id = useId()
  const copy = t.debtSheet
  const main = useAppStore((s) => s.profile.currency)
  const transactions = useAppStore((s) => s.transactions)
  const [currency, setCurrency] = useState(existing.currency ?? main)
  const moves = live(transactions).filter((t) => t.debtId === existing.id)
  const hasEntries = moves.length > 0 || !!existing.charges?.length
  // The first amount that went through a wallet: changing it here changes that entry, so the wallet stays right.
  const opening = moves.filter((t) => !isRepayment(existing, t.type)).sort((a, b) => a.date.localeCompare(b.date))[0]
  const currencyChoices = [...new Set([main, currency, ...Object.keys(t.settings.currencies)])]
  const [person, setPerson] = useState(existing.person)
  const [amount, setAmount] = useState<number | null>(existing.startingAmount || opening?.amount || null)
  const [date, setDate] = useState(existing.date)
  const [note, setNote] = useState(existing.note ?? '')
  const [dueDate, setDueDate] = useState(existing.dueDate ?? '')
  const [instalments, setInstalments] = useState(!!existing.monthlyPayment)
  const [monthly, setMonthly] = useState<number | null>(existing.monthlyPayment ?? null)
  const [firstPayment, setFirstPayment] = useState(existing.firstPaymentDate ?? todayISO())
  const [errors, setErrors] = useState<{ person?: string; monthly?: string; form?: string }>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const borrowed = existing.direction === 'borrowed'
  const startsWithoutMoney = existing.startingAmount > 0
  const showAmount = startsWithoutMoney || !!opening

  function save() {
    const next = {
      person: person.trim() ? undefined : copy.personError,
      monthly: borrowed && instalments && !((monthly ?? 0) > 0) ? copy.monthlyError : undefined,
    }
    if (next.person || next.monthly) return setErrors(next)
    const plan = borrowed && instalments
    try {
      const store = appStore.getState()
      if (!startsWithoutMoney && opening && amount !== opening.amount) store.updateTransaction(opening.id, { amount: amount ?? 0 })
      store.updateDebt(existing.id, {
        person: person.trim(),
        currency,
        date,
        dueDate: dueDate || undefined,
        note: note.trim() || undefined,
        monthlyPayment: plan ? (monthly ?? undefined) : undefined,
        firstPaymentDate: plan ? firstPayment : undefined,
        startingAmount: startsWithoutMoney ? (amount ?? 0) : existing.startingAmount,
      })
      toast(copy.saved, { tone: 'good' })
      onDone()
    } catch (e) {
      setErrors({ form: (e as Error).message })
    }
  }

  function close() {
    const { id: debtId, person: name } = existing
    appStore.getState().updateDebt(debtId, { archived: true })
    onDone()
    toast(copy.closed(name), { action: { label: t.common.undo, onClick: () => appStore.getState().updateDebt(debtId, { archived: false }) } })
  }

  function remove() {
    const { id: debtId, person: name } = existing
    appStore.getState().deleteDebt(debtId)
    onDone()
    onDeleted?.()
    toast(copy.deleted(name), { action: { label: t.common.undo, onClick: () => appStore.getState().restoreDebt(debtId) } })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Field label={copy.person[existing.direction]} htmlFor={`${id}-person`} error={errors.person}>
        <input
          id={`${id}-person`}
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          placeholder={copy.personPlaceholder}
          aria-invalid={!!errors.person || undefined}
          className={inputClass({ invalid: !!errors.person })}
        />
      </Field>
      {showAmount && (
        <Field label={startsWithoutMoney ? copy.already : copy.amount} htmlFor={`${id}-amount`} hint={startsWithoutMoney ? copy.alreadyHint : undefined}>
          <AmountInput id={`${id}-amount`} value={amount} onChange={setAmount} currency={currency} />
        </Field>
      )}
      <Field label={copy.currency} htmlFor={`${id}-currency`} hint={hasEntries ? copy.currencyLocked : undefined}>
        <Select id={`${id}-currency`} value={currency} disabled={hasEntries} onChange={(e) => setCurrency(e.target.value)}>
          {currencyChoices.map((code) => (
            <option key={code} value={code}>
              {t.settings.currencies[code] ?? code}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={copy.date} htmlFor={`${id}-date`}>
        <input id={`${id}-date`} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass()} />
      </Field>
      <Field label={copy.note} aside={copy.noteAside} htmlFor={`${id}-note`}>
        <input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={copy.notePlaceholder} className={inputClass()} />
      </Field>
      <Field label={copy.dueDate} aside={copy.dueDateAside} htmlFor={`${id}-due`}>
        <input id={`${id}-due`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass()} />
      </Field>

      {borrowed && (
        <div className="rounded-2xl border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold">{copy.instalments}</span>
            <Toggle checked={instalments} onChange={setInstalments} label={copy.instalments} />
          </div>
          {instalments && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label={copy.monthly} htmlFor={`${id}-monthly`} error={errors.monthly}>
                <AmountInput id={`${id}-monthly`} value={monthly} onChange={setMonthly} currency={currency} invalid={!!errors.monthly} />
              </Field>
              <Field label={copy.firstPayment} htmlFor={`${id}-first`}>
                <input id={`${id}-first`} type="date" value={firstPayment} onChange={(e) => e.target.value && setFirstPayment(e.target.value)} className={inputClass()} />
              </Field>
            </div>
          )}
        </div>
      )}

      {errors.form && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {errors.form}
        </p>
      )}
      <Button type="submit" block size="lg">
        {copy.save}
      </Button>
      <div className="flex flex-wrap justify-center gap-2">
        {!existing.archived && (
          <Button variant="ghost" size="sm" icon={Archive} onClick={close}>
            {copy.close}
          </Button>
        )}
        <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmingDelete(true)} className="text-crit-ink">
          {copy.delete}
        </Button>
        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={copy.deleteTitle(existing.person)}
          body={copy.deleteBody}
          confirmLabel={copy.deleteConfirm}
          onConfirm={remove}
        />
      </div>
    </form>
  )
}
