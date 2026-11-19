import { PiggyBank } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { t } from '../../i18n'
import { fundsToPutAside } from '../../lib/budget'
import { planMonth } from '../../lib/dates'
import { formatMoney, sumAmounts } from '../../lib/money'
import { appStore, useAppStore } from '../../store'
import { fundsSnoozedFor, snoozeFunds } from '../../store/deviceState'
import { Button } from '../ui/Button'
import { toast } from '../ui/toastStore'

/**
 * Home's nudge to fill the funds: what each still needs this month, put aside in one tap from the
 * salary's wallet. "Not now" puts it off until next month.
 */
export function FundsDueCard({ today }: { today: string }) {
  const data = useAppStore(useShallow((s) => ({ goals: s.goals, transactions: s.transactions, bills: s.bills, profile: s.profile })))
  const month = planMonth(today, data.profile.salary).start
  const [snoozed, setSnoozed] = useState(fundsSnoozedFor)
  const due = useMemo(() => fundsToPutAside(data, today), [data, today])
  if (due.length === 0 || snoozed === month) return null

  const money = (amount: number) => formatMoney(amount, data.profile.currency)
  const total = sumAmounts(due.map((d) => d.amount))
  const copy = t.funds

  function putAside() {
    try {
      const undo = appStore.getState().putAside(
        due.map((d) => ({ goalId: d.goal.id, amount: d.amount })),
        data.profile.salary.accountId,
        today,
      )
      toast(copy.dueDone(money(total)), { tone: 'good', action: { label: t.common.undo, onClick: undo } })
    } catch (error) {
      toast((error as Error).message, { tone: 'crit' })
    }
  }

  return (
    <section className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <PiggyBank aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-bold">{copy.dueTitle}</h2>
        <p className="text-sm text-muted">{copy.dueBody(money(total))}</p>
        <ul className="mt-2 space-y-0.5 text-sm">
          {due.map(({ goal, amount }) => (
            <li key={goal.id} className="flex justify-between gap-3">
              <span className="truncate font-semibold text-ink-2">{goal.name}</span>
              <span className="shrink-0 tabular-nums">{money(amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" icon={PiggyBank} onClick={putAside}>
            {copy.dueAction(money(total))}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              snoozeFunds(month)
              setSnoozed(month)
            }}
          >
            {copy.notNow}
          </Button>
        </div>
      </div>
    </section>
  )
}
