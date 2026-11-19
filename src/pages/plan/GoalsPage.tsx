import { Plus, Target } from 'lucide-react'
import { ChevronRight } from '../../components/ui/directionalIcons'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { SumBand, SumBar, SumCell } from '../../components/desk/Panel'
import { GoalsGrid } from '../../components/desk/PlanTables'
import { newGoalDraft, type GoalDraft } from '../../components/goals/goalDraft'
import { GoalSheet } from '../../components/goals/GoalSheet'
import { GoalStatusChip } from '../../components/goals/GoalStatusChip'
import { openTransactionSheet } from '../../components/transactions/sheetStore'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { SummarySplit } from '../../components/ui/SummarySplit'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { t } from '../../i18n'
import { planMonth, todayISO } from '../../lib/dates'
import { goalSaved, goalViews, progressPercent, suggestedContribution, type GoalView } from '../../lib/goals'
import { live } from '../../lib/id'
import { formatMoney, sumAmounts } from '../../lib/money'
import { useAppStore } from '../../store'

export function GoalsPage() {
  const [params, setParams] = useSearchParams()
  const { goals, transactions, profile, bills } = useAppStore(useShallow((s) => ({ goals: s.goals, transactions: s.transactions, profile: s.profile, bills: s.bills })))
  const [draft, setDraft] = useState<GoalDraft | null>(null)
  const desktop = useIsDesktop()
  const today = todayISO()
  const { start, end } = planMonth(today, profile.salary)
  const views = useMemo(
    () => goalViews(goals, transactions, { start, end }, today, profile.salary, bills),
    [goals, transactions, start, end, today, profile.salary, bills],
  )
  const goalList = views.filter((v) => !v.goal.fund)
  const fundList = views.filter((v) => v.goal.fund)
  const finished = live(goals).filter((g) => g.archived)
  const money = (amount: number) => formatMoney(amount, profile.currency)
  const goalLine = (view: GoalView) => planLine(view, money, today)
  const copy = t.goals

  // "Add a goal" from the + sheet links here with ?add=1.
  useEffect(() => {
    if (!params.has('add')) return
    setDraft(newGoalDraft())
    setParams({}, { replace: true })
  }, [params, setParams])

  const addButton = (
    <Button variant="secondary" icon={Plus} onClick={() => setDraft(newGoalDraft())}>
      {copy.add}
    </Button>
  )
  const addFundButton = (
    <Button variant="secondary" icon={Plus} onClick={() => setDraft(newGoalDraft('fund'))}>
      {t.funds.add}
    </Button>
  )
  const sheet = <GoalSheet draft={draft} onClose={() => setDraft(null)} />

  if (views.length === 0 && finished.length === 0) {
    return (
      <>
        <EmptyState
          icon={Target}
          title={copy.emptyTitle}
          body={copy.emptyBody}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {addButton}
              {addFundButton}
            </div>
          }
        />
        {sheet}
      </>
    )
  }

  const saved = sumAmounts(views.map((v) => v.forecast.saved))
  const planned = sumAmounts(views.map((v) => v.goal.monthlyContribution))
  const thisCycle = sumAmounts(views.map((v) => v.savedThisCycle))
  const finishedList = finished.length > 0 && (
    <section className="mt-6 desk:mt-0">
      <h2 className="mb-2 text-sm font-extrabold desk:mb-3 desk:text-base">{copy.finishedTitle}</h2>
      <ul className="rounded-2xl border border-line bg-surface p-1 desk:grid desk:gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(3, finished.length)}, minmax(0, 1fr))` }}>
        {finished.map((goal) => (
          <li key={goal.id}>
            <Link to={`/plan/goals/${goal.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2 desk:size-9">
                <Icon name={goal.icon} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{goal.name}</span>
                <span className="block text-sm text-muted">{copy.savedOf(money(goalSaved(goal, transactions)), money(goal.target))}</span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )

  if (desktop) {
    const target = sumAmounts(views.map((v) => v.goal.target))
    const toSave = sumAmounts(views.map((v) => v.forecast.remaining))
    return (
      <div className="space-y-6">
        <SumBand label={copy.summaryLabel} bar={target > 0 && <SumBar share={saved / target} fill="bg-good" rest="bg-surface-2" />}>
          <SumCell label={copy.totalTarget} value={money(target)} note={copy.inProgress(views.length)} />
          <SumCell sign="−" label={fundList.length > 0 ? t.funds.summaryLabel : copy.summaryLabel} value={money(saved)} tone="good" note={planned > 0 ? copy.thisCycle(money(thisCycle), money(planned)) : copy.thisCycleNoPlan(money(thisCycle))} />
          <SumCell sign="=" label={copy.stillToSave} value={money(toSave)} tone="accent" note={target > 0 ? copy.shareSaved(`${Math.round(Math.min(1, saved / target) * 100)}%`) : undefined} />
        </SumBand>
        <GoalsGrid title={t.plan.goals} views={goalList} money={money} lineFor={goalLine} onPutAside={(goalId) => openTransactionSheet('goal', { goalId })} addLabel={copy.add} onAdd={() => setDraft(newGoalDraft())} />
        {fundList.length > 0 ? (
          <GoalsGrid title={t.funds.title} views={fundList} money={money} lineFor={goalLine} onPutAside={(goalId) => openTransactionSheet('goal', { goalId })} addLabel={t.funds.add} onAdd={() => setDraft(newGoalDraft('fund'))} />
        ) : (
          <FundsIntro action={addFundButton} />
        )}
        {finishedList}
        {sheet}
      </div>
    )
  }

  return (
    <>
      <SummarySplit
        summary={
          <Card>
            <p className="text-sm font-semibold text-muted">{fundList.length > 0 ? t.funds.summaryLabel : copy.summaryLabel}</p>
            <p className="text-2xl font-extrabold tracking-tight">{money(saved)}</p>
            {planned > 0 && <ProgressBar value={thisCycle / planned} tone="good" label={copy.thisCycleLabel} className="mt-3" />}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">{planned > 0 ? copy.thisCycle(money(thisCycle), money(planned)) : copy.thisCycleNoPlan(money(thisCycle))}</p>
              {addButton}
            </div>
          </Card>
        }
      >
        {goalList.length > 0 && (
          <ul className="mt-3 grid gap-3 xl:grid-cols-2">
            {goalList.map((view) => (
              <li key={view.goal.id}>
                <GoalCard view={view} money={money} today={today} />
              </li>
            ))}
          </ul>
        )}

        <section className="mt-6">
          {fundList.length > 0 ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-sm font-extrabold">{t.funds.title}</h2>
                {addFundButton}
              </div>
              <ul className="grid gap-3 xl:grid-cols-2">
                {fundList.map((view) => (
                  <li key={view.goal.id}>
                    <GoalCard view={view} money={money} today={today} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <FundsIntro action={addFundButton} />
          )}
        </section>

        {finishedList}
      </SummarySplit>
      {sheet}
    </>
  )
}

/** No funds yet: what they're for, and how to add one. */
function FundsIntro({ action }: { action: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-4 desk:flex desk:items-center desk:justify-between desk:gap-6">
      <div className="min-w-0">
        <h2 className="text-sm font-extrabold desk:text-base">{t.funds.title}</h2>
        <p className="mt-1 text-[0.9375rem] text-ink-2">{t.funds.intro}</p>
      </div>
      <div className="mt-3 shrink-0 desk:mt-0">{action}</div>
    </div>
  )
}

/** A fund: in season, what's left in it; otherwise whether it'll be ready for its next date. */
function fundLine({ goal, forecast, status, due, season, dueNow }: GoalView, money: (amount: number) => string, today: string): string {
  const copy = t.funds
  if (season && season <= today && forecast.saved > 0) return copy.inSeason(money(forecast.saved))
  if (!due) return copy.noDate
  const date = t.format.date(due)
  if (dueNow) return copy.dueNow(date, money(forecast.remaining))
  if (status === 'reached') return copy.readyFor(date)
  if (goal.monthlyContribution > 0 && status !== 'behind' && status !== 'overdue') return copy.pace(money(goal.monthlyContribution), date)
  return forecast.neededPerMonth !== null ? copy.needs(date, money(suggestedContribution(forecast.neededPerMonth))) : t.goals.noPlan
}

/** On track: when the planned amount gets there. Behind, or no amount yet: what the deadline needs. */
function planLine(view: GoalView, money: (amount: number) => string, today: string): string {
  const { goal, forecast, status } = view
  if (goal.fund) return fundLine(view, money, today)
  const copy = t.goals
  return status === 'reached'
    ? copy.reached
    : status === 'overdue'
      ? copy.deadlineWas(t.format.monthYear(goal.deadline!))
      : forecast.projectedDate && goal.monthlyContribution > 0 && status !== 'behind'
        ? copy.pace(money(goal.monthlyContribution), t.format.monthYear(forecast.projectedDate))
        : goal.deadline && forecast.neededPerMonth !== null
          ? copy.byDeadline(t.format.monthYear(goal.deadline), money(suggestedContribution(forecast.neededPerMonth)))
          : copy.noPlan
}

function GoalCard({ view, money, today }: { view: GoalView; money: (amount: number) => string; today: string }) {
  const { goal, forecast, status, savedThisCycle } = view
  const copy = t.goals
  const line = planLine(view, money, today)

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <Link to={`/plan/goals/${goal.id}`} className="-m-2 block rounded-xl p-2 transition-colors hover:bg-surface-2">
        <span className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Icon name={goal.icon} className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{goal.name}</span>
            <span className="block text-sm font-semibold tabular-nums text-ink-2">{copy.savedOf(money(forecast.saved), money(goal.target))}</span>
          </span>
          <GoalStatusChip status={status} fund={!!goal.fund} />
        </span>
        <ProgressBar value={forecast.progress} tone={status === 'behind' ? 'warn' : status === 'overdue' ? 'crit' : 'good'} label={copy.progressLabel(goal.name)} className="mt-3" />
        {status !== 'reached' && (
          <span className="mt-1.5 block text-sm text-muted">{copy.toGo(progressPercent(forecast), money(forecast.remaining))}</span>
        )}
        <span className="mt-0.5 block text-sm text-muted">{line}</span>
      </Link>
      {status !== 'reached' && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="min-w-0 text-sm text-muted">{savedThisCycle !== 0 && copy.cycleSoFar(money(savedThisCycle))}</span>
          <Button
            size="sm"
            icon={Plus}
            onClick={() => openTransactionSheet('goal', { goalId: goal.id })}
            aria-label={copy.putAsideFor(goal.name)}
            className="shrink-0 whitespace-nowrap"
          >
            {copy.putAside}
          </Button>
        </div>
      )}
    </div>
  )
}
