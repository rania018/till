import { Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { t } from '../../i18n'
import { appStore } from '../../store'
import type { Debt, DebtCharge } from '../../types'
import { AmountInput } from '../ui/AmountInput'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { inputClass } from '../ui/formStyles'
import { toast } from '../ui/toastStore'

interface ChargeSheetProps {
  debt: Debt | null
  /** The entry to edit; `null` closes the sheet. */
  charge: DebtCharge | null
  currency: string
  onClose: () => void
}

/** Change or remove an amount added to a debt with no money moved. */
export function ChargeSheet({ debt, charge, currency, onClose }: ChargeSheetProps) {
  return (
    <BottomSheet open={charge !== null} onOpenChange={(open) => !open && onClose()} title={t.chargeSheet.title}>
      {debt && charge && <ChargeForm key={charge.id} debt={debt} charge={charge} currency={currency} onDone={onClose} />}
    </BottomSheet>
  )
}

function ChargeForm({ debt, charge, currency, onDone }: { debt: Debt; charge: DebtCharge; currency: string; onDone: () => void }) {
  const id = useId()
  const copy = t.chargeSheet
  const [amount, setAmount] = useState<number | null>(charge.amount)
  const [date, setDate] = useState(charge.date)
  const [note, setNote] = useState(charge.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const charges = debt.charges ?? []

  function save() {
    try {
      appStore.getState().updateDebt(debt.id, { charges: charges.map((c) => (c.id === charge.id ? { ...c, amount: amount ?? 0, date, note: note.trim() || undefined } : c)) })
      toast(copy.saved, { tone: 'good' })
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function remove() {
    appStore.getState().updateDebt(debt.id, { charges: charges.filter((c) => c.id !== charge.id) })
    onDone()
    toast(copy.deleted, { action: { label: t.common.undo, onClick: () => appStore.getState().updateDebt(debt.id, { charges }) } })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Field label={copy.amount} htmlFor={`${id}-amount`}>
        <AmountInput id={`${id}-amount`} value={amount} onChange={setAmount} currency={currency} />
      </Field>
      <Field label={copy.date} htmlFor={`${id}-date`}>
        <input id={`${id}-date`} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass()} />
      </Field>
      <Field label={copy.note} htmlFor={`${id}-note`}>
        <input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass()} />
      </Field>
      {error && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" icon={Trash2} onClick={remove} className="text-crit-ink">
          {copy.delete}
        </Button>
        <Button type="submit" block>
          {copy.save}
        </Button>
      </div>
    </form>
  )
}
