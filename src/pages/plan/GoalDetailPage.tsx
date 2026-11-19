import { Coins, Minus, Pencil, Plus, ShoppingBag, Target, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { ExportButton } from '../../components/ExportButton'
import { goalToDraft, type GoalDraft } from '../../components/goals/goalDraft'
import { GoalSheet } from '../../components/goals/GoalSheet'
import { GoalStatusChip } from '../../components/goals/GoalStatusChip'
import { openTransactionSheet } from '../../components/transactions/sheetStore'
import { TransactionRow } from '../../components/transactions/TransactionRow'
import { Button, IconButton } from '../../components/ui/Button'
import { buttonClass } from '../../components/ui/buttonStyles'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { PageHeader } from '../../components/ui/PageHeader'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { SummarySplit } from '../../components/ui/SummarySplit'
import { toast } from '../../components/ui/toastStore'
import { t } from '../../i18n'
import { planMonth, todayISO } from '../../lib/dates'
import { goalWorkbook } from '../../lib/export/pages'
import { fundBill } from '../../lib/funds'
import { goalView, progressPercent, suggestedContribution } from '../../lib/goals'
import { live } from '../../lib/id'
import { formatMoney } from '../../lib/money'
import { newestFirst } from '../../lib/transactions'
import { appStore, useAppStore } from '../../store'
import type { Goal } from '../../types'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-sm font-semibold text-ink-2">{label}</dt>
      <dd className="text-end font-bold tabular-nums">{children}</dd>
    </div>
  )
}

export function GoalDetailPage() {
  const { goalId } = useParams()
  const navigate = useNavigate()
  const { goals, debts, transactions, categories, accounts, profile, bills } = useAppStore(
    useShallow((s) => ({ goals: s.goals, debts: s.debts, transactions: s.transactions, categories: s.categories, accounts: s.accounts, profile: s.profile, bills: s.bills })),
  )
  const [draft, setDraft] = useState<GoalDraft | null>(null)
  const names = useMemo(() => ({ categories, accounts, goals, debts }), [categories, accounts, goals, debts])
  const history = useMemo(() => live(transactions).filter((tx) => tx.goalId === goalId).sort(newestFirst), [transactions, goalId])
  const goal = live(goals).find((g) => g.id === goalId)
  const copy = t.goalPage
  const sheet = <GoalSheet draft={draft} onClose={() => setDraft(null)} onDeleted={() => navigate('/plan/goals', { replace: true })} />

  if (!goal) {
    return (
      <div className="max-w-xl">
        <PageHeader title={copy.notFoundTitle} backTo="/plan/goals" showSettings={false} />
        <EmptyState
          icon={Target}
          title={copy.notFoundTitle}
          body={copy.notFoundBody}
          action={
            <Link to="/plan/goals" className={buttonClass()}>
              {copy.backToGoals}
            </Link>
          }
        />
        {sheet}
      </div>
    )
  }

  const today = todayISO()
  const money = (amount: number) => formatMoney(amount, profile.currency)
  const { forecast, status, due, season, dueNow, savedThisCycle: thisCycle } = goalView(goal, transactions, planMonth(today, profile.salary), today, profile.salary, bills)
  const saved = forecast.saved
  const reached = status === 'reached'
  const suggestion = forecast.neededPerMonth !== null ? suggestedContribution(forecast.neededPerMonth) : null
  const active = !goal.archived
  const isFund = !!goal.fund
  const fundCopy = t.funds
  const bill = fundBill(goal, bills)
  // A fund planning more than it now needs, after a catch-up year: say what's enough.
  const ahead = isFund && active && status === 'on-track' && suggestion !== null && suggestion < goal.monthlyContribution
  const inSeason = !!season && season <= today && saved > 0

  /** Either change can be refused when the monthly amount no longer fits the salary after bills and the other goals. */
  function tryUpdate(patch: Partial<Pick<Goal, 'monthlyContribution' | 'archived'>>, message: string) {
    if (!goal) return
    try {
      appStore.getState().updateGoal(goal.id, patch)
      toast(message, { tone: 'good' })
    } catch (error) {
      toast((error as Error).message, { tone: 'crit' })
    }
  }

  const applySuggestion = () => suggestion !== null && tryUpdate({ monthlyContribution: suggestion }, copy.updated)
  const restore = () => goal && tryUpdate({ archived: false }, copy.restored(goal.name))

  return (
    <div className="max-w-xl lg:max-w-none">
      <PageHeader
        title={goal.name}
        subtitle={isFund ? fundCopy.subtitle : t.plan.goals}
        backTo="/plan/goals"
        showSettings={false}
        actions={
          <>
            <ExportButton workbook={() => goalWorkbook(appStore.getState(), today, goal)} />
            <IconButton icon={Pencil} label={isFund ? fundCopy.edit : copy.edit} onClick={() => setDraft(goalToDraft(goal))} />
          </>
        }
      />

      <SummarySplit
        summary={
          <>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <Icon name={goal.icon} className="size-6" />
                </span>
                <GoalStatusChip status={status} finished={!active} fund={isFund} />
              </div>
              <p className="mt-3 text-sm font-semibold text-muted">{copy.saved}</p>
              <p className="text-3xl font-extrabold tracking-tight tabular-nums">{money(saved)}</p>
              <p className="text-sm text-muted">{copy.ofTarget(money(goal.target))}</p>
              <ProgressBar value={forecast.progress} tone="good" label={t.goals.progressLabel(goal.name)} className="mt-3" />
              <p className="mt-1.5 text-sm text-muted">
                {inSeason
                  ? fundCopy.inSeason(money(saved))
                  : dueNow && due
                    ? fundCopy.dueNow(t.format.date(due), money(forecast.remaining))
                    : reached
                    ? isFund && due
                      ? fundCopy.readyFor(t.format.date(due))
                      : t.goals.reached
                    : t.goals.toGo(progressPercent(forecast), money(forecast.remaining))}
              </p>
              {active ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button icon={Plus} onClick={() => openTransactionSheet('goal', { goalId: goal.id })}>
                    {t.goals.putAside}
                  </Button>
                  <Button variant="secondary" icon={Minus} disabled={saved <= 0} onClick={() => openTransactionSheet('goal', { goalId: goal.id, withdraw: true })}>
                    {t.goals.takeOut}
                  </Button>
                  {/* A bill's fund pays its bill by itself; any other fund is spent from here or from the + sheet. */}
                  {isFund && !goal.fund?.billId && saved > 0 && (
                    <Button variant={inSeason ? 'primary' : 'secondary'} icon={ShoppingBag} className="col-span-2" onClick={() => openTransactionSheet('expense', { goalId: goal.id })}>
                      {fundCopy.spend}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <p className="mt-3 text-[0.9375rem] text-ink-2">{isFund ? fundCopy.finishedNote : copy.finishedNote}</p>
                  <Button variant="secondary" className="mt-3" onClick={restore}>
                    {isFund ? fundCopy.restore : copy.restore}
                  </Button>
          </>
        )}
      </Card>

      {/* A fund past its date is a bill still to pay: that shows on Bills, so there's nothing to move here. */}
      {active && (status === 'behind' || (status === 'overdue' && !isFund)) && suggestion !== null && (
        <div role="note" className="mt-3 flex gap-3 rounded-2xl bg-warn-soft p-4 text-warn-ink">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-semibold">
              {status === 'overdue'
                ? copy.overdue(money(forecast.remaining))
                : isFund
                  ? fundCopy.catchUp(money(suggestion), t.format.date(due!))
                  : copy.catchUp(money(suggestion), t.format.monthYear(due!))}
            </p>
            {status === 'overdue' ? (
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => setDraft(goalToDraft(goal))}>
                {copy.edit}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" className="mt-3" onClick={applySuggestion}>
                {copy.useAmount(money(suggestion))}
              </Button>
            )}
          </div>
        </div>
      )}

      {ahead && due && (
        <div role="note" className="mt-3 rounded-2xl bg-surface-2 p-4">
          <p className="text-[0.9375rem] font-semibold text-ink-2">{fundCopy.ahead(money(suggestion!), t.format.date(due))}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={applySuggestion}>
            {copy.useAmount(money(suggestion!))}
          </Button>
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-extrabold">{copy.planTitle}</h2>
        <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
          <Row label={copy.eachMonth}>{goal.monthlyContribution > 0 ? copy.perMonth(money(goal.monthlyContribution)) : copy.notSet}</Row>
          {!reached && (
            <Row label={copy.atThisPace}>{forecast.projectedDate ? copy.by(t.format.monthYear(forecast.projectedDate)) : copy.noPace}</Row>
          )}
          {isFund ? (
            <>
              <Row label={fundCopy.nextNeeded}>{due ? t.format.date(due) : fundCopy.noDate}</Row>
              {goal.fund?.billId ? (
                <Row label={fundCopy.bill}>
                  {bill ? (
                    <Link to="/plan/bills" className="text-accent underline-offset-2 hover:underline">
                      {bill.name}
                    </Link>
                  ) : (
                    fundCopy.billGone
                  )}
                </Row>
              ) : (
                <Row label={fundCopy.repeatsRow}>{fundCopy.repeatNames[goal.fund?.repeat ?? 'yearly']}</Row>
              )}
            </>
          ) : (
            <Row label={copy.deadline}>{goal.deadline ? t.format.date(goal.deadline) : copy.noDeadline}</Row>
          )}
          {!reached && suggestion !== null && <Row label={copy.needed}>{copy.perMonth(money(suggestion))}</Row>}
          <Row label={copy.thisCycle}>{money(thisCycle)}</Row>
        </dl>
      </section>
          </>
        }
      >
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-extrabold">{copy.history}</h2>
          {history.length > 0 || goal.startingAmount ? (
            <ul className="rounded-2xl border border-line bg-surface p-1">
              {history.map((tx) => (
                <li key={tx.id}>
                  <TransactionRow transaction={tx} names={names} currency={profile.currency} inGoal dated />
                </li>
              ))}
              {!!goal.startingAmount && (
                <li className="flex items-center gap-3 px-2 py-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                    <Coins aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{copy.startedWith}</span>
                    <span className="block truncate text-sm text-muted">{copy.beforeTracking}</span>
                  </span>
                  <span className="shrink-0 font-extrabold tabular-nums text-good-ink">{formatMoney(goal.startingAmount, profile.currency, { signed: true })}</span>
                </li>
              )}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[0.9375rem] text-ink-2">{copy.noHistory}</p>
          )}
        </section>
      </SummarySplit>

      {sheet}
    </div>
  )
}
