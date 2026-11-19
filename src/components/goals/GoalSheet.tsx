import { Archive, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { t } from '../../i18n'
import { monthlyRoomForGoal } from '../../lib/budget'
import { monthlyIncomes } from '../../lib/income'
import { monthlyDebtPayments } from '../../lib/debts'
import { planMonth, todayISO } from '../../lib/dates'
import { fundBill, fundDueDate } from '../../lib/funds'
import { goalSaved, goalSavedIn } from '../../lib/goals'
import { formatMoney } from '../../lib/money'
import { appStore, useAppStore } from '../../store'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { toast } from '../ui/toastStore'
import { draftToGoal, goalDraftErrors, hasErrors, type GoalDraft, type GoalDraftErrors } from './goalDraft'
import { GoalFields } from './GoalFields'

interface GoalSheetProps {
  /** The goal to edit or create; `null` closes the sheet. */
  draft: GoalDraft | null
  onClose: () => void
  /** After the goal is deleted, e.g. to leave its page. */
  onDeleted?: () => void
}

/** Add or edit a savings goal. Saves straight to the store. */
export function GoalSheet({ draft, onClose, onDeleted }: GoalSheetProps) {
  return (
    <BottomSheet
      open={draft !== null}
      onOpenChange={(open) => !open && onClose()}
      title={draft?.kind === 'fund' ? (draft.id ? t.funds.editTitle : t.funds.newTitle) : draft?.id ? t.goalSheet.editTitle : t.goalSheet.newTitle}
    >
      {draft && <GoalForm key={draft.id ?? 'new'} initial={draft} onDone={onClose} onDeleted={onDeleted} />}
    </BottomSheet>
  )
}

function GoalForm({ initial, onDone, onDeleted }: { initial: GoalDraft; onDone: () => void; onDeleted?: () => void }) {
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<GoalDraftErrors>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const goals = useAppStore((s) => s.goals)
  const transactions = useAppStore((s) => s.transactions)
  const profile = useAppStore((s) => s.profile)
  const bills = useAppStore((s) => s.bills)
  const debts = useAppStore((s) => s.debts)
  const incomes = useAppStore((s) => s.incomes)
  const { currency, salary } = profile
  const existing = draft.id ? goals.find((g) => g.id === draft.id) : undefined
  const fund = draft.kind === 'fund' ? (draft.billId ? { billId: draft.billId } : { repeat: draft.repeat }) : undefined
  const room = monthlyRoomForGoal(profile, bills, goals, { id: draft.id, fund }, monthlyDebtPayments(debts, transactions, currency), monthlyIncomes(incomes, currency))
  const copy = t.goalSheet
  const isFund = draft.kind === 'fund'
  const bill = existing ? fundBill(existing, bills) : undefined

  function save() {
    const nextErrors = goalDraftErrors(draft, { room, currency })
    if (hasErrors(nextErrors)) return setErrors(nextErrors)
    const store = appStore.getState()
    try {
      if (existing) {
        store.updateGoal(existing.id, draftToGoal(draft, existing))
        toast(isFund ? t.funds.saved : copy.saved, { tone: 'good' })
      } else {
        const goal = store.addGoal(draftToGoal(draft))
        toast(isFund ? t.funds.added(goal.name) : copy.added(goal.name), { tone: 'good' })
      }
      onDone()
    } catch (error) {
      setErrors({ form: (error as Error).message })
    }
  }

  function finish() {
    if (!existing) return
    const { id, name } = existing
    appStore.getState().updateGoal(id, { archived: true })
    onDone()
    toast((isFund ? t.funds.finished : copy.finished)(name), { action: { label: t.common.undo, onClick: () => appStore.getState().updateGoal(id, { archived: false }) } })
  }

  function remove() {
    if (!existing) return
    const { id, name } = existing
    appStore.getState().deleteGoal(id)
    onDone()
    onDeleted?.()
    toast(copy.deleted(name), { action: { label: t.common.undo, onClick: () => appStore.getState().restoreGoal(id) } })
  }

  const saved = existing ? goalSaved(existing, transactions) : 0

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <GoalFields
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        errors={errors}
        currency={currency}
        salary={salary}
        room={room}
        showIdeas={!existing}
        showIconPicker
        showKind={!existing}
        tracked={existing ? goalSaved({ id: existing.id }, transactions) : 0}
        billName={bill?.name}
        billDue={existing && bill ? fundDueDate(existing, todayISO(), { bills, transactions, salary }) : undefined}
        slotsNow={existing && goalSavedIn(existing.id, transactions, planMonth(todayISO(), salary)) > 0 ? 0 : 1}
      />
      {errors.form && (
        <p role="alert" className="text-sm font-semibold text-crit-ink">
          {errors.form}
        </p>
      )}
      <Button type="submit" block size="lg">
        {isFund ? t.funds.save : copy.save}
      </Button>
      {existing && (
        <div className="flex flex-wrap justify-center gap-2">
          {!existing.archived && (
            <Button variant="ghost" size="sm" icon={Archive} onClick={finish}>
              {isFund ? t.funds.finish : copy.finish}
            </Button>
          )}
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => (saved > 0 ? setConfirmingDelete(true) : remove())} className="text-crit-ink">
            {copy.delete}
          </Button>
        </div>
      )}
      {existing && (
        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={copy.deleteTitle(existing.name)}
          body={copy.deleteBody(formatMoney(saved, currency))}
          confirmLabel={isFund ? t.funds.deleteConfirm : copy.deleteConfirm}
          onConfirm={remove}
        />
      )}
    </form>
  )
}
