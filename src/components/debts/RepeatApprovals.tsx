import { CalendarClock } from 'lucide-react'
import { t } from '../../i18n'
import { todayISO } from '../../lib/dates'
import { dueRepeats } from '../../lib/debts'
import { formatMoney } from '../../lib/money'
import { appStore, useAppStore } from '../../store'
import type { ID } from '../../types'
import { toast } from '../ui/toastStore'

/** Months of repeating charges waiting for a yes or no. Nothing is added to a debt without one. */
export function RepeatApprovals({ debtId }: { debtId?: ID }) {
  const debts = useAppStore((s) => s.debts)
  const main = useAppStore((s) => s.profile.currency)
  const today = todayISO()
  const due = dueRepeats(debts, today).filter((d) => !debtId || d.debt.id === debtId)
  if (due.length === 0) return null
  const copy = t.debts

  return (
    <section aria-label={copy.approvalsTitle} className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold">
        <CalendarClock aria-hidden className="size-4 text-accent" />
        {copy.approvalsTitle}
      </h2>
      <ul className="divide-y divide-line">
        {due.map(({ debt, repeat, dueDate }) => {
          const money = formatMoney(repeat.amount, debt.currency ?? main)
          const answer = { debtId: debt.id, repeatId: repeat.id, dueDate }
          const undoable = (undo: () => void) => ({ action: { label: t.common.undo, onClick: undo } })
          return (
            <li key={`${repeat.id}-${dueDate}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0">
              <p className="min-w-0 flex-1 basis-48 text-sm font-semibold">{copy.repeatDue(repeat.name, money, debt.person, t.format.nearDay(dueDate, today))}</p>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  aria-label={copy.skipFor(repeat.name)}
                  onClick={() => toast(copy.repeatSkipped(repeat.name), undoable(appStore.getState().skipRepeat(answer)))}
                  className="min-h-9 rounded-lg border border-line px-3 text-sm font-bold text-ink-2 transition hover:bg-surface-2"
                >
                  {copy.skip}
                </button>
                <button
                  type="button"
                  aria-label={copy.addToDebtFor(repeat.name)}
                  onClick={() => toast(copy.repeatAdded(repeat.name, money), { tone: 'good', ...undoable(appStore.getState().approveRepeat(answer)) })}
                  className="min-h-9 rounded-lg bg-accent px-3 text-sm font-bold text-on-accent transition hover:brightness-110"
                >
                  {copy.addToDebt}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
